package flowscheduler

import (
	"context"
	"errors"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/cws"
	"open-kraken/backend/go/internal/estimator"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/stepLease"
	"open-kraken/backend/go/internal/verifier"
)

// tick pulls up to BatchSize pending Steps and attempts to dispatch each.
// One tick is synchronous: Steps are processed sequentially so that the
// executor implementation can share per-tick state (e.g. a shared provider
// client) without extra synchronisation. Parallelism is introduced later,
// once CWS routing decisions exist.
func (s *Scheduler) tick(ctx context.Context) error {
	steps, err := s.ledger.PendingSteps(ctx, s.cfg.TenantID, s.cfg.BatchSize)
	if err != nil {
		return fmt.Errorf("pending steps: %w", err)
	}
	for _, step := range steps {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err := s.dispatchStep(ctx, step); err != nil {
			// dispatchStep logs its own failures; we keep going so one
			// bad Step does not stall the tick.
			s.errorf("dispatch step", "step_id", step.ID, "error", err.Error())
		}
	}
	return nil
}

// dispatchStep runs the full per-Step pipeline. It returns non-nil only on
// unexpected errors; lease conflicts, budget exhaustion, and executor
// failures are handled inline and recorded in AEL + metrics.
func (s *Scheduler) dispatchStep(ctx context.Context, step ael.Step) error {
	// 1. Acquire Step Lease (etcd CAS or in-memory equivalent).
	handle, err := s.leases.Acquire(ctx, step.ID, s.cfg.NodeID, s.cfg.LeaseTTL)
	if err != nil {
		if errors.Is(err, stepLease.ErrAlreadyHeld) {
			// Another scheduler holds it; this tick skips silently.
			return nil
		}
		return fmt.Errorf("lease acquire: %w", err)
	}

	// 1a. CWS arm selection (optional). Runs only when the Step was
	// submitted without a Provider — caller-pinned arms bypass CWS.
	handled, err := s.selectArmIfNeeded(ctx, &step, handle)
	if err != nil {
		return err
	}
	if handled {
		// The Step has already been moved to a terminal state by the
		// selector path (failed due to missing selector / no candidates
		// / Pick error). Lease is released and propagation was fired
		// inside selectArmIfNeeded.
		return nil
	}

	// 2. Obtain an AgentInstance — reuse an idle one of the same
	// (agent_type, provider, tenant), otherwise spawn.
	inst := s.pool.AcquireIdle(step.AgentType, step.Provider, step.TenantID)
	if inst == nil {
		spawned, spawnErr := s.pool.Spawn(step.AgentType, step.Provider, step.TenantID, "")
		if spawnErr != nil {
			_ = s.leases.Release(ctx, handle)
			return fmt.Errorf("spawn instance: %w", spawnErr)
		}
		inst = spawned
	}

	// 3. T1 lease mirror + budget debit. Estimator fills
	// EstimatedTokens when configured; otherwise T1 skips the budget
	// check (zero is the unbounded sentinel).
	estimatedTokens := s.estimateTokens(step)
	if err := s.ledger.LeaseMirror(ctx, ael.T1LeaseMirrorInput{
		StepID:          step.ID,
		RunID:           step.RunID,
		NodeID:          s.cfg.NodeID,
		InstanceID:      inst.ID(),
		LeaseExpiresAt:  handle.ExpiresAt,
		EstimatedTokens: estimatedTokens,
	}); err != nil {
		if errors.Is(err, ael.ErrBudgetExhausted) {
			s.infof("budget exhausted; cancelling step",
				"step_id", step.ID, "run_id", step.RunID)
			// Cancel the pending-class Step. Best effort: if the Step
			// already moved (e.g. another scheduler raced to leased),
			// the FSM will reject the transition and we simply release.
			if cancelErr := s.ledger.CancelStep(ctx, step.ID); cancelErr != nil {
				s.errorf("cancel step", "step_id", step.ID, "error", cancelErr.Error())
			}
			_ = s.leases.Release(ctx, handle)
			s.recordTerminal(step, ael.StepCancelled)
			return nil
		}
		_ = s.leases.Release(ctx, handle)
		return fmt.Errorf("lease mirror: %w", err)
	}

	// 3a. Drive parent Run and Flow toward running. Best-effort — a
	// failure here should not block the Step; the scheduler will keep
	// executing and the next tick can repair state.
	if err := s.ledger.EnsureRunRunning(ctx, step.RunID); err != nil {
		s.errorf("ensure run running", "run_id", step.RunID, "error", err.Error())
	}
	if err := s.ledger.EnsureFlowRunning(ctx, step.FlowID, s.cfg.NodeID); err != nil {
		s.errorf("ensure flow running", "flow_id", step.FlowID, "error", err.Error())
	}

	// 4. Advance Step and AgentInstance to running.
	if err := s.ledger.MarkStepRunning(ctx, step.ID); err != nil {
		_ = s.leases.Release(ctx, handle)
		return fmt.Errorf("mark running: %w", err)
	}
	if err := inst.AssignStep(step.ID); err != nil {
		// The AgentInstance FSM refused the assignment. This is a bug
		// somewhere — treat the Step as failed so we don't wedge.
		_ = s.completeFailed(ctx, step, "instance refused assignment: "+err.Error())
		_ = s.leases.Release(ctx, handle)
		s.recordTerminal(step, ael.StepFailed)
		s.recordReward(ctx, step, false, 0, 0, 0, verifier.NoSignal)
		s.propagateTerminal(ctx, step)
		return fmt.Errorf("assign step: %w", err)
	}

	// 4a. Start the keepalive goroutine before handing the Step to the
	// executor. It extends the etcd lease every KeepaliveInterval and
	// mirrors the new expiry into AEL via T3. Stopping the ticker is
	// tied to keepaliveCancel — every exit path below calls it.
	keepaliveCtx, keepaliveCancel := context.WithCancel(ctx)
	keepaliveDone := s.startKeepalive(keepaliveCtx, handle, step.ID)
	defer func() {
		keepaliveCancel()
		if keepaliveDone != nil {
			<-keepaliveDone
		}
	}()

	// 5. Execute under a bounded context.
	execCtx, execCancel := context.WithTimeout(ctx, s.cfg.ExecutionTimeout)
	start := time.Now()
	res, execErr := s.executor.Execute(execCtx, ExecutionRequest{Step: step, Instance: inst})
	execCancel()

	// 6. T2 commit — every executor outcome ends here, including failures.
	if execErr != nil {
		s.handleExecutorFailure(ctx, step, execErr.Error(), 0, 0, int(time.Since(start)/time.Millisecond))
		_ = returnInstanceIdle(inst)
		_ = s.leases.Release(ctx, handle)
		return nil
	}

	if res.FinalState != ael.StepSucceeded && res.FinalState != ael.StepFailed {
		// Defensive: executors must pick one of the two terminal states.
		// Record it as failed rather than corrupting the FSM.
		s.handleExecutorFailure(ctx, step,
			"executor returned non-terminal final_state: "+string(res.FinalState),
			res.TokensUsed, res.CostUSD,
			int(time.Since(start)/time.Millisecond))
		_ = returnInstanceIdle(inst)
		_ = s.leases.Release(ctx, handle)
		return nil
	}

	// Ensure any SideEffects carry the scheduler-provided identity fields
	// so T2's INSERT has no NULLs on non-nullable columns.
	for i := range res.SideEffects {
		if res.SideEffects[i].StepID == "" {
			res.SideEffects[i].StepID = step.ID
		}
		if res.SideEffects[i].RunID == "" {
			res.SideEffects[i].RunID = step.RunID
		}
		if res.SideEffects[i].TenantID == "" {
			res.SideEffects[i].TenantID = step.TenantID
		}
	}

	t2Start := time.Now()
	commitErr := s.ledger.CompleteStep(ctx, ael.StepCompletionInput{
		StepID:        step.ID,
		RunID:         step.RunID,
		FinalState:    res.FinalState,
		TokensUsed:    res.TokensUsed,
		CostUSD:       res.CostUSD,
		DurationMS:    durationMSOrMeasured(res.DurationMS, start),
		OutputRef:     res.OutputRef,
		EventStream:   res.EventStream,
		FailureReason: res.FailureReason,
		SideEffects:   res.SideEffects,
	})
	if s.metrics != nil {
		s.metrics.ObserveWALWrite(time.Since(t2Start))
	}
	if commitErr != nil {
		// T2 commit failed. We cannot leave the Step in limbo: the
		// caller's best recovery is to release the lease so T4 eventually
		// returns the Step to pending. The etcd watch will see the
		// revocation as a lease end event.
		_ = returnInstanceIdle(inst)
		_ = s.leases.Release(ctx, handle)
		return fmt.Errorf("t2 commit: %w", commitErr)
	}

	_ = returnInstanceIdle(inst)
	_ = s.leases.Release(ctx, handle)

	if res.FinalState == ael.StepSucceeded && res.CostUSD > 0 && s.metrics != nil {
		s.metrics.ProviderCostUSDTotal.
			WithLabelValues(step.Provider, step.TenantID).
			Add(res.CostUSD)
	}
	s.recordTerminal(step, res.FinalState)

	// 6a. VerificationCallback (paper §5.2.2). Runs only for
	// VERIFIABLE regimes; returns verifier.NoSignal otherwise, which
	// the RewardModel collapses back to the success indicator.
	verifierSignal := s.verifyIfApplicable(ctx, step, res)

	s.recordReward(ctx, step,
		res.FinalState == ael.StepSucceeded,
		res.TokensUsed, res.CostUSD,
		durationMSOrMeasured(res.DurationMS, start),
		verifierSignal,
	)

	// 6b. Retry path for executor-reported failures. The Step already
	// committed to 'failed' via T2; we create a chained retry Step
	// that CountStepsByFlow will recognise as the new leaf, keeping
	// Flow/Run in running state. On permanent failures or exhausted
	// budget this is a no-op and we fall through to propagateTerminal.
	if res.FinalState == ael.StepFailed && s.enqueueRetryIfApproved(ctx, step, res.FailureReason) {
		return nil
	}

	// 7. Propagate terminal state up the hierarchy. Best-effort; a
	// failure here is logged but must not stall the scheduler.
	s.propagateTerminal(ctx, step)
	return nil
}

