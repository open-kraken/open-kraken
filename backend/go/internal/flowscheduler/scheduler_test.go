package flowscheduler

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/cws"
	"open-kraken/backend/go/internal/estimator"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/stepLease"
	"open-kraken/backend/go/internal/verifier"
)

// fakeLedger is an in-memory Ledger that records calls and models enough of
// the AEL state machine to drive the scheduler without PostgreSQL.
type fakeLedger struct {
	mu sync.Mutex

	runs  map[string]*ael.Run
	flows map[string]*ael.Flow
	steps map[string]*ael.Step

	// Counters for assertions.
	leaseMirrorCalls   int
	markRunningCalls   int
	completeCalls      int
	cancelCalls        int
	expiryScanCalls    int
	ensureRunCalls     int
	ensureFlowCalls    int
	finalizeFlowCalls  int
	finalizeRunCalls   int
	renewLeaseCalls    int
	createRetryCalls   int
	lastCompleteInput  ael.StepCompletionInput
	lastLeaseMirror    ael.T1LeaseMirrorInput
	lastRenewExpiresAt time.Time
	lastRetryStep      *ael.Step

	// Behaviour knobs.
	budgetExhausted bool
}

func newFakeLedger(steps ...ael.Step) *fakeLedger {
	l := &fakeLedger{
		runs:  make(map[string]*ael.Run),
		flows: make(map[string]*ael.Flow),
		steps: make(map[string]*ael.Step, len(steps)),
	}
	for i := range steps {
		s := steps[i]
		l.steps[s.ID] = &s
		if s.RunID != "" {
			if _, ok := l.runs[s.RunID]; !ok {
				l.runs[s.RunID] = &ael.Run{ID: s.RunID, TenantID: s.TenantID, State: ael.RunPending}
			}
		}
		if s.FlowID != "" {
			if _, ok := l.flows[s.FlowID]; !ok {
				l.flows[s.FlowID] = &ael.Flow{
					ID:       s.FlowID,
					RunID:    s.RunID,
					TenantID: s.TenantID,
					State:    ael.FlowPending,
				}
			}
		}
	}
	return l
}

func (l *fakeLedger) PendingSteps(ctx context.Context, tenantID string, limit int) ([]ael.Step, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	out := make([]ael.Step, 0, len(l.steps))
	for _, s := range l.steps {
		if s.State == ael.StepPending && (tenantID == "" || s.TenantID == tenantID) {
			out = append(out, *s)
		}
	}
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (l *fakeLedger) LeaseMirror(ctx context.Context, in ael.T1LeaseMirrorInput) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.leaseMirrorCalls++
	l.lastLeaseMirror = in
	if l.budgetExhausted {
		return ael.ErrBudgetExhausted
	}
	s, ok := l.steps[in.StepID]
	if !ok {
		return ael.ErrNotFound
	}
	if err := ael.ValidateStepTransition(s.State, ael.StepLeased); err != nil {
		return err
	}
	s.State = ael.StepLeased
	s.InstanceID = in.InstanceID
	s.LeaseNodeID = in.NodeID
	exp := in.LeaseExpiresAt
	s.LeaseExpiresAt = &exp
	return nil
}

func (l *fakeLedger) MarkStepRunning(ctx context.Context, stepID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.markRunningCalls++
	s, ok := l.steps[stepID]
	if !ok {
		return ael.ErrNotFound
	}
	if err := ael.ValidateStepTransition(s.State, ael.StepRunning); err != nil {
		return err
	}
	s.State = ael.StepRunning
	return nil
}

func (l *fakeLedger) CompleteStep(ctx context.Context, in ael.StepCompletionInput) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.completeCalls++
	l.lastCompleteInput = in
	s, ok := l.steps[in.StepID]
	if !ok {
		return ael.ErrNotFound
	}
	if err := ael.ValidateStepTransition(s.State, in.FinalState); err != nil {
		return err
	}
	s.State = in.FinalState
	s.TokensUsed = in.TokensUsed
	s.CostUSD = in.CostUSD
	s.FailureReason = in.FailureReason
	return nil
}

func (l *fakeLedger) CancelStep(ctx context.Context, stepID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.cancelCalls++
	s, ok := l.steps[stepID]
	if !ok {
		return ael.ErrNotFound
	}
	if err := ael.ValidateStepTransition(s.State, ael.StepCancelled); err != nil {
		return err
	}
	s.State = ael.StepCancelled
	return nil
}

func (l *fakeLedger) ExpiryScan(ctx context.Context, now time.Time) (*ael.T4ExpiryScanResult, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.expiryScanCalls++
	out := &ael.T4ExpiryScanResult{}
	for id, s := range l.steps {
		if (s.State == ael.StepLeased || s.State == ael.StepRunning) &&
			s.LeaseExpiresAt != nil && s.LeaseExpiresAt.Before(now) {
			s.State = ael.StepPending
			s.LeaseNodeID = ""
			s.LeaseExpiresAt = nil
			s.InstanceID = ""
			out.RecoveredStepIDs = append(out.RecoveredStepIDs, id)
		}
	}
	return out, nil
}

