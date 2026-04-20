package ael

import (
	"context"
	"errors"
	"fmt"
)

// Service is the high-level API that higher layers (FlowScheduler, API handlers,
// Agent Runtime) consume. It hides the distinction between Repository CRUD and
// transaction primitives.
type Service struct {
	repo *Repository
}

// NewService constructs a Service from an existing Repository.
func NewService(repo *Repository) *Service {
	return &Service{repo: repo}
}

// Close releases underlying resources.
func (s *Service) Close() {
	if s.repo != nil {
		s.repo.Close()
	}
}

// Repo exposes the underlying repository for callers that need low-level
// access (e.g. tests, WAL consumer).
func (s *Service) Repo() *Repository { return s.repo }

// --- Run lifecycle ---

// OpenRun creates a new Run in the pending state. Callers must then create at
// least one Flow and advance the Run to running.
func (s *Service) OpenRun(ctx context.Context, run *Run) error {
	if run.TenantID == "" {
		return errors.New("ael.OpenRun: tenant_id required")
	}
	if run.HiveID == "" {
		return errors.New("ael.OpenRun: hive_id required")
	}
	return s.repo.InsertRun(ctx, run)
}

// StartRun transitions a Run from pending to running.
func (s *Service) StartRun(ctx context.Context, runID string) error {
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	return s.repo.UpdateRunState(ctx, runID, run.Version, RunRunning)
}

// CompleteRun transitions a Run to a terminal state.
func (s *Service) CompleteRun(ctx context.Context, runID string, finalState RunState) error {
	if !IsRunTerminal(finalState) {
		return fmt.Errorf("ael.CompleteRun: %s is not a terminal state", finalState)
	}
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	return s.repo.UpdateRunState(ctx, runID, run.Version, finalState)
}

// EnsureRunRunning transitions a Run from pending → running if needed. It
// is idempotent: a Run already in running (or any terminal state) produces
// no change. This is the hook the FlowScheduler calls when the first Step
// of a Run enters execution.
func (s *Service) EnsureRunRunning(ctx context.Context, runID string) error {
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	if run.State != RunPending {
		return nil
	}
	err = s.repo.UpdateRunState(ctx, runID, run.Version, RunRunning)
	if errors.Is(err, ErrVersionConflict) {
		// Another scheduler beat us to it; treat as success.
		return nil
	}
	return err
}

// --- Flow ---

// AddFlow creates a Flow under an existing Run.
func (s *Service) AddFlow(ctx context.Context, flow *Flow) error {
	if flow.RunID == "" {
		return errors.New("ael.AddFlow: run_id required")
	}
	if flow.TenantID == "" {
		return errors.New("ael.AddFlow: tenant_id required")
	}
	return s.repo.InsertFlow(ctx, flow)
}

// --- Step ---

// AddStep creates a Step under an existing Flow. The Step begins in the
// pending state and is picked up by the FlowScheduler later.
func (s *Service) AddStep(ctx context.Context, step *Step) error {
	if step.FlowID == "" {
		return errors.New("ael.AddStep: flow_id required")
	}
	if step.RunID == "" {
		return errors.New("ael.AddStep: run_id required")
	}
	if step.TenantID == "" {
		return errors.New("ael.AddStep: tenant_id required")
	}
	return s.repo.InsertStep(ctx, step)
}

// GetStep loads a Step by ID.
func (s *Service) GetStep(ctx context.Context, id string) (*Step, error) {
	return s.repo.GetStep(ctx, id)
}

// PendingSteps returns up to `limit` pending steps for a tenant (empty tenantID = all).
func (s *Service) PendingSteps(ctx context.Context, tenantID string, limit int) ([]Step, error) {
	return s.repo.ListPendingSteps(ctx, tenantID, limit)
}

// LeaseMirror wraps Repository.T1LeaseMirror.
func (s *Service) LeaseMirror(ctx context.Context, in T1LeaseMirrorInput) error {
	return s.repo.T1LeaseMirror(ctx, in)
}

// MarkStepRunning transitions a Step from leased → running after the
// FlowScheduler has handed it to an AgentInstance for execution.
func (s *Service) MarkStepRunning(ctx context.Context, stepID string) error {
	return s.repo.MarkStepRunning(ctx, stepID)
}

// UpdateStepArm records the CWS-selected (agent_type, provider) on a
// pending Step. After the Step leaves pending the arm is immutable.
func (s *Service) UpdateStepArm(ctx context.Context, stepID, agentType, provider string) error {
	return s.repo.UpdateStepArm(ctx, stepID, agentType, provider)
}

// CreateRetryStep creates a new Step row chained to parent via
// retry_of (paper §5.3). Returns the new Step. The parent's state is
// NOT mutated — monotonicity is preserved.
func (s *Service) CreateRetryStep(ctx context.Context, parent *Step) (*Step, error) {
	return s.repo.InsertRetryStep(ctx, parent)
}