// propagateTerminal tries to finalize the parent Flow (and, if the Flow
// finalized, the parent Run). All errors are logged but not returned so a
// single bad Step does not wedge the loop.
func (s *Scheduler) propagateTerminal(ctx context.Context, step ael.Step) {
	flowFinalized, err := s.ledger.TryFinalizeFlow(ctx, step.FlowID)
	if err != nil {
		s.errorf("try finalize flow", "flow_id", step.FlowID, "error", err.Error())
		return
	}
	if !flowFinalized {
		return
	}
	runID := step.RunID
	if runID == "" {
		id, err := s.ledger.FlowRunID(ctx, step.FlowID)
		if err != nil {
			s.errorf("flow run id", "flow_id", step.FlowID, "error", err.Error())
			return
		}
		runID = id
	}
	if _, err := s.ledger.TryFinalizeRun(ctx, runID); err != nil {
		s.errorf("try finalize run", "run_id", runID, "error", err.Error())
	}
}

// completeFailed is the error-path shortcut: it calls T2 with FinalState =
// StepFailed and a reason string. Returns the T2 error (if any) so callers
// can log it.
func (s *Scheduler) completeFailed(ctx context.Context, step ael.Step, reason string) error {
	err := s.ledger.CompleteStep(ctx, ael.StepCompletionInput{
		StepID:        step.ID,
		RunID:         step.RunID,
		FinalState:    ael.StepFailed,
		FailureReason: reason,
	})
	if err != nil {
		s.errorf("complete failed", "step_id", step.ID, "error", err.Error())
	}
	return err
}