func (l *fakeLedger) stepState(id string) ael.StepState {
	l.mu.Lock()
	defer l.mu.Unlock()
	s, ok := l.steps[id]
	if !ok {
		return ""
	}
	return s.State
}

func (l *fakeLedger) flowState(id string) ael.FlowState {
	l.mu.Lock()
	defer l.mu.Unlock()
	f, ok := l.flows[id]
	if !ok {
		return ""
	}
	return f.State
}

func (l *fakeLedger) runState(id string) ael.RunState {
	l.mu.Lock()
	defer l.mu.Unlock()
	r, ok := l.runs[id]
	if !ok {
		return ""
	}
	return r.State
}

// EnsureRunRunning transitions pending → running.
func (l *fakeLedger) EnsureRunRunning(ctx context.Context, runID string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.ensureRunCalls++
	r, ok := l.runs[runID]
	if !ok {
		return ael.ErrNotFound
	}
	if r.State == ael.RunPending {
		r.State = ael.RunRunning
	}
	return nil
}

// EnsureFlowRunning walks pending → assigned → running.
func (l *fakeLedger) EnsureFlowRunning(ctx context.Context, flowID, assignedNode string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.ensureFlowCalls++
	f, ok := l.flows[flowID]
	if !ok {
		return ael.ErrNotFound
	}
	switch f.State {
	case ael.FlowPending:
		f.State = ael.FlowAssigned
		if f.AssignedNode == "" {
			f.AssignedNode = assignedNode
		}
		fallthrough
	case ael.FlowAssigned:
		f.State = ael.FlowRunning
	}
	return nil
}

// TryFinalizeFlow aggregates per-step state for this flow. Only counts
// leaves of the retry chain — mirrors the SQL change in countSteps
// which filters rows that have been superseded by a retry.
func (l *fakeLedger) TryFinalizeFlow(ctx context.Context, flowID string) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.finalizeFlowCalls++
	f, ok := l.flows[flowID]
	if !ok {
		return false, ael.ErrNotFound
	}
	if ael.IsFlowTerminal(f.State) {
		return false, nil
	}
	// Build set of step IDs that have been superseded by a retry.
	retried := make(map[string]bool, len(l.steps))
	for _, s := range l.steps {
		if s.RetryOf != "" {
			retried[s.RetryOf] = true
		}
	}
	var total, pending, failed, cancelled int
	for _, s := range l.steps {
		if s.FlowID != flowID {
			continue
		}
		if retried[s.ID] {
			// Superseded; the retry chain's leaf is what counts.
			continue
		}
		total++
		switch s.State {
		case ael.StepPending, ael.StepLeased, ael.StepRunning:
			pending++
		case ael.StepFailed, ael.StepExpired:
			failed++
		case ael.StepCancelled:
			cancelled++
		}
	}
	if total == 0 || pending > 0 {
		return false, nil
	}
	switch {
	case failed > 0:
		f.State = ael.FlowFailed
	case cancelled > 0:
		f.State = ael.FlowCancelled
	default:
		f.State = ael.FlowSucceeded
	}
	return true, nil
}

// TryFinalizeRun aggregates per-flow state for this run.
func (l *fakeLedger) TryFinalizeRun(ctx context.Context, runID string) (bool, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.finalizeRunCalls++
	r, ok := l.runs[runID]
	if !ok {
		return false, ael.ErrNotFound
	}
	if ael.IsRunTerminal(r.State) {
		return false, nil
	}
	var total, pending, failed, cancelled int
	for _, f := range l.flows {
		if f.RunID != runID {
			continue
		}
		total++
		switch f.State {
		case ael.FlowPending, ael.FlowAssigned, ael.FlowRunning:
			pending++
		case ael.FlowFailed:
			failed++
		case ael.FlowCancelled:
			cancelled++
		}
	}
	if total == 0 || pending > 0 {
		return false, nil
	}
	switch {
	case failed > 0:
		r.State = ael.RunFailed
	case cancelled > 0:
		r.State = ael.RunCancelled
	default:
		r.State = ael.RunSucceeded
	}
	return true, nil
}

// FlowRunID returns the RunID for a Flow.
func (l *fakeLedger) FlowRunID(ctx context.Context, flowID string) (string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	f, ok := l.flows[flowID]
	if !ok {
		return "", ael.ErrNotFound
	}
	return f.RunID, nil
}

// RenewLease counts keepalive mirror calls and records the latest
// expiry so tests can assert T3 fired.
func (l *fakeLedger) RenewLease(ctx context.Context, stepID string, expiresAt time.Time) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.renewLeaseCalls++
	l.lastRenewExpiresAt = expiresAt
	return nil
}

