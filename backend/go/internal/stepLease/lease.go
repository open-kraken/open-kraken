package stepLease

import (
	"context"
	"errors"
	"time"
)

// ErrAlreadyHeld is returned by Acquire when another node currently holds a
// lease for this Step.
var ErrAlreadyHeld = errors.New("stepLease: already held")

// ErrLeaseExpired is returned by Keepalive when the underlying lease has
// already expired or was revoked externally. The holder must abort execution
// immediately and must not commit T2.
var ErrLeaseExpired = errors.New("stepLease: expired")

// Handle represents a live lease held by this process.
type Handle struct {
	StepID    string
	NodeID    string
	ExpiresAt time.Time
	// Opaque implementation state. For etcd this is the lease ID; for the
	// in-memory backend this is a ticket into the fake store.
	opaque any
}

// ExpiryEvent is delivered on a FlowScheduler Watch channel when a Step lease
// ends without an explicit Release.
type ExpiryEvent struct {
	StepID string
	Reason string // "expired" | "revoked" | "watch_lost"
}

// Lease is the abstract coordination interface. etcd and in-memory backends
// implement it with identical semantics.
type Lease interface {
	// Acquire attempts to obtain an exclusive lease for stepID on behalf of
	// nodeID, with the given TTL. Returns ErrAlreadyHeld if another holder
	// already has the step.
	Acquire(ctx context.Context, stepID, nodeID string, ttl time.Duration) (*Handle, error)

	// Keepalive extends the TTL of an existing handle. Returns ErrLeaseExpired
	// if the lease has already ended and must not be renewed.
	Keepalive(ctx context.Context, h *Handle, ttl time.Duration) error

	// Release revokes the lease cleanly so that the FlowScheduler can observe
	// the completion via Watch and immediately pick the next assignment.
	Release(ctx context.Context, h *Handle) error

	// Watch returns a channel that receives ExpiryEvent notifications for
	// every lease on the given prefix (default "/leases/step/") that ends
	// without an explicit Release call. The channel is closed when ctx ends.
	Watch(ctx context.Context) (<-chan ExpiryEvent, error)

	// Close releases backend resources.
	Close() error
}
