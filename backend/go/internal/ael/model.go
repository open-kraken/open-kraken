package ael

import (
	"time"
)

// --- State enums ---
//
// These must match the PostgreSQL ENUM types defined in migrations/001_ael_init.sql.
// Any divergence is a schema bug and should be caught by the migration at startup.

type RunState string

const (
	RunPending   RunState = "pending"
	RunRunning   RunState = "running"
	RunSucceeded RunState = "succeeded"
	RunFailed    RunState = "failed"
	RunCancelled RunState = "cancelled"
)

type FlowState string

const (
	FlowPending   FlowState = "pending"
	FlowAssigned  FlowState = "assigned"
	FlowRunning   FlowState = "running"
	FlowSucceeded FlowState = "succeeded"
	FlowFailed    FlowState = "failed"
	FlowCancelled FlowState = "cancelled"
)

type StepState string

const (
	StepPending   StepState = "pending"
	StepLeased    StepState = "leased"
	StepRunning   StepState = "running"
	StepSucceeded StepState = "succeeded"
	StepFailed    StepState = "failed"
	StepCancelled StepState = "cancelled"
	StepExpired   StepState = "expired"
)

type SideEffectState string

const (
	SEPending   SideEffectState = "pending"
	SEExecuting SideEffectState = "executing"
	SECommitted SideEffectState = "committed"
	SEFailed    SideEffectState = "failed"
	SESkipped   SideEffectState = "skipped"
)

type IdempotencyClass string

const (
	IdempotencyIdempotent     IdempotencyClass = "idempotent"
	IdempotencyDeduplicatable IdempotencyClass = "deduplicatable"
	IdempotencyNonRetriable   IdempotencyClass = "non_retriable"
)

// StepRegime is the paper §5.2.2 quality regime that governs CWS routing.
type StepRegime string

const (
	RegimeOpaque     StepRegime = "OPAQUE"
	RegimeVerifiable StepRegime = "VERIFIABLE"
	RegimeProxied    StepRegime = "PROXIED"
)

// --- Domain types ---

// Run is a top-level unit of work originating from an external channel
// (user request, API callback, automation trigger).
type Run struct {
	ID          string
	TenantID    string
	HiveID      string
	State       RunState
	PolicySetID string
	TokenBudget int
	TokensUsed  int
	CostUSD     float64
	Objective   string
	Version     int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// Flow is a logical sub-task within a Run, mapped to a specific agent role.
// It is the granularity at which the FlowScheduler assigns work across nodes.
type Flow struct {
	ID           string
	RunID        string
	TenantID     string
	AgentRole    string
	AssignedNode string
	State        FlowState
	Version      int
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Step is an individual atomic agent action within a Flow — a single LLM
// inference call, tool invocation, or inter-agent delegation. It is the
// unit of scheduling (Step Lease), cost accounting, and replay.
type Step struct {
	ID             string
	FlowID         string
	RunID          string
	TenantID       string
	State          StepState
	Regime         StepRegime
	WorkloadClass  string
	LeaseNodeID    string
	LeaseExpiresAt *time.Time
	InstanceID     string
	AgentID        string
	AgentType      string
	Provider       string
	InputRef       string
	InputHash      []byte
	EventStreamRaw []byte // JSON-encoded AEP event stream
	OutputRef      string
	TokensUsed     int
	CostUSD        float64
	DurationMS     int
	FailureReason  string
	// RetryOf is the direct parent Step ID when this row is a retry
	// (paper §5.3). Empty for the original Step in a chain. Flow /
	// Run finalization only counts Steps that are the leaf of their
	// retry chain (no other Step has this one's ID as retry_of).
	RetryOf    string
	RetryCount int
	Version    int
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

// SideEffect records any interaction with a system external to the agent runtime.
// It is committed atomically with its originating Step (T2) so that there is no
// intermediate state where a Step appears succeeded but its external effects are
// unknown.
type SideEffect struct {
	ID               string
	StepID           string
	RunID            string
	TenantID         string
	Seq              int
	TargetSystem     string
	OperationType    string
	IdempotencyClass IdempotencyClass
	IdempotencyKey   string
	RequestPayload   []byte // JSON
	ResponsePayload  []byte // JSON
	State            SideEffectState
	PolicyOutcome    string
	ExecutedAt       *time.Time
	CreatedAt        time.Time
}