// CreateRetryStep mirrors the real repository: inserts a new pending
// Step chained via retry_of, inheriting flow/run/tenant/regime/etc.
func (l *fakeLedger) CreateRetryStep(ctx context.Context, parent *ael.Step) (*ael.Step, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.createRetryCalls++
	retry := &ael.Step{
		ID:             parent.ID + "-retry",
		FlowID:         parent.FlowID,
		RunID:          parent.RunID,
		TenantID:       parent.TenantID,
		State:          ael.StepPending,
		Regime:         parent.Regime,
		WorkloadClass:  parent.WorkloadClass,
		AgentType:      parent.AgentType,
		Provider:       parent.Provider,
		EventStreamRaw: parent.EventStreamRaw,
		RetryOf:        parent.ID,
		RetryCount:     parent.RetryCount + 1,
	}
	// Disambiguate on collision.
	for i := 2; ; i++ {
		if _, ok := l.steps[retry.ID]; !ok {
			break
		}
		retry.ID = parent.ID + "-retry" + itoaRetry(i)
	}
	l.steps[retry.ID] = retry
	l.lastRetryStep = retry
	return retry, nil
}

func itoaRetry(n int) string {
	if n == 0 {
		return "0"
	}
	digits := []byte{}
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	return string(digits)
}

// UpdateStepArm writes the CWS-selected arm onto a pending step.
func (l *fakeLedger) UpdateStepArm(ctx context.Context, stepID, agentType, provider string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	s, ok := l.steps[stepID]
	if !ok {
		return ael.ErrNotFound
	}
	if s.State != ael.StepPending {
		return ael.ErrVersionConflict
	}
	if agentType != "" {
		s.AgentType = agentType
	}
	if provider != "" {
		s.Provider = provider
	}
	return nil
}

// --- Tests ---

func newTestStep(id string) ael.Step {
	return ael.Step{
		ID:            id,
		FlowID:        "flow-1",
		RunID:         "run-1",
		TenantID:      "tenant-a",
		State:         ael.StepPending,
		Regime:        ael.RegimeOpaque,
		WorkloadClass: "chat",
		AgentType:     "assistant",
		Provider:      "dev",
	}
}

func newTestScheduler(t *testing.T, ledger Ledger) (*Scheduler, stepLease.Lease, *instance.Manager) {
	t.Helper()
	leases := stepLease.NewMemoryLease()
	t.Cleanup(func() { _ = leases.Close() })
	pool := instance.NewManager()
	t.Cleanup(func() { pool.Close() })
	s := New(Config{
		NodeID:             "node-test",
		PollInterval:       10 * time.Millisecond,
		BatchSize:          8,
		LeaseTTL:           2 * time.Second,
		ExpiryScanInterval: -1, // disable in tests
		KeepaliveInterval:  -1, // disable keepalive in shared helper
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)
	return s, leases, pool
}

func TestScheduler_HappyPath(t *testing.T) {
	step := newTestStep("step-happy")
	ledger := newFakeLedger(step)
	s, _, pool := newTestScheduler(t, ledger)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if got := ledger.stepState(step.ID); got != ael.StepSucceeded {
		t.Errorf("step state: want succeeded, got %s", got)
	}
	if ledger.leaseMirrorCalls != 1 || ledger.markRunningCalls != 1 || ledger.completeCalls != 1 {
		t.Errorf("call counts: mirror=%d mark=%d complete=%d",
			ledger.leaseMirrorCalls, ledger.markRunningCalls, ledger.completeCalls)
	}

	// With a single Step in the Flow, finalization should propagate all
	// the way to the Run.
	if got := ledger.flowState(step.FlowID); got != ael.FlowSucceeded {
		t.Errorf("flow state: want succeeded, got %s", got)
	}
	if got := ledger.runState(step.RunID); got != ael.RunSucceeded {
		t.Errorf("run state: want succeeded, got %s", got)
	}

	// The AgentInstance should exist and be idle with L1 context available
	// for the next assignment.
	instances := pool.Snapshot()
	if len(instances) != 1 {
		t.Fatalf("want 1 instance, got %d", len(instances))
	}
	if s := instances[0].State(); s != instance.StateIdle {
		t.Errorf("instance state: want idle, got %s", s)
	}
}

func TestScheduler_SecondTickReusesIdleInstance(t *testing.T) {
	step1 := newTestStep("step-a")
	step2 := newTestStep("step-b")
	ledger := newFakeLedger(step1, step2)
	s, _, pool := newTestScheduler(t, ledger)

	// Two ticks: first runs step-a, second runs step-b.
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce 1: %v", err)
	}
	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce 2: %v", err)
	}

	instances := pool.Snapshot()
	if len(instances) != 1 {
		t.Fatalf("want 1 reused instance, got %d", len(instances))
	}
	if got := ledger.stepState("step-a"); got != ael.StepSucceeded {
		t.Errorf("step-a: want succeeded, got %s", got)
	}
	if got := ledger.stepState("step-b"); got != ael.StepSucceeded {
		t.Errorf("step-b: want succeeded, got %s", got)
	}
}

func TestScheduler_LeaseConflictSkips(t *testing.T) {
	step := newTestStep("step-held")
	ledger := newFakeLedger(step)
	s, leases, _ := newTestScheduler(t, ledger)

	// Pre-acquire the lease externally so Acquire returns ErrAlreadyHeld.
	other, err := leases.Acquire(context.Background(), step.ID, "other-node", time.Second)
	if err != nil {
		t.Fatalf("prime lease: %v", err)
	}
	defer leases.Release(context.Background(), other)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if ledger.leaseMirrorCalls != 0 || ledger.completeCalls != 0 {
		t.Errorf("expected no calls, got mirror=%d complete=%d",
			ledger.leaseMirrorCalls, ledger.completeCalls)
	}
	if got := ledger.stepState(step.ID); got != ael.StepPending {
		t.Errorf("want step still pending, got %s", got)
	}
}

