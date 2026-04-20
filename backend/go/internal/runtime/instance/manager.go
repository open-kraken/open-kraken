package instance

import (
	"context"
	"errors"
	"sync"

	"github.com/google/uuid"
)

// ErrPoolClosed is returned when the Manager has been Closed.
var ErrPoolClosed = errors.New("instance: manager closed")

// poolKey uniquely identifies a pool bucket: (agent_type, provider, tenant).
// Instances within a bucket are interchangeable from the scheduler's point of
// view; the scheduler picks any idle one.
type poolKey struct {
	AgentType string
	Provider  string
	TenantID  string
}

// Manager is an in-process registry of AgentInstances. When a Repository
// is supplied, every transition is mirrored durably and a Restore call
// re-materializes the pool after restart (see recovery.go).
type Manager struct {
	mu     sync.Mutex
	closed bool
	byID   map[string]*AgentInstance
	byPool map[poolKey]map[string]*AgentInstance // key → set of instance IDs

	// repo is the optional persistence backend. Nil means "pool is
	// in-memory only; pre-persistence behaviour". When non-nil every
	// Spawn / state transition writes a Snapshot.
	repo Repository

	// onPersistError fires when a Repository.Upsert fails. Defaults
	// to a no-op; the server main wires in a logger. Kept as a
	// callback to keep Manager independent of any logger package.
	onPersistError func(err error, snapshot Snapshot)
}

// NewManager constructs an empty Manager with no persistence.
func NewManager() *Manager {
	return &Manager{
		byID:   make(map[string]*AgentInstance),
		byPool: make(map[poolKey]map[string]*AgentInstance),
	}
}

// NewManagerWithRepository constructs a Manager that mirrors every
// instance transition into repo. Pass a non-nil error handler to log
// persistence failures (they are never fatal to the in-memory pool).
//
// When repo is nil this behaves like NewManager().
func NewManagerWithRepository(repo Repository, onPersistError func(err error, s Snapshot)) *Manager {
	if onPersistError == nil {
		onPersistError = func(error, Snapshot) {}
	}
	return &Manager{
		byID:           make(map[string]*AgentInstance),
		byPool:         make(map[poolKey]map[string]*AgentInstance),
		repo:           repo,
		onPersistError: onPersistError,
	}
}

// Repository returns the configured Repository or nil.
func (m *Manager) Repository() Repository {
	return m.repo
}

// Spawn creates a new instance in the scheduled state and registers it.
// Returns the instance so the caller can set initial L1 context.
func (m *Manager) Spawn(agentType, provider, tenantID, hiveID string) (*AgentInstance, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, ErrPoolClosed
	}

	id := uuid.NewString()
	inst := New(id, agentType, provider, tenantID, hiveID)
	m.wirePersistence(inst)

	// Schedule must run AFTER the callback is wired so the initial
	// "scheduled" transition mirrors into the Repository.
	if err := inst.Schedule(); err != nil {
		return nil, err
	}

	m.byID[id] = inst
	key := poolKey{AgentType: agentType, Provider: provider, TenantID: tenantID}
	bucket, ok := m.byPool[key]
	if !ok {
		bucket = make(map[string]*AgentInstance)
		m.byPool[key] = bucket
	}
	bucket[id] = inst
	return inst, nil
}

// wirePersistence installs the change callback on inst so every
// subsequent FSM transition mirrors into the Repository. No-op when
// the Manager has no Repository configured.
func (m *Manager) wirePersistence(inst *AgentInstance) {
	if m.repo == nil {
		return
	}
	repo := m.repo
	onErr := m.onPersistError
	ctx := context.Background()
	inst.onChange = func(s Snapshot) {
		if err := repo.Upsert(ctx, s); err != nil {
			onErr(err, s)
		}
	}
}

// Get looks up an instance by ID.
func (m *Manager) Get(id string) (*AgentInstance, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inst, ok := m.byID[id]
	return inst, ok
}

// AcquireIdle returns an idle instance from the bucket matching
// (agentType, provider, tenantID), or nil if none exists. The caller must
// subsequently call AssignStep on the returned instance.
func (m *Manager) AcquireIdle(agentType, provider, tenantID string) *AgentInstance {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := poolKey{AgentType: agentType, Provider: provider, TenantID: tenantID}
	bucket, ok := m.byPool[key]
	if !ok {
		return nil
	}
	for _, inst := range bucket {
		if inst.State() == StateIdle || inst.State() == StateScheduled {
			return inst
		}
	}
	return nil
}

// Reap removes a terminated/crashed instance from the registry. Callers
// should promote any valuable L1 context before calling this.
func (m *Manager) Reap(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	inst, ok := m.byID[id]
	if !ok {
		return
	}
	if !IsTerminal(inst.State()) {
		return // refuse to reap live instances
	}
	delete(m.byID, id)
	key := poolKey{AgentType: inst.AgentType(), Provider: inst.Provider(), TenantID: inst.TenantID()}
	if bucket, ok := m.byPool[key]; ok {
		delete(bucket, id)
		if len(bucket) == 0 {
			delete(m.byPool, key)
		}
	}
}

// Snapshot returns a list of all live instances — useful for metrics /
// debugging / an /api/v2/agent-instances endpoint.
func (m *Manager) Snapshot() []*AgentInstance {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*AgentInstance, 0, len(m.byID))
	for _, inst := range m.byID {
		out = append(out, inst)
	}
	return out
}

// Close marks the manager closed so no new instances can be spawned.
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.closed = true
}
