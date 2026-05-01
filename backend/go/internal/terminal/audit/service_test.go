package audit

import "testing"

func TestAuditLifecycle(t *testing.T) {
	svc := NewService()

	report := svc.StartAudit("ws1")
	if report.Status != StatusRunning {
		t.Fatalf("expected running, got %s", report.Status)
	}

	// Add passing round.
	svc.RecordRound(report.ID, Round{
		RoundNumber: 1,
		MemberID:    "user1",
		TerminalID:  "term1",
		FrontendSig: "abc123",
		BackendSig:  "abc123",
		ReopenSig:   "abc123",
	})

	completed, err := svc.CompleteAudit(report.ID)
	if err != nil {
		t.Fatalf("complete: %v", err)
	}
	if completed.Status != StatusPassed {
		t.Fatalf("expected passed, got %s", completed.Status)
	}
}

func TestAuditFailed(t *testing.T) {
	svc := NewService()

	report := svc.StartAudit("ws1")
	svc.RecordRound(report.ID, Round{
		RoundNumber: 1,
		MemberID:    "user1",
		TerminalID:  "term1",
		FrontendSig: "abc123",
		BackendSig:  "xyz789", // mismatch
		ReopenSig:   "abc123",
	})

	completed, _ := svc.CompleteAudit(report.ID)
	if completed.Status != StatusFailed {
		t.Fatalf("expected failed, got %s", completed.Status)
	}
	if completed.Rounds[0].Match {
		t.Fatal("expected round match=false")
	}
}

func TestListReports(t *testing.T) {
	svc := NewService()
	svc.StartAudit("ws1")
	svc.StartAudit("ws1")
	svc.StartAudit("ws2")

	reports := svc.ListReports("ws1")
	if len(reports) != 2 {
		t.Fatalf("expected 2 reports for ws1, got %d", len(reports))
	}
}

func TestStartAuditAvoidsIDCollision(t *testing.T) {
	svc := NewService()
	svc.idGen = func() string { return "audit_same" }

	first := svc.StartAudit("ws1")
	second := svc.StartAudit("ws1")

	if first.ID == second.ID {
		t.Fatalf("expected distinct IDs, got %q", first.ID)
	}
	reports := svc.ListReports("ws1")
	if len(reports) != 2 {
		t.Fatalf("expected both reports to be retained, got %d", len(reports))
	}
}

func TestGetReport(t *testing.T) {
	svc := NewService()
	report := svc.StartAudit("ws1")

	got, ok := svc.GetReport(report.ID)
	if !ok {
		t.Fatal("expected to find report")
	}
	if got.WorkspaceID != "ws1" {
		t.Fatalf("expected ws1, got %s", got.WorkspaceID)
	}

	_, ok = svc.GetReport("nonexistent")
	if ok {
		t.Fatal("expected not found")
	}
}