func TestScheduler_BudgetExhaustedCancels(t *testing.T) {
	step := newTestStep("step-poor")
	ledger := newFakeLedger(step)
	ledger.budgetExhausted = true
	s, _, _ := newTestScheduler(t, ledger)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepCancelled {
		t.Errorf("step state: want cancelled, got %s", got)
	}
	if ledger.cancelCalls != 1 || ledger.completeCalls != 0 {
		t.Errorf("cancel=%d complete=%d", ledger.cancelCalls, ledger.completeCalls)
	}
}

// failingExecutor lets a test control whether Execute returns an error or a
// non-succeeded ExecutionResult.
type failingExecutor struct {
	err    error
	result ExecutionResult
}

func (f failingExecutor) Execute(ctx context.Context, req ExecutionRequest) (ExecutionResult, error) {
	return f.result, f.err
}

func TestScheduler_ExecutorErrorRecordedAsFailed(t *testing.T) {
	step := newTestStep("step-err")
	ledger := newFakeLedger(step)
	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	execErr := errors.New("provider boom")
	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          4,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
	}, ledger, leases, pool, failingExecutor{err: execErr}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepFailed {
		t.Errorf("want failed, got %s", got)
	}
	if ledger.lastCompleteInput.FailureReason == "" {
		t.Errorf("want non-empty failure_reason")
	}
}

func TestScheduler_T4RecoversExpiredStep(t *testing.T) {
	step := newTestStep("step-expired")
	expired := time.Now().Add(-time.Minute).UTC()
	step.State = ael.StepRunning
	step.LeaseExpiresAt = &expired
	ledger := newFakeLedger(step)
	s, _, _ := newTestScheduler(t, ledger)

	if err := s.expiryScan(context.Background()); err != nil {
		t.Fatalf("expiryScan: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepPending {
		t.Errorf("want pending after T4, got %s", got)
	}
	if ledger.expiryScanCalls != 1 {
		t.Errorf("want 1 scan, got %d", ledger.expiryScanCalls)
	}
}

func TestScheduler_MultiStepFlowFinalizesOnLastStep(t *testing.T) {
	// Two Steps sharing one Flow/Run. After tick 1 only one Step
	// completes — neither Flow nor Run should be terminal yet. After
	// tick 2 both Steps are done and both should finalize.
	step1 := newTestStep("step-m1")
	step2 := newTestStep("step-m2")
	ledger := newFakeLedger(step1, step2)
	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	// Batch size of 1 forces one Step per tick.
	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("tick 1: %v", err)
	}
	if got := ledger.flowState("flow-1"); got == ael.FlowSucceeded {
		t.Errorf("flow should still be running after 1 of 2 steps; got %s", got)
	}
	if got := ledger.runState("run-1"); got == ael.RunSucceeded {
		t.Errorf("run should still be running after 1 of 2 steps; got %s", got)
	}

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("tick 2: %v", err)
	}
	if got := ledger.flowState("flow-1"); got != ael.FlowSucceeded {
		t.Errorf("flow after 2/2: want succeeded, got %s", got)
	}
	if got := ledger.runState("run-1"); got != ael.RunSucceeded {
		t.Errorf("run after 2/2: want succeeded, got %s", got)
	}
}

func TestScheduler_RunFailsWhenAnyStepFails(t *testing.T) {
	step := newTestStep("step-sad")
	ledger := newFakeLedger(step)
	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          4,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
	}, ledger, leases, pool, failingExecutor{err: errors.New("boom")}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepFailed {
		t.Errorf("step: want failed, got %s", got)
	}
	if got := ledger.flowState(step.FlowID); got != ael.FlowFailed {
		t.Errorf("flow: want failed, got %s", got)
	}
	if got := ledger.runState(step.RunID); got != ael.RunFailed {
		t.Errorf("run: want failed, got %s", got)
	}
}

// --- CWS integration ---

func TestScheduler_CWS_PicksArmForUnpinnedStep(t *testing.T) {
	// Step arrives with empty Provider. With a Selector wired up the
	// scheduler should call Pick, persist the arm, and reward the arm.
	step := newTestStep("step-cws")
	step.Provider = ""
	step.AgentType = ""
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     "assistant",
		Provider:      "anthropic",
		WorkloadClass: "chat",
		Regime:        cws.RegimeOpaque,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	ledger.mu.Lock()
	got := ledger.steps[step.ID]
	ledger.mu.Unlock()
	if got.Provider != "anthropic" || got.AgentType != "assistant" {
		t.Errorf("arm not persisted: provider=%s agent_type=%s", got.Provider, got.AgentType)
	}

	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: "assistant", Provider: "anthropic", WorkloadClass: "chat", Regime: cws.RegimeOpaque},
	})
	if arms[0].Pulls != 1 || arms[0].RewardSum != 1 {
		t.Errorf("stats after run: pulls=%d reward_sum=%f", arms[0].Pulls, arms[0].RewardSum)
	}
}