// returnInstanceIdle transitions an AgentInstance back to idle. Best-effort:
// if the instance has already moved (e.g. suspended by a policy handler)
// the FSM will reject, which we swallow so the scheduler loop keeps going.
func returnInstanceIdle(inst *instance.AgentInstance) error {
	if inst == nil {
		return nil
	}
	return inst.CompleteStep()
}

// recordTerminal bumps the per-Step Prometheus counter.
func (s *Scheduler) recordTerminal(step ael.Step, state ael.StepState) {
	if s.metrics == nil {
		return
	}
	s.metrics.AgentStepsTotal.
		WithLabelValues(
			orUnknown(step.Provider),
			orUnknown(step.WorkloadClass),
			orUnknown(string(step.Regime)),
			string(state),
		).Inc()
}

func orUnknown(s string) string {
	if s == "" {
		return "unknown"
	}
	return s
}

// durationMSOrMeasured prefers the executor-reported duration; falls back
// to wall-clock measurement when the executor reported zero.
func durationMSOrMeasured(reported int, start time.Time) int {
	if reported > 0 {
		return reported
	}
	return int(time.Since(start) / time.Millisecond)
}

// selectArmIfNeeded invokes the CWS Selector when the Step arrived
// without a pinned provider. On success the in-memory step copy is
// updated and persisted via ledger.UpdateStepArm. On failure the lease
// is released, the Step is marked failed, and terminal propagation is
// triggered so the parent Flow/Run settle.
//
// Returns (handled, err):
//   - handled=true means the Step is already in a terminal state and the
//     caller must stop processing. err is nil on this path.
//   - handled=false + err=nil means the Step is ready to continue down
//     the dispatch pipeline. step.AgentType / step.Provider may have
//     been filled in by the selector.
//   - err != nil indicates an unexpected plumbing failure; the caller
//     logs it and moves on.
func (s *Scheduler) selectArmIfNeeded(ctx context.Context, step *ael.Step, handle *stepLease.Handle) (bool, error) {
	if step.Provider != "" {
		return false, nil
	}
	if s.selector == nil {
		s.failUnroutable(ctx, *step, handle, "no provider on step and no CWS selector configured")
		return true, nil
	}

	pick, err := s.selector.Pick(ctx, cws.PickRequest{
		Regime:        cws.Regime(step.Regime),
		WorkloadClass: step.WorkloadClass,
	})
	if err != nil {
		s.failUnroutable(ctx, *step, handle, "cws pick: "+err.Error())
		return true, nil
	}

	step.AgentType = pick.Winner.AgentType
	step.Provider = pick.Winner.Provider

	if err := s.ledger.UpdateStepArm(ctx, step.ID, step.AgentType, step.Provider); err != nil {
		_ = s.leases.Release(ctx, handle)
		return false, fmt.Errorf("update step arm: %w", err)
	}

	if s.metrics != nil {
		s.metrics.UCBArmSelectionTotal.
			WithLabelValues(step.AgentType, step.Provider, orUnknown(step.WorkloadClass)).
			Inc()
		s.metrics.SchedulingScoreHisto.
			WithLabelValues(orUnknown(step.WorkloadClass)).
			Observe(clampToScoreBucket(pick.Score))
	}
	return false, nil
}

