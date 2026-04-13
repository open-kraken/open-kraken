package stepLease

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestMemoryLease_AcquireRelease(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryLease()
	defer m.Close()

	h, err := m.Acquire(ctx, "step-1", "node-a", 2*time.Second)
	if err != nil {
		t.Fatalf("first Acquire: %v", err)
	}
	if h.StepID != "step-1" || h.NodeID != "node-a" {
		t.Errorf("unexpected handle: %+v", h)
	}

	// Second acquire on the same step from a different node must fail.
	if _, err := m.Acquire(ctx, "step-1", "node-b", 2*time.Second); !errors.Is(err, ErrAlreadyHeld) {
		t.Errorf("want ErrAlreadyHeld, got %v", err)
	}

	// Release frees the slot for node-b.
	if err := m.Release(ctx, h); err != nil {
		t.Fatalf("Release: %v", err)
	}
	if _, err := m.Acquire(ctx, "step-1", "node-b", 2*time.Second); err != nil {
		t.Errorf("acquire after release: %v", err)
	}
}

func TestMemoryLease_ExpiryWatch(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m := NewMemoryLease()
	defer m.Close()

	watch, err := m.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}

	h, err := m.Acquire(ctx, "step-expiring", "node-a", 100*time.Millisecond)
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	_ = h

	select {
	case evt := <-watch:
		if evt.StepID != "step-expiring" {
			t.Errorf("want step-expiring, got %s", evt.StepID)
		}
		if evt.Reason != "expired" {
			t.Errorf("want expired, got %s", evt.Reason)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("no expiry event received")
	}
}

func TestMemoryLease_KeepaliveExtendsTTL(t *testing.T) {
	ctx := context.Background()
	m := NewMemoryLease()
	defer m.Close()

	h, err := m.Acquire(ctx, "step-keep", "node-a", 200*time.Millisecond)
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	time.Sleep(100 * time.Millisecond)
	if err := m.Keepalive(ctx, h, 200*time.Millisecond); err != nil {
		t.Fatalf("Keepalive: %v", err)
	}
	// After keepalive the lease should still be held at T0+200ms, past the
	// original TTL.
	time.Sleep(150 * time.Millisecond)
	if _, err := m.Acquire(ctx, "step-keep", "other", 100*time.Millisecond); !errors.Is(err, ErrAlreadyHeld) {
		t.Errorf("want ErrAlreadyHeld after keepalive, got %v", err)
	}
}

func TestMemoryLease_ReleaseIsSilent(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	m := NewMemoryLease()
	defer m.Close()

	watch, err := m.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}

	h, err := m.Acquire(ctx, "step-clean", "node-a", time.Second)
	if err != nil {
		t.Fatalf("Acquire: %v", err)
	}
	if err := m.Release(ctx, h); err != nil {
		t.Fatalf("Release: %v", err)
	}

	// Release must NOT produce an expiry event — the FlowScheduler relies
	// on that silence to distinguish clean completion from node failure.
	select {
	case evt := <-watch:
		t.Errorf("unexpected expiry event on clean release: %+v", evt)
	case <-time.After(200 * time.Millisecond):
		// Expected path.
	}
}