func TestScheduler_CWS_BypassWhenProviderPinned(t *testing.T) {
	step := newTestStep("step-pinned")
	// Provider and AgentType already set — Selector must not be consulted.
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     "different",
		Provider:      "different",
		WorkloadClass: "chat",
		Regime:        cws.RegimeOpaque,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	ledger.mu.Lock()
	got := ledger.steps[step.ID]
	ledger.mu.Unlock()
	// Arm should be unchanged — CWS was not consulted.
	if got.Provider != step.Provider || got.AgentType != step.AgentType {
		t.Errorf("arm was overwritten: provider=%s agent_type=%s", got.Provider, got.AgentType)
	}

	// But reward for the *pinned* arm should still be recorded so the
	// stats keep learning from pinned traffic.
	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: step.AgentType, Provider: step.Provider, WorkloadClass: "chat", Regime: cws.RegimeOpaque},
	})
	if arms[0].Pulls != 1 {
		t.Errorf("pinned-arm reward should still be recorded: pulls=%d", arms[0].Pulls)
	}
}

func TestScheduler_CWS_NoCandidatesFailsStep(t *testing.T) {
	step := newTestStep("step-no-arm")
	step.Provider = ""
	step.AgentType = ""
	ledger := newFakeLedger(step)

	emptyCat := cws.NewStaticCatalog()
	selector := cws.NewUCBSelector(emptyCat, cws.NewMemoryStats(), cws.Options{})

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	// Step never left pending, so per FSM it can only go to cancelled
	// (not failed). Flow/Run aggregation rolls this up to cancelled too.
	if got := ledger.stepState(step.ID); got != ael.StepCancelled {
		t.Errorf("want cancelled when catalog is empty, got %s", got)
	}
	if got := ledger.flowState(step.FlowID); got != ael.FlowCancelled {
		t.Errorf("flow should finalize as cancelled, got %s", got)
	}
	if got := ledger.runState(step.RunID); got != ael.RunCancelled {
		t.Errorf("run should finalize as cancelled, got %s", got)
	}
}

func TestScheduler_CWS_NoSelectorFailsUnpinnedStep(t *testing.T) {
	// Without a Selector and without a pinned Provider, the Step can't
	// route anywhere — scheduler must terminate it cleanly via cancel
	// (pending→failed is illegal in the FSM; pending→cancelled is the
	// only legal path without first leasing).
	step := newTestStep("step-no-selector")
	step.Provider = ""
	step.AgentType = ""
	ledger := newFakeLedger(step)
	s, _, _ := newTestScheduler(t, ledger) // no Selector in Config

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepCancelled {
		t.Errorf("want cancelled, got %s", got)
	}
}

func TestScheduler_CWS_RewardsFailureAsZero(t *testing.T) {
	// Executor fails → CWS should still see the reward, with Succeeded=false.
	step := newTestStep("step-reward-fail")
	step.Provider = ""
	step.AgentType = ""
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     "assistant",
		Provider:      "anthropic",
		WorkloadClass: "chat",
		Regime:        cws.RegimeOpaque,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
	}, ledger, leases, pool, failingExecutor{err: errors.New("boom")}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: "assistant", Provider: "anthropic", WorkloadClass: "chat", Regime: cws.RegimeOpaque},
	})
	if arms[0].Pulls != 1 {
		t.Errorf("pulls: want 1 after executor failure, got %d", arms[0].Pulls)
	}
	if arms[0].RewardSum != 0 {
		t.Errorf("reward: want 0 for failure, got %f", arms[0].RewardSum)
	}
}

// --- Verifier integration (VERIFIABLE regime) ---

func TestScheduler_Verifier_SignalFlowsIntoReward(t *testing.T) {
	step := newTestStep("step-verify")
	step.Regime = ael.RegimeVerifiable
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		WorkloadClass: step.WorkloadClass,
		Regime:        cws.RegimeVerifiable,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	// Verifier returns a partial-credit 0.7 regardless of content.
	reg := verifier.NewStaticRegistry()
	reg.Register(string(cws.RegimeVerifiable), step.WorkloadClass,
		verifier.FuncVerifier(func(ctx context.Context, req verifier.Request) (verifier.Result, error) {
			return verifier.Result{Signal: 0.7, Reason: "partial"}, nil
		}),
	)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
		Verifiers:          reg,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: step.AgentType, Provider: step.Provider, WorkloadClass: step.WorkloadClass, Regime: cws.RegimeVerifiable},
	})
	if arms[0].Pulls != 1 {
		t.Fatalf("pulls: want 1, got %d", arms[0].Pulls)
	}
	// The recorded reward must be the verifier signal (0.7), not the
	// binary success indicator (1.0).
	if got := arms[0].RewardSum; got < 0.69 || got > 0.71 {
		t.Errorf("reward: want ~0.7, got %f", got)
	}
}

