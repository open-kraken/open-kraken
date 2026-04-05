package integration_test

import (
	"net/http"
	"testing"
)

func TestLedger_PostAndList(t *testing.T) {
	env := startTestServer(t)

	body := mustStatus(t, doReq(t, env, http.MethodPost, "/api/v1/ledger/events", map[string]any{
		"workspaceId":   "ws_open_kraken",
		"teamId":        "team_platform",
		"memberId":      "owner_1",
		"nodeId":        "node-a",
		"eventType":     "terminal.command",
		"summary":       "npm run verify:all",
		"correlationId": "run_001",
		"sessionId":     "term_owner_1",
		"context": map[string]any{
			"cwd":      "/repo/open-kraken",
			"exitCode": 0,
		},
	}), http.StatusCreated)

	if body["summary"] != "npm run verify:all" {
		t.Fatalf("unexpected summary: %v", body["summary"])
	}

	list := mustStatus(t, doReq(t, env, http.MethodGet,
		"/api/v1/ledger/events?workspaceId=ws_open_kraken&memberId=owner_1", nil), http.StatusOK)

	items, ok := list["items"].([]any)
	if !ok || len(items) != 1 {
		t.Fatalf("expected 1 item, got %v", list)
	}
}

func TestLedger_Validation_MissingWorkspace(t *testing.T) {
	env := startTestServer(t)
	resp := doReq(t, env, http.MethodPost, "/api/v1/ledger/events", map[string]any{
		"memberId":  "m1",
		"eventType": "terminal.command",
		"summary":   "ls",
	})
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", resp.StatusCode)
	}
}
