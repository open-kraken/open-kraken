package stepLease

import (
	"context"
	"sync"
	"time"
)

// MemoryLease is an in-process Lease implementation. It has the same semantics
// as the etcd backend but no cross-process coordination. Use it in tests and
// single-process dev deployments only — in production, use EtcdLease.
type MemoryLease struct {
	mu        sync.Mutex
	holders   map[string]*memHolder
	watchers  []chan ExpiryEvent
	closed    bool
	closeDone chan struct{}
}

type memHolder struct {
	stepID    string
	nodeID    string
	expiresAt time.Time
	timer     *time.Timer
}

// NewMemoryLease constructs an empty in-memory Lease backend.
func NewMemoryLease() *MemoryLease {
	return &MemoryLease{
		holders:   make(map[string]*memHolder),
		closeDone: make(chan struct{}),
	}
}

// Acquire implements Lease.
func (m *MemoryLease) Acquire(ctx context.Context, stepID, nodeID string, ttl time.Duration) (*Handle, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil, context.Canceled
	}
	if existing, ok := m.holders[stepID]; ok && time.Now().Before(existing.expiresAt) {
		return nil, ErrAlreadyHeld
	}
	now := time.Now()
	h := &memHolder{
		stepID:    stepID,
		nodeID:    nodeID,
		expiresAt: now.Add(ttl),
	}
	// Fire an expiry event when the TTL elapses without Release/Keepalive.
	h.timer = time.AfterFunc(ttl, func() {
		m.expire(stepID, "expired")
	})
	m.holders[stepID] = h
	return &Handle{
		StepID:    stepID,
		NodeID:    nodeID,
		ExpiresAt: h.expiresAt,
		opaque:    h,
	}, nil
}

// Keepalive implements Lease.
func (m *MemoryLease) Keepalive(ctx context.Context, h *Handle, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.holders[h.StepID]
	if !ok || existing != h.opaque {
		return ErrLeaseExpired
	}
	if time.Now().After(existing.expiresAt) {
		return ErrLeaseExpired
	}
	existing.expiresAt = time.Now().Add(ttl)
	if existing.timer != nil {
		existing.timer.Stop()
	}
	stepID := h.StepID
	existing.timer = time.AfterFunc(ttl, func() {
		m.expire(stepID, "expired")
	})
	h.ExpiresAt = existing.expiresAt
	return nil
}

// Release implements Lease.
func (m *MemoryLease) Release(ctx context.Context, h *Handle) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	existing, ok := m.holders[h.StepID]
	if !ok || existing != h.opaque {
		return nil // already released; idempotent
	}
	if existing.timer != nil {
		existing.timer.Stop()
	}
	delete(m.holders, h.StepID)
	// Explicit release is not an expiry event; the FlowScheduler is expected
	// to observe step completion through the AEL T2 commit, not through a
	// lease-end notification.
	return nil
}

// Watch implements Lease. Each call returns an independent channel that
// receives expiry events until ctx ends.
func (m *MemoryLease) Watch(ctx context.Context) (<-chan ExpiryEvent, error) {
	m.mu.Lock()
	ch := make(chan ExpiryEvent, 16)
	m.watchers = append(m.watchers, ch)
	m.mu.Unlock()

	go func() {
		<-ctx.Done()
		m.mu.Lock()
		for i, w := range m.watchers {
			if w == ch {
				m.watchers = append(m.watchers[:i], m.watchers[i+1:]...)
				break
			}
		}
		m.mu.Unlock()
		close(ch)
	}()
	return ch, nil
}

// Close implements Lease.
func (m *MemoryLease) Close() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.closed {
		return nil
	}
	m.closed = true
	for _, h := range m.holders {
		if h.timer != nil {
			h.timer.Stop()
		}
	}
	m.holders = nil
	close(m.closeDone)
	return nil
}

func (m *MemoryLease) expire(stepID, reason string) {
	m.mu.Lock()
	holder, ok := m.holders[stepID]
	if !ok {
		m.mu.Unlock()
		return
	}
	if time.Now().Before(holder.expiresAt) {
		// Keepalive extended the TTL after the timer fired; ignore.
		m.mu.Unlock()
		return
	}
	delete(m.holders, stepID)
	watchers := make([]chan ExpiryEvent, len(m.watchers))
	copy(watchers, m.watchers)
	m.mu.Unlock()

	evt := ExpiryEvent{StepID: stepID, Reason: reason}
	for _, w := range watchers {
		select {
		case w <- evt:
		default:
			// Slow watcher — drop to avoid blocking. Real etcd clients
			// maintain a similar policy; watchers that fall behind get a
			// "compacted" signal and must re-sync.
		}
	}
}
