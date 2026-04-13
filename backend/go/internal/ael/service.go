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

// CompleteStep wraps Repository.T2StepComplete. Callers should pass all
// SideEffects that must commit atomically with the step transition.
func (s *Service) CompleteStep(ctx context.Context, in StepCompletionInput) error {
	return s.repo.T2StepComplete(ctx, in)
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
