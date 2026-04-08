package presence

import (
	"context"
	"testing"
	"time"
)

func TestServiceSetAndGet(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	svc.SetStatus(ctx, "ws1", "user1", StatusOnline)

	p, ok := svc.GetPresence("ws1", "user1")
	if !ok {
		t.Fatal("expected to find presence")
	}
	if p.EffectiveStatus() != StatusOnline {
		t.Fatalf("expected online, got %s", p.EffectiveStatus())
	}
}

func TestServiceDND(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	svc.SetStatus(ctx, "ws1", "user1", StatusDND)

	if !svc.IsDND(ctx, "user1") {
		t.Fatal("expected user1 to be DND")
	}
	if svc.IsDND(ctx, "user2") {
		t.Fatal("expected user2 not DND")
	}
}

func TestServiceListOnline(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	svc.SetStatus(ctx, "ws1", "user1", StatusOnline)
	svc.SetStatus(ctx, "ws1", "user2", StatusWorking)
	svc.SetStatus(ctx, "ws1", "user3", StatusOffline)
	svc.SetStatus(ctx, "ws2", "user4", StatusOnline)

	online := svc.ListOnline("ws1")
	if len(online) != 2 {
		t.Fatalf("expected 2 online in ws1, got %d", len(online))
	}
}

func TestServiceHeartbeat(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	svc.Heartbeat(ctx, "ws1", "user1")

	p, ok := svc.GetPresence("ws1", "user1")
	if !ok {
		t.Fatal("expected presence after heartbeat")
	}
	if p.Status != StatusOnline {
		t.Fatalf("expected online after heartbeat, got %s", p.Status)
	}
}

func TestServiceSweep(t *testing.T) {
	svc := NewService(nil)
	now := time.Now()
	svc.now = func() time.Time { return now }
	ctx := context.Background()

	svc.Heartbeat(ctx, "ws1", "user1")

	// Advance past heartbeat timeout.
	now = now.Add(2 * time.Minute)
	svc.now = func() time.Time { return now }

	svc.Sweep(ctx)

	p, _ := svc.GetPresence("ws1", "user1")
	if p.Status != StatusOffline {
		t.Fatalf("expected offline after sweep, got %s", p.Status)
	}
}

func TestServiceUpdateTerminalStatus(t *testing.T) {
	svc := NewService(nil)
	ctx := context.Background()

	svc.SetStatus(ctx, "ws1", "user1", StatusOnline)
	svc.UpdateTerminalStatus(ctx, "ws1", "user1", "working")

	p, _ := svc.GetPresence("ws1", "user1")
	if p.TerminalStatus != "working" {
		t.Fatalf("expected terminal status 'working', got %s", p.TerminalStatus)
	}
}

func TestEffectiveStatusPrefersManual(t *testing.T) {
	p := MemberPresence{
		Status:       StatusOnline,
		ManualStatus: StatusDND,
	}
	if p.EffectiveStatus() != StatusDND {
		t.Fatalf("expected DND override, got %s", p.EffectiveStatus())
	}
}