func TestScheduler_Verifier_BypassedForOpaqueRegime(t *testing.T) {
	// OPAQUE regime must never invoke the verifier — reward stays
	// on the success-binary path.
	step := newTestStep("step-opaque")
	step.Regime = ael.RegimeOpaque
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		WorkloadClass: step.WorkloadClass,
		Regime:        cws.RegimeOpaque,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	// Verifier that would assign 0.1 if called — test asserts it isn't.
	reg := verifier.NewStaticRegistry()
	reg.RegisterGlobalDefault(verifier.FuncVerifier(func(ctx context.Context, req verifier.Request) (verifier.Result, error) {
		t.Errorf("verifier unexpectedly called for OPAQUE step %s", req.StepID)
		return verifier.Result{Signal: 0.1}, nil
	}))

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
		Verifiers:          reg,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: step.AgentType, Provider: step.Provider, WorkloadClass: step.WorkloadClass, Regime: cws.RegimeOpaque},
	})
	// Noop executor + OPAQUE → reward 1.0.
	if arms[0].RewardSum != 1.0 {
		t.Errorf("reward: want 1.0 for OPAQUE success, got %f", arms[0].RewardSum)
	}
}

func TestScheduler_Verifier_NoRegistryFallsBackToSuccessBinary(t *testing.T) {
	step := newTestStep("step-no-verify")
	step.Regime = ael.RegimeVerifiable
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		WorkloadClass: step.WorkloadClass,
		Regime:        cws.RegimeVerifiable,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	// No Verifiers registered — scheduler should route the reward
	// through DefaultRewardModel's VERIFIABLE branch, which falls back
	// to the success indicator when VerifierSignal is NoSignal.
	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: step.AgentType, Provider: step.Provider, WorkloadClass: step.WorkloadClass, Regime: cws.RegimeVerifiable},
	})
	if arms[0].RewardSum != 1.0 {
		t.Errorf("reward: want 1.0 (success fallback) with no registry, got %f", arms[0].RewardSum)
	}
}

func TestScheduler_Verifier_ErrorTreatedAsNoSignal(t *testing.T) {
	// A verifier that errors should not poison CWS — the scheduler
	// falls back to the success indicator.
	step := newTestStep("step-ver-err")
	step.Regime = ael.RegimeVerifiable
	ledger := newFakeLedger(step)

	cat := cws.NewStaticCatalog(cws.Candidate{
		AgentType:     step.AgentType,
		Provider:      step.Provider,
		WorkloadClass: step.WorkloadClass,
		Regime:        cws.RegimeVerifiable,
	})
	stats := cws.NewMemoryStats()
	selector := cws.NewUCBSelector(cat, stats, cws.Options{})

	reg := verifier.NewStaticRegistry()
	reg.RegisterDefault(string(cws.RegimeVerifiable),
		verifier.FuncVerifier(func(ctx context.Context, req verifier.Request) (verifier.Result, error) {
			return verifier.Result{}, errors.New("verifier upstream down")
		}))

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           selector,
		Verifiers:          reg,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	arms, _ := stats.LoadArms(context.Background(), []cws.Candidate{
		{AgentType: step.AgentType, Provider: step.Provider, WorkloadClass: step.WorkloadClass, Regime: cws.RegimeVerifiable},
	})
	if arms[0].RewardSum != 1.0 {
		t.Errorf("reward: want 1.0 (fallback on verifier error), got %f", arms[0].RewardSum)
	}
}

// --- Estimator + budget-aware integration ---

func TestScheduler_Estimator_FlowsIntoT1(t *testing.T) {
	step := newTestStep("step-estim")
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Estimator:          estimator.FixedEstimator{Value: 512},
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.lastLeaseMirror.EstimatedTokens; got != 512 {
		t.Errorf("T1 EstimatedTokens: want 512, got %d", got)
	}
}

func TestScheduler_Estimator_NilPreservesZero(t *testing.T) {
	// Without an Estimator, T1 still receives EstimatedTokens=0 so old
	// deployments behave identically.
	step := newTestStep("step-nil-estim")
	ledger := newFakeLedger(step)
	s, _, _ := newTestScheduler(t, ledger) // no Estimator

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.lastLeaseMirror.EstimatedTokens; got != 0 {
		t.Errorf("want 0 without estimator, got %d", got)
	}
}

func TestScheduler_Estimator_BudgetExhaustedStillCancels(t *testing.T) {
	// When fakeLedger forces ErrBudgetExhausted, the Step must cancel
	// regardless of estimator value — the T1 side already enforces the
	// limit; estimator only provides the debit input.
	step := newTestStep("step-exhausted")
	ledger := newFakeLedger(step)
	ledger.budgetExhausted = true

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Estimator:          estimator.FixedEstimator{Value: 100_000},
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepCancelled {
		t.Errorf("want cancelled when budget exhausted, got %s", got)
	}
}

// fakeSelector lets the budget test observe the reward value chosen by
// BudgetAwareRewardModel without going through MemoryStats arithmetic.
type fakeSelector struct {
	lastReward cws.RewardEvent
	calls      int
}