// handleExecutorFailure is the shared terminal path for executor-side
// failures (either Execute returned an err or returned a non-terminal
// FinalState guard). It writes T2 as StepFailed, bookkeeps the
// prometheus counter and CWS reward, then either enqueues a retry or
// propagates the failure up to Flow/Run.
func (s *Scheduler) handleExecutorFailure(ctx context.Context, step ael.Step, reason string, tokens int, cost float64, durationMS int) {
	_ = s.completeFailed(ctx, step, reason)
	s.recordTerminal(step, ael.StepFailed)
	s.recordReward(ctx, step, false, tokens, cost, durationMS, verifier.NoSignal)
	if s.enqueueRetryIfApproved(ctx, step, reason) {
		return
	}
	s.propagateTerminal(ctx, step)
}

// enqueueRetryIfApproved asks the RetryPolicy whether `step` should be
// replayed and, if so, creates a retry Step via the Ledger. Returns
// true iff a retry was enqueued — the caller then skips Flow/Run
// propagation so the still-pending retry keeps the Flow alive.
func (s *Scheduler) enqueueRetryIfApproved(ctx context.Context, step ael.Step, reason string) bool {
	decision := s.retry.ShouldRetry(step, reason)
	if !decision.Retry {
		return false
	}
	retryStep, err := s.ledger.CreateRetryStep(ctx, &step)
	if err != nil {
		s.errorf("retry enqueue failed",
			"step_id", step.ID, "retry_count", step.RetryCount, "error", err.Error())
		return false
	}
	s.infof("step re-enqueued as retry",
		"parent_step_id", step.ID,
		"retry_step_id", retryStep.ID,
		"retry_count", retryStep.RetryCount,
		"reason", decision.Reason,
	)
	return true
}

