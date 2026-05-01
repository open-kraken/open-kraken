// Package audit provides terminal snapshot auditing — comparing frontend,
// backend, and reopen signatures to detect state drift.
package audit

import (
	"fmt"
	"sync"
	"time"
)

// Status represents the audit state.
type Status string

const (
	StatusIdle    Status = "idle"
	StatusRunning Status = "running"
	StatusPassed  Status = "passed"
	StatusFailed  Status = "failed"
)

// Round represents a single audit comparison round.
type Round struct {
	RoundNumber int       `json:"roundNumber"`
	MemberID    string    `json:"memberId"`
	TerminalID  string    `json:"terminalId"`
	FrontendSig string    `json:"frontendSignature"`
	BackendSig  string    `json:"backendSignature"`
	ReopenSig   string    `json:"reopenSignature"`
	Match       bool      `json:"match"`
	ErrorDetail string    `json:"errorDetail,omitempty"`
	CompletedAt time.Time `json:"completedAt"`
}

// Report holds the full audit report.
type Report struct {
	ID          string     `json:"id"`
	WorkspaceID string     `json:"workspaceId"`
	Status      Status     `json:"status"`
	Rounds      []Round    `json:"rounds"`
	StartedAt   time.Time  `json:"startedAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`
}

// Service manages terminal snapshot audits.
type Service struct {
	mu      sync.RWMutex
	reports map[string]*Report
	now     func() time.Time
	idGen   func() string
}

// NewService creates an audit Service.
func NewService() *Service {
	return &Service{
		reports: make(map[string]*Report),
		now:     time.Now,
		idGen:   func() string { return fmt.Sprintf("audit_%d", time.Now().UnixNano()) },
	}
}

// StartAudit begins a new audit for a workspace.
func (s *Service) StartAudit(workspaceID string) *Report {
	s.mu.Lock()
	defer s.mu.Unlock()

	id := s.idGen()
	for suffix := 1; s.reports[id] != nil; suffix++ {
		id = fmt.Sprintf("%s_%d", s.idGen(), suffix)
	}
	r := &Report{
		ID:          id,
		WorkspaceID: workspaceID,
		Status:      StatusRunning,
		StartedAt:   s.now(),
	}
	s.reports[r.ID] = r
	return r
}

// RecordRound adds a comparison round to an audit.
func (s *Service) RecordRound(auditID string, round Round) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	r, ok := s.reports[auditID]
	if !ok {
		return fmt.Errorf("audit not found: %s", auditID)
	}
	round.CompletedAt = s.now()
	round.Match = round.FrontendSig == round.BackendSig && round.BackendSig == round.ReopenSig
	r.Rounds = append(r.Rounds, round)
	return nil
}

// CompleteAudit marks the audit as passed or failed based on rounds.
func (s *Service) CompleteAudit(auditID string) (*Report, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	r, ok := s.reports[auditID]
	if !ok {
		return nil, fmt.Errorf("audit not found: %s", auditID)
	}

	now := s.now()
	r.CompletedAt = &now
	r.Status = StatusPassed
	for _, round := range r.Rounds {
		if !round.Match {
			r.Status = StatusFailed
			break
		}
	}
	return r, nil
}

// GetReport returns an audit report.
func (s *Service) GetReport(auditID string) (*Report, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	r, ok := s.reports[auditID]
	return r, ok
}

// ListReports returns all reports for a workspace.
func (s *Service) ListReports(workspaceID string) []*Report {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*Report
	for _, r := range s.reports {
		if r.WorkspaceID == workspaceID {
			out = append(out, r)
		}
	}
	return out
}
