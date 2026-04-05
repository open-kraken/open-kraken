package integration_test

import (
	"net/http"
	"testing"
	"time"
)

// TestMemoryPut_CreateAndRead writes a value to agent scope then reads it back
// with the same actor.
func TestMemoryPut_CreateAndRead(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "agent", "last-task", `{"task":"T01"}`, "actor-a", 0)

	body, status := getMemory(t, env, "agent", "last-task", "actor-a")
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d — %v", status, body)
	}
	if body["key"] != "last-task" {
		t.Errorf("expected key=last-task, got %v", body["key"])
	}
	if body["scope"] != "agent" {
		t.Errorf("expected scope=agent, got %v", body["scope"])
	}
	if body["ownerId"] != "actor-a" {
		t.Errorf("expected ownerId=actor-a, got %v", body["ownerId"])
	}
}

// TestMemoryPut_Replace writes the same key twice and verifies the value is updated.
func TestMemoryPut_Replace(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "team", "state", `"v1"`, "actor-a", 0)
	time.Sleep(10 * time.Millisecond)
	putMemory(t, env, "team", "state", `"v2"`, "actor-a", 0)

	r, status := getMemory(t, env, "team", "state", "actor-a")
	if status != http.StatusOK {
		t.Fatalf("expected 200, got %d", status)
	}
	if r["value"] != `"v2"` {
		t.Errorf("expected value=v2, got %v", r["value"])
	}
}

// TestMemoryDelete removes an entry and verifies subsequent GET returns 404.
func TestMemoryDelete(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "agent", "delete-me", `"bye"`, "actor-del", 0)

	resp := doReq(t, env, http.MethodDelete, "/api/v1/memory/agent/delete-me", nil,
		withActorID("actor-del"))
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("DELETE: expected 204, got %d", resp.StatusCode)
	}

	_, status := getMemory(t, env, "agent", "delete-me", "actor-del")
	if status != http.StatusNotFound {
		t.Fatalf("expected 404 after delete, got %d", status)
	}
}

// TestMemoryList_ByScope writes multiple entries under team scope and verifies
// GET /api/v1/memory/team returns them all.
func TestMemoryList_ByScope(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "team", "key1", `"v1"`, "actor-a", 0)
	putMemory(t, env, "team", "key2", `"v2"`, "actor-b", 0)

	resp := doReq(t, env, http.MethodGet, "/api/v1/memory/team", nil)
	body := mustStatus(t, resp, http.StatusOK)

	items, _ := body["items"].([]any)
	if len(items) < 2 {
		t.Fatalf("expected at least 2 team entries, got %d: %v", len(items), body)
	}
}

// TestMemoryTTL_ExpiredReturns404 writes an entry with ttlSeconds=1, waits for
// it to expire, then verifies GET returns 404.
func TestMemoryTTL_ExpiredReturns404(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "global", "ttl-test", `"ephemeral"`, "actor-ttl", 1)

	time.Sleep(1500 * time.Millisecond)

	_, status := getMemory(t, env, "global", "ttl-test", "actor-ttl")
	if status != http.StatusNotFound {
		t.Fatalf("expected 404 for expired TTL entry, got %d", status)
	}
}

// TestMemoryScope_AgentIsolation writes an agent-scoped entry as actor-a and
// verifies that actor-b cannot read it (403 Forbidden).
func TestMemoryScope_AgentIsolation(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "agent", "secret", `"confidential"`, "actor-owner", 0)

	_, status := getMemory(t, env, "agent", "secret", "actor-other")
	if status != http.StatusForbidden {
		t.Fatalf("expected 403 when reading another agent's memory, got %d", status)
	}
}

// TestMemoryGlobalScope_AnyActorCanRead writes global scope then reads with a
// different actor, expecting 200.
func TestMemoryGlobalScope_AnyActorCanRead(t *testing.T) {
	env := startTestServer(t)

	putMemory(t, env, "global", "shared-cfg", `{"model":"claude-sonnet-4-6"}`, "actor-writer", 0)

	_, status := getMemory(t, env, "global", "shared-cfg", "actor-reader")
	if status != http.StatusOK {
		t.Fatalf("expected 200 for global scope read by any actor, got %d", status)
	}
}