// CancelStep transitions a Step from pending → cancelled. Used by the
// FlowScheduler when T1 reports the Run's budget is exhausted.
func (s *Service) CancelStep(ctx context.Context, stepID string) error {
	step, err := s.repo.GetStep(ctx, stepID)
	if err != nil {
		return err
	}
	return s.repo.UpdateStepStateFromScheduler(ctx, stepID, step.Version, StepCancelled)
}

// CompleteStep wraps Repository.T2StepComplete. Callers should pass all
// SideEffects that must commit atomically with the step transition.
func (s *Service) CompleteStep(ctx context.Context, in StepCompletionInput) error {
	return s.repo.T2StepComplete(ctx, in)
}

// RenewLease wraps Repository.T3LeaseRenewal: reflect a successful
// etcd keepalive into the PG mirror. Never changes Step state.
func (s *Service) RenewLease(ctx context.Context, in T3LeaseRenewalInput) error {
	return s.repo.T3LeaseRenewal(ctx, in)
}

// GetRun loads a Run by ID.
func (s *Service) GetRun(ctx context.Context, id string) (*Run, error) {
	return s.repo.GetRun(ctx, id)
}

// ListRuns returns runs filtered by tenantID, state and limit.
func (s *Service) ListRuns(ctx context.Context, tenantID string, state RunState, limit int) ([]Run, error) {
	return s.repo.ListRuns(ctx, tenantID, state, limit)
}

// TransitionRun transitions a Run state using optimistic concurrency.
func (s *Service) TransitionRun(ctx context.Context, runID string, to RunState) error {
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		return err
	}
	return s.repo.UpdateRunState(ctx, runID, run.Version, to)
}

// EnsureFlowRunning drives a Flow toward the running state when a Step
// under it is about to execute. Idempotent: a Flow already in running or
// terminal is left alone. A Flow in pending is first transitioned to
// assigned (with assigned_node filled in if empty), then to running.
func (s *Service) EnsureFlowRunning(ctx context.Context, flowID, assignedNode string) error {
	flow, err := s.repo.GetFlow(ctx, flowID)
	if err != nil {
		return err
	}
	// pending → assigned.
	if flow.State == FlowPending {
		if err := s.repo.UpdateFlowState(ctx, flowID, flow.Version, FlowAssigned, assignedNode); err != nil {
			if errors.Is(err, ErrVersionConflict) {
				// Re-read and continue; another scheduler probably raced us.
				flow, err = s.repo.GetFlow(ctx, flowID)
				if err != nil {
					return err
				}
			} else {
				return err
			}
		} else {
			// Re-read to get the bumped version for the next transition.
			flow, err = s.repo.GetFlow(ctx, flowID)
			if err != nil {
				return err
			}
		}
	}
	// assigned → running.
	if flow.State == FlowAssigned {
		err := s.repo.UpdateFlowState(ctx, flowID, flow.Version, FlowRunning, "")
		if errors.Is(err, ErrVersionConflict) {
			return nil
		}
		return err
	}
	return nil
}