// startKeepalive runs a background ticker that calls
// stepLease.Keepalive and ledger.RenewLease every KeepaliveInterval.
// The returned channel closes when the goroutine exits — the dispatch
// path waits on it before returning so a new tick's Acquire cannot
// race an in-flight keepalive on the same lease.
//
// Returns nil when KeepaliveInterval is non-positive, which disables
// the loop entirely. Tests use the disabled path to exercise T4
// expiry recovery without fighting a keepalive that would hide the
// bug being tested.
func (s *Scheduler) startKeepalive(ctx context.Context, handle *stepLease.Handle, stepID string) <-chan struct{} {
	if s.cfg.KeepaliveInterval <= 0 {
		return nil
	}
	done := make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(s.cfg.KeepaliveInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := s.leases.Keepalive(ctx, handle, s.cfg.LeaseTTL); err != nil {
					// Lease expired / revoked externally. No point
					// continuing — the Step will hit T4 recovery.
					if errors.Is(err, stepLease.ErrLeaseExpired) {
						s.errorf("lease expired mid-execution; keepalive abandoned",
							"step_id", stepID)
					} else {
						s.errorf("lease keepalive failed", "step_id", stepID, "error", err.Error())
					}
					return
				}
				// Mirror into AEL. Best-effort: a failure here does
				// not kill the Step — etcd still knows.
				if err := s.ledger.RenewLease(ctx, stepID, handle.ExpiresAt); err != nil {
					s.errorf("lease mirror renew failed",
						"step_id", stepID, "error", err.Error())
				}
			}
		}
	}()
	return done
}

// estimateTokens asks the configured Estimator for a forecast. Returns
// 0 (the unbounded sentinel T1 understands) when no estimator is wired,
// so the pre-estimator behaviour is preserved bit-exact.
func (s *Scheduler) estimateTokens(step ael.Step) int {
	if s.estimator == nil {
		return 0
	}
	req := estimator.Request{
		Regime:        string(step.Regime),
		WorkloadClass: step.WorkloadClass,
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		EventStream:   step.EventStreamRaw,
	}
	est := s.estimator.Estimate(req)
	if est < 0 {
		return 0
	}
	return est
}

// failUnroutable handles the "Step can't be routed" terminal path. The
// Step is still in pending at this point, so the FSM only permits
// pending → cancelled (see ael.ValidateStepTransition). Cancellation is
// semantically correct: a Step that never got a provider has not
// executed, so it did not *fail* — it was scheduled-out.
//
// Flow/Run finalization will roll these cancelled Steps up per the
// existing aggregation (any cancelled → Flow/Run cancelled).
func (s *Scheduler) failUnroutable(ctx context.Context, step ael.Step, handle *stepLease.Handle, reason string) {
	if err := s.ledger.CancelStep(ctx, step.ID); err != nil {
		s.errorf("cancel unroutable step", "step_id", step.ID, "reason", reason, "error", err.Error())
	}
	_ = s.leases.Release(ctx, handle)
	s.recordTerminal(step, ael.StepCancelled)
	s.propagateTerminal(ctx, step)
}