func (f *fakeSelector) Pick(ctx context.Context, req cws.PickRequest) (cws.PickResult, error) {
	return cws.PickResult{}, cws.ErrNoCandidates
}

func (f *fakeSelector) Reward(ctx context.Context, evt cws.RewardEvent) error {
	f.calls++
	f.lastReward = evt
	return nil
}

func TestScheduler_BudgetAwareReward_UsesRewardModel(t *testing.T) {
	// Verify the scheduler passes the Outcome (including CostUSD) to
	// the selector, which then applies BudgetAwareRewardModel. Use a
	// fakeSelector to observe the Outcome directly.
	step := newTestStep("step-budget")
	ledger := newFakeLedger(step)

	sel := &fakeSelector{}

	// Executor returns success with a real cost, simulating Anthropic.
	exec := failingExecutor{result: ExecutionResult{
		FinalState: ael.StepSucceeded,
		TokensUsed: 100,
		CostUSD:    0.005,
		DurationMS: 50,
	}}

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Selector:           sel,
	}, ledger, leases, pool, exec, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if sel.calls != 1 {
		t.Fatalf("expected 1 reward call, got %d", sel.calls)
	}
	if sel.lastReward.Outcome.CostUSD != 0.005 {
		t.Errorf("cost not forwarded: got %f", sel.lastReward.Outcome.CostUSD)
	}
	if !sel.lastReward.Outcome.Succeeded {
		t.Errorf("outcome should carry Succeeded=true")
	}
}

// --- T3 LeaseRenewal / keepalive ---

// slowExecutor sleeps for `dur` before returning success, allowing tests
// to exercise the keepalive goroutine while the Step is "executing".
type slowExecutor struct {
	dur time.Duration
}

func (s slowExecutor) Execute(ctx context.Context, req ExecutionRequest) (ExecutionResult, error) {
	select {
	case <-ctx.Done():
		return ExecutionResult{}, ctx.Err()
	case <-time.After(s.dur):
		return ExecutionResult{
			FinalState:  ael.StepSucceeded,
			EventStream: []byte(`{}`),
		}, nil
	}
}

func TestScheduler_Keepalive_ExtendsLeasePastOriginalTTL(t *testing.T) {
	step := newTestStep("step-slow")
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	// Short TTL (100ms), keepalive every 30ms, executor runs 250ms.
	// Without keepalive the lease would expire mid-execution; with
	// keepalive enabled the Step should still succeed.
	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           100 * time.Millisecond,
		KeepaliveInterval:  30 * time.Millisecond,
		ExecutionTimeout:   time.Second,
		ExpiryScanInterval: -1,
	}, ledger, leases, pool, slowExecutor{dur: 250 * time.Millisecond}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if got := ledger.stepState(step.ID); got != ael.StepSucceeded {
		t.Errorf("step: want succeeded (keepalive preserved lease), got %s", got)
	}

	ledger.mu.Lock()
	renewals := ledger.renewLeaseCalls
	ledger.mu.Unlock()
	if renewals < 2 {
		t.Errorf("expected ≥2 lease renewals over 250ms at 30ms cadence, got %d", renewals)
	}
}

func TestScheduler_Keepalive_DisabledWhenIntervalNegative(t *testing.T) {
	// KeepaliveInterval = -1 disables the goroutine. Run a fast executor
	// to confirm no T3 calls are made.
	step := newTestStep("step-no-keep")
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		KeepaliveInterval:  -1,
		ExpiryScanInterval: -1,
	}, ledger, leases, pool, NoopExecutor{}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	ledger.mu.Lock()
	got := ledger.renewLeaseCalls
	ledger.mu.Unlock()
	if got != 0 {
		t.Errorf("keepalive should be disabled; got %d renewals", got)
	}
}

func TestScheduler_Keepalive_StopsOnCompletion(t *testing.T) {
	// After Step completes, keepalive goroutine must exit. We assert
	// this by observing that no further T3 calls happen in a short
	// settle window after RunOnce returns.
	step := newTestStep("step-stop")
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           80 * time.Millisecond,
		KeepaliveInterval:  20 * time.Millisecond,
		ExpiryScanInterval: -1,
	}, ledger, leases, pool, slowExecutor{dur: 60 * time.Millisecond}, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	ledger.mu.Lock()
	before := ledger.renewLeaseCalls
	ledger.mu.Unlock()

	// Sleep well past one keepalive tick; count must stay stable.
	time.Sleep(80 * time.Millisecond)

	ledger.mu.Lock()
	after := ledger.renewLeaseCalls
	ledger.mu.Unlock()
	if after != before {
		t.Errorf("keepalive kept running after completion: before=%d after=%d", before, after)
	}
}

// --- Step retry / RetryPolicy ---

