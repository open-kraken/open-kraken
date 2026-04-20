package wal

import "context"

// Subscriber receives WAL events in commit order. Subscribers are
// called one at a time per event (sequentially; the consumer does
// not parallelise the fan-out so the table-driven subscribers that
// need causality see a consistent view).
//
// A Subscriber SHOULD be idempotent against the same Event being
// delivered more than once: the consumer acks after every subscriber
// has returned, but a crash between "all handled" and "ack persisted"
// will redeliver the event on restart. Idempotency at the subscriber
// is the simplest way to make that window safe.
type Subscriber interface {
	// Name is a stable identifier used in logs and the
	// wal_subscriber_events_total metric label. Must not contain
	// high-cardinality tokens (no UUIDs, no timestamps).
	Name() string

	// Handle processes a single event. Returning an error does NOT
	// stop the consumer — the Consumer logs the error, increments
	// the failure counter, and moves on to the next subscriber /
	// event. A subscriber that needs hard-fail semantics should
	// panic; that escapes to the Consumer's recover() path.
	Handle(ctx context.Context, evt Event) error
}

// SubscriberFunc is a convenience adapter so callers can supply a
// plain function where a Subscriber is expected. The name must be
// supplied separately because Go function types do not carry one.
type SubscriberFunc struct {
	NameValue string
	HandleFn  func(ctx context.Context, evt Event) error
}

// Name implements Subscriber.
func (f SubscriberFunc) Name() string { return f.NameValue }

// Handle implements Subscriber.
func (f SubscriberFunc) Handle(ctx context.Context, evt Event) error {
	return f.HandleFn(ctx, evt)
}

// Compile-time check.
var _ Subscriber = SubscriberFunc{}
