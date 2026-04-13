package prometheus

import (
	"testing"
	"time"
)

func TestNew_RegistersAll(t *testing.T) {
	m := New()
	if m.Registry == nil {
		t.Fatal("Registry should not be nil")
	}

	// Pre-increment each metric so /metrics has something non-zero
	// and we catch typos in label names at construction time.
	m.AgentStepsTotal.WithLabelValues("claude", "research", "OPAQUE", "succeeded").Inc()
	m.UCBArmSelectionTotal.WithLabelValues("researcher", "claude", "research").Inc()
	m.ProviderCostUSDTotal.WithLabelValues("claude", "tenant-a").Add(0.05)
	m.EtcdLeaseExpiryTotal.WithLabelValues("expired").Inc()
	m.ObserveWALWrite(12 * time.Millisecond)
	m.SchedulingScoreHisto.WithLabelValues("research").Observe(0.42)

	// Gather and verify there are the expected families plus Go/process metrics.
	families, err := m.Registry.Gather()
	if err != nil {
		t.Fatalf("Gather: %v", err)
	}
	want := map[string]bool{
		"agent_steps_total":          false,
		"ucb_arm_selection_total":    false,
		"provider_cost_usd_total":    false,
		"etcd_lease_expiry_total":    false,
		"wal_write_latency_seconds":  false,
		"scheduling_score_histogram": false,
	}
	for _, f := range families {
		if _, ok := want[f.GetName()]; ok {
			want[f.GetName()] = true
		}
	}
	for name, found := range want {
		if !found {
			t.Errorf("missing metric family: %s", name)
		}
	}
}

func TestListener_EmptyAddrIsNoop(t *testing.T) {
	l := NewListener("", New())
	l.Start()
	if err := l.Stop(nil); err != nil {
		t.Errorf("Stop on no-op listener: %v", err)
	}
}