func TestScheduler_Retry_ExecutorErrorEnqueuesNewStep(t *testing.T) {
	step := newTestStep("step-retry-1")
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	// Transient failure — policy should approve retry.
	exec := failingExecutor{err: errors.New("provider rate limited: 429")}

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Retry:              NewDefaultRetryPolicy(3),
	}, ledger, leases, pool, exec, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}

	if ledger.createRetryCalls != 1 {
		t.Errorf("want 1 retry, got %d", ledger.createRetryCalls)
	}
	if ledger.lastRetryStep == nil || ledger.lastRetryStep.RetryOf != step.ID {
		t.Errorf("retry chain: want RetryOf=%s, got %+v", step.ID, ledger.lastRetryStep)
	}
	if ledger.lastRetryStep.RetryCount != 1 {
		t.Errorf("retry_count: want 1, got %d", ledger.lastRetryStep.RetryCount)
	}
	// Parent is failed, retry is pending → Flow must NOT have finalized
	// (leaves = retry(pending); failed parent is superseded).
	if got := ledger.flowState(step.FlowID); got == ael.FlowFailed || got == ael.FlowSucceeded {
		t.Errorf("flow should still be running while retry pending, got %s", got)
	}
}

func TestScheduler_Retry_PermanentFailureDoesNotRetry(t *testing.T) {
	step := newTestStep("step-permanent")
	ledger := newFakeLedger(step)
	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	// Auth failure — DefaultRetryPolicy classifies as permanent.
	exec := failingExecutor{err: errors.New("provider auth: 401 bad key")}

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Retry:              NewDefaultRetryPolicy(3),
	}, ledger, leases, pool, exec, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if ledger.createRetryCalls != 0 {
		t.Errorf("permanent failure should not retry; got %d retries", ledger.createRetryCalls)
	}
	if got := ledger.flowState(step.FlowID); got != ael.FlowFailed {
		t.Errorf("flow should finalize failed, got %s", got)
	}
}

func TestScheduler_Retry_BudgetExhaustionStops(t *testing.T) {
	// Pretend the step has already been retried 3 times; MaxRetries=3
	// means the policy refuses further retries and the Flow finalizes.
	step := newTestStep("step-budget")
	step.RetryCount = 3
	ledger := newFakeLedger(step)

	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	exec := failingExecutor{err: errors.New("provider rate limited: 429")}

	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
		Retry:              NewDefaultRetryPolicy(3),
	}, ledger, leases, pool, exec, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if ledger.createRetryCalls != 0 {
		t.Errorf("budget exhausted should not retry; got %d retries", ledger.createRetryCalls)
	}
	if got := ledger.flowState(step.FlowID); got != ael.FlowFailed {
		t.Errorf("flow should finalize failed after budget exhausted, got %s", got)
	}
}

func TestScheduler_Retry_NilPolicyBypassesRetry(t *testing.T) {
	step := newTestStep("step-no-policy")
	ledger := newFakeLedger(step)
	leases := stepLease.NewMemoryLease()
	defer leases.Close()
	pool := instance.NewManager()
	defer pool.Close()

	exec := failingExecutor{err: errors.New("provider rate limited")}

	// No Retry in Config → scheduler treats failures as before.
	s := New(Config{
		NodeID:             "node-test",
		BatchSize:          1,
		LeaseTTL:           time.Second,
		ExpiryScanInterval: -1,
		KeepaliveInterval:  -1,
	}, ledger, leases, pool, exec, nil, nil)

	if err := s.RunOnce(context.Background()); err != nil {
		t.Fatalf("RunOnce: %v", err)
	}
	if ledger.createRetryCalls != 0 {
		t.Errorf("nil retry policy should not create retries")
	}
	if got := ledger.flowState(step.FlowID); got != ael.FlowFailed {
		t.Errorf("flow should finalize failed, got %s", got)
	}
}

func TestDefaultRetryPolicy_Classification(t *testing.T) {
	p := NewDefaultRetryPolicy(3)
	step := ael.Step{RetryCount: 0}

	retry := []string{
		"provider rate limited: 429",
		"provider upstream 500: boom",
		"network down",
		"provider error: context deadline exceeded",
	}
	for _, r := range retry {
		if !p.ShouldRetry(step, r).Retry {
			t.Errorf("transient %q should retry", r)
		}
	}

	permanent := []string{
		"provider auth: 401",
		"unknown provider \"gemini\"",
		"provider unknown model: no such model",
		"no provider on step and no CWS selector configured",
		"invalid event_stream: bad json",
	}
	for _, r := range permanent {
		if p.ShouldRetry(step, r).Retry {
			t.Errorf("permanent %q should NOT retry", r)
		}
	}
}

func TestDefaultRetryPolicy_ZeroMaxDisables(t *testing.T) {
	p := NewDefaultRetryPolicy(0)
	if p.ShouldRetry(ael.Step{}, "provider rate limited").Retry {
		t.Error("MaxRetries=0 must disable retries")
	}
}

func TestScheduler_StartStop(t *testing.T) {
	ledger := newFakeLedger()
	s, _, _ := newTestScheduler(t, ledger)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := s.Start(ctx); err != nil {
		t.Fatalf("Start: %v", err)
	}
	if err := s.Start(ctx); !errors.Is(err, ErrAlreadyRunning) {
		t.Errorf("second Start: want ErrAlreadyRunning, got %v", err)
	}
	// Brief run without any pending steps, then stop.
	time.Sleep(30 * time.Millisecond)
	s.Stop()
	// Idempotent stop.
	s.Stop()
}