// TryFinalizeFlow transitions a Flow to its aggregate terminal state when
// every Step under it is terminal. Returns true iff a transition was made.
// Aggregation rule (matches paper §5.3):
//   - any Step failed        → Flow failed
//   - any Step cancelled     → Flow cancelled
//   - any Step expired       → Flow failed (a backup path; expired Steps
//     are re-enqueued as new rows, so an expired Step row that never
//     produced a fresh retry is effectively a failure)
//   - otherwise (all succeeded) → Flow succeeded
func (s *Service) TryFinalizeFlow(ctx context.Context, flowID string) (bool, error) {
	counts, err := s.repo.CountStepsByFlow(ctx, flowID)
	if err != nil {
		return false, err
	}
	if !counts.AllTerminal() {
		return false, nil
	}
	flow, err := s.repo.GetFlow(ctx, flowID)
	if err != nil {
		return false, err
	}
	if IsFlowTerminal(flow.State) {
		return false, nil
	}
	target := FlowSucceeded
	switch {
	case counts.Failed > 0, counts.Expired > 0:
		target = FlowFailed
	case counts.Cancelled > 0:
		target = FlowCancelled
	}
	if err := s.repo.UpdateFlowState(ctx, flowID, flow.Version, target, ""); err != nil {
		if errors.Is(err, ErrVersionConflict) {
			// Someone raced; consider the finalization handled.
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// TryFinalizeRun transitions a Run to its aggregate terminal state when
// every Flow under it is terminal. Returns true iff a transition was made.
func (s *Service) TryFinalizeRun(ctx context.Context, runID string) (bool, error) {
	counts, err := s.repo.CountFlowsByRun(ctx, runID)
	if err != nil {
		return false, err
	}
	if !counts.AllTerminal() {
		return false, nil
	}
	run, err := s.repo.GetRun(ctx, runID)
	if err != nil {
		return false, err
	}
	if IsRunTerminal(run.State) {
		return false, nil
	}
	target := RunSucceeded
	switch {
	case counts.Failed > 0:
		target = RunFailed
	case counts.Cancelled > 0:
		target = RunCancelled
	}
	if err := s.repo.UpdateRunState(ctx, runID, run.Version, target); err != nil {
		if errors.Is(err, ErrVersionConflict) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// GetFlow loads a Flow by ID.
func (s *Service) GetFlow(ctx context.Context, id string) (*Flow, error) {
	return s.repo.GetFlow(ctx, id)
}

// ListFlowsByRun returns all flows for a run.
func (s *Service) ListFlowsByRun(ctx context.Context, runID string) ([]Flow, error) {
	return s.repo.ListFlowsByRun(ctx, runID)
}

// ListStepsByFlow returns all steps for a flow.
func (s *Service) ListStepsByFlow(ctx context.Context, flowID string) ([]Step, error) {
	return s.repo.ListStepsByFlow(ctx, flowID)
}

// ListSideEffectsByStep returns all side effects for a step.
func (s *Service) ListSideEffectsByStep(ctx context.Context, stepID string) ([]SideEffect, error) {
	return s.repo.ListSideEffectsByStep(ctx, stepID)
}

// --- Skill Library ---

// CreateSkill inserts a new SkillDefinition.
func (s *Service) CreateSkill(ctx context.Context, sk *SkillDefinition) error {
	return s.repo.InsertSkill(ctx, sk)
}

// ListSkills returns skills filtered by tenantID (empty = all), newest first.
func (s *Service) ListSkills(ctx context.Context, tenantID string, limit int) ([]SkillDefinition, error) {
	return s.repo.ListSkills(ctx, tenantID, limit)
}

// GetSkill loads a SkillDefinition by ID.
func (s *Service) GetSkill(ctx context.Context, id string) (*SkillDefinition, error) {
	return s.repo.GetSkill(ctx, id)
}

// FindSkillForAgent returns the best-matching skill for a runtime
// (agent_type, workload_class, tenant_id) triple (paper §5.4.5). Returns
// ErrNotFound when no skill applies — callers fall back to the raw
// Step input in that case.
func (s *Service) FindSkillForAgent(ctx context.Context, agentType, workloadClass, tenantID string) (*SkillDefinition, error) {
	return s.repo.FindSkillForAgent(ctx, agentType, workloadClass, tenantID)
}

// --- Process Template Library ---

// CreateProcessTemplate inserts a new ProcessTemplate.
func (s *Service) CreateProcessTemplate(ctx context.Context, p *ProcessTemplate) error {
	return s.repo.InsertProcessTemplate(ctx, p)
}

// ListProcessTemplates returns process templates newest first.
func (s *Service) ListProcessTemplates(ctx context.Context, limit int) ([]ProcessTemplate, error) {
	return s.repo.ListProcessTemplates(ctx, limit)
}

// GetProcessTemplate loads a ProcessTemplate by ID.
func (s *Service) GetProcessTemplate(ctx context.Context, id string) (*ProcessTemplate, error) {
	return s.repo.GetProcessTemplate(ctx, id)
}

// --- Shared Execution Memory ---

// CreateSEMRecord inserts a new SEMRecord.
func (s *Service) CreateSEMRecord(ctx context.Context, rec *SEMRecord) error {
	return s.repo.InsertSEMRecord(ctx, rec)
}

// ListSEMRecords returns SEM records filtered by hiveID, type, scope (empty = all).
func (s *Service) ListSEMRecords(ctx context.Context, hiveID, semType, scope string, limit int) ([]SEMRecord, error) {
	return s.repo.ListSEMRecords(ctx, hiveID, semType, scope, limit)
}

// GetSEMRecord loads a SEMRecord by ID.
func (s *Service) GetSEMRecord(ctx context.Context, id string) (*SEMRecord, error) {
	return s.repo.GetSEMRecord(ctx, id)
}

// MarkSEMEmbedded records a successful vector-store write (outbox pattern).
func (s *Service) MarkSEMEmbedded(ctx context.Context, id string, qdrantID int64) error {
	return s.repo.MarkSEMEmbedded(ctx, id, qdrantID)
}

// MarkSEMEmbeddingFailed records a failed vector-store write so the
// outbox worker can retry it.
func (s *Service) MarkSEMEmbeddingFailed(ctx context.Context, id string) error {
	return s.repo.MarkSEMEmbeddingFailed(ctx, id)
}

// ListPendingSEMEmbeddings returns SEM rows whose embedding has not
// been persisted to the vector store yet.
func (s *Service) ListPendingSEMEmbeddings(ctx context.Context, limit int) ([]SEMRecord, error) {
	return s.repo.ListPendingSEMEmbeddings(ctx, limit)
}