// recordReward pushes a terminal-step Outcome into the selector so the
// UCB stats update. Safe to call with a nil selector. Any error from the
// stats backend is swallowed and logged — reward recording must never
// block the scheduler loop.
//
// verifierSignal is the VerificationCallback output in [0, 1] or
// verifier.NoSignal (-1) when no signal was obtained. The DefaultRewardModel
// inside cws collapses NoSignal back to the success indicator, so callers
// that have not run a verifier must pass NoSignal.
func (s *Scheduler) recordReward(ctx context.Context, step ael.Step, succeeded bool, tokens int, cost float64, durationMS int, verifierSignal float64) {
	if s.selector == nil {
		return
	}
	if step.AgentType == "" || step.Provider == "" {
		// CWS cannot attribute; skip silently.
		return
	}
	arm := cws.ArmKey{
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		WorkloadClass: orUnknown(step.WorkloadClass),
		Regime:        cws.Regime(step.Regime),
	}
	outcome := cws.Outcome{
		Succeeded:      succeeded,
		TokensUsed:     tokens,
		CostUSD:        cost,
		DurationMS:     durationMS,
		VerifierSignal: verifierSignal,
	}
	if err := s.selector.Reward(ctx, cws.RewardEvent{Arm: arm, Outcome: outcome}); err != nil {
		s.errorf("cws reward", "step_id", step.ID, "error", err.Error())
	}
}

// verifyIfApplicable runs the registered Verifier for VERIFIABLE steps
// after their successful T2 commit, returning the reward signal in
// [0, 1] or verifier.NoSignal (-1) when no verifier fired.
//
// Non-VERIFIABLE regimes always return NoSignal — the DefaultRewardModel
// keeps the success-indicator fallback for them.
//
// Any Verify error is logged and treated as NoSignal so a flaky verifier
// cannot poison CWS with zeros. If you need the opposite ("broken
// verifier → treat as failure"), switch this to `return 0`.
func (s *Scheduler) verifyIfApplicable(ctx context.Context, step ael.Step, res ExecutionResult) float64 {
	if cws.Regime(step.Regime) != cws.RegimeVerifiable {
		return verifier.NoSignal
	}
	if s.verifiers == nil {
		return verifier.NoSignal
	}
	v, ok := s.verifiers.Lookup(string(step.Regime), step.WorkloadClass)
	if !ok {
		return verifier.NoSignal
	}
	req := verifier.Request{
		StepID:        step.ID,
		Regime:        string(step.Regime),
		WorkloadClass: step.WorkloadClass,
		TenantID:      step.TenantID,
		RunID:         step.RunID,
		FlowID:        step.FlowID,
		Succeeded:     res.FinalState == ael.StepSucceeded,
		Output:        res.EventStream,
		OutputRef:     res.OutputRef,
		FailureReason: res.FailureReason,
	}
	result, err := v.Verify(ctx, req)
	if err != nil {
		s.errorf("verifier failed; falling back to NoSignal",
			"step_id", step.ID, "error", err.Error())
		return verifier.NoSignal
	}
	return verifier.ClampSignal(result.Signal)
}

// clampToScoreBucket maps a UCB score into the bounded [-1, 1] range the
// scheduling_score_histogram buckets cover. UCB scores for unpulled arms
// are +∞ by design; we record those as exactly 1.0 so the histogram
// still counts the selection event.
func clampToScoreBucket(score float64) float64 {
	switch {
	case score > 1:
		return 1
	case score < -1:
		return -1
	default:
		return score
	}
}
