package instance

import (
	"errors"
	"sync"
	"time"
)

// ErrIllegalTransition is returned when a state-change request would violate
// the FSM.
var ErrIllegalTransition = errors.New("instance: illegal transition")

// AgentInstance is the runtime identity of a specific running agent.
// The L1 context field carries conversation history, tool call results, and
// partial outputs across Step boundaries while the instance is live.
//
// Instance is safe for concurrent access; internal state is guarded by mu.
type AgentInstance struct {
	mu sync.RWMutex

	id        string
	agentType string
	provider  string
	tenantID  string
	hiveID    string

	state         State
	assignedStep  string // empty when idle/scheduled
	contextL1     map[string]any
	spawnedAt     time.Time
	lastActive    time.Time
	terminatedAt  time.Time
	crashReason   string
}

// New constructs an AgentInstance in the `created` state.
// The caller is responsible for transitioning it to `scheduled` once the
// pool has accepted it.
func New(id, agentType, provider, tenantID, hiveID string) *AgentInstance {
	now := time.Now().UTC()
	return &AgentInstance{
		id:         id,
		agentType:  agentType,
		provider:   provider,
		tenantID:   tenantID,
		hiveID:     hiveID,
		state:      StateCreated,
		contextL1:  make(map[string]any),
		spawnedAt:  now,
		lastActive: now,
	}
}

// --- Read accessors ---

func (a *AgentInstance) ID() string        { return a.id }
func (a *AgentInstance) AgentType() string { return a.agentType }
func (a *AgentInstance) Provider() string  { return a.provider }
func (a *AgentInstance) TenantID() string  { return a.tenantID }
func (a *AgentInstance) HiveID() string    { return a.hiveID }
func (a *AgentInstance) SpawnedAt() time.Time { return a.spawnedAt }

func (a *AgentInstance) State() State {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.state
}

func (a *AgentInstance) AssignedStep() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.assignedStep
}

func (a *AgentInstance) LastActive() time.Time {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.lastActive
}

// --- State transitions ---

// Schedule moves created → scheduled when the pool accepts the instance.
func (a *AgentInstance) Schedule() error {
	return a.transition(StateScheduled, "")
}

// AssignStep moves scheduled/idle → running when the FlowScheduler has
// successfully leased a Step to this instance.
func (a *AgentInstance) AssignStep(stepID string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := Validate(a.state, StateRunning); err != nil {
		return err
	}
	a.state = StateRunning
	a.assignedStep = stepID
	a.lastActive = time.Now().UTC()
	return nil
}

// CompleteStep moves running → idle after a successful T2 commit. The L1
// context is preserved for the next Step assignment.
func (a *AgentInstance) CompleteStep() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := Validate(a.state, StateIdle); err != nil {
		return err
	}
	a.state = StateIdle
	a.assignedStep = ""
	a.lastActive = time.Now().UTC()
	return nil
}

// Suspend moves running → suspended when a Policy Plane approval gate is
// hit mid-execution. The L1 context is checkpointed as-is.
func (a *AgentInstance) Suspend() error {
	return a.transition(StateSuspended, "")
}

// Resume moves suspended → resumed once the approval is granted. Callers
// should follow up with AssignStep to continue execution.
func (a *AgentInstance) Resume() error {
	return a.transition(StateResumed, "")
}

// Terminate moves an instance to the terminated state (clean shutdown).
func (a *AgentInstance) Terminate() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := Validate(a.state, StateTerminated); err != nil {
		return err
	}
	a.state = StateTerminated
	a.assignedStep = ""
	a.terminatedAt = time.Now().UTC()
	a.lastActive = a.terminatedAt
	return nil
}

// Crash marks the instance as crashed with a reason string. The FlowScheduler
// will retry the assigned Step on a fresh instance. Before disposal, the
// caller should evaluate contextL1 for L2 promotion (artifacts → SEM).
func (a *AgentInstance) Crash(reason string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := Validate(a.state, StateCrashed); err != nil {
		return err
	}
	a.state = StateCrashed
	a.crashReason = reason
	a.terminatedAt = time.Now().UTC()
	a.lastActive = a.terminatedAt
	return nil
}

func (a *AgentInstance) transition(to State, assignedStep string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if err := Validate(a.state, to); err != nil {
		return err
	}
	a.state = to
	if assignedStep != "" {
		a.assignedStep = assignedStep
	}
	a.lastActive = time.Now().UTC()
	return nil
}

// --- L1 context access ---

// SetContext stores a value in the L1 short-term memory keyed by k.
func (a *AgentInstance) SetContext(k string, v any) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.contextL1 == nil {
		a.contextL1 = make(map[string]any)
	}
	a.contextL1[k] = v
}

// GetContext retrieves a value from L1 memory.
func (a *AgentInstance) GetContext(k string) (any, bool) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	v, ok := a.contextL1[k]
	return v, ok
}

// SnapshotContext returns a shallow copy of the L1 map — useful for L2
// promotion on crash/terminate.
func (a *AgentInstance) SnapshotContext() map[string]any {
	a.mu.RLock()
	defer a.mu.RUnlock()
	out := make(map[string]any, len(a.contextL1))
	for k, v := range a.contextL1 {
		out[k] = v
	}
	return out
}

// CrashReason returns the reason recorded by Crash, empty if not crashed.
func (a *AgentInstance) CrashReason() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.crashReason
}
