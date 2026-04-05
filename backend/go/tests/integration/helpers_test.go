package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	plathttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/tokentrack"
)

// testEnv holds all live service references so tests can manipulate internals
// (e.g. advancing the clock for sweeper tests).
type testEnv struct {
	Srv       *httptest.Server
	NodeSvc   *node.Service
	SkillSvc  *skill.Service
	TokenSvc  *tokentrack.Service
	LedgerSvc *ledger.Service
	MemSvc    *memory.Service
	Hub       *realtime.Hub
	SkillDir  string
}

// startTestServer boots a full API stack backed by real (SQLite / JSON) storage
// in t.TempDir(). All services are wired identically to production main.go.
func startTestServer(t *testing.T) *testEnv {
	t.Helper()
	dataDir := t.TempDir()
	skillDir := t.TempDir()

	hub := realtime.NewHub(64)
	svc := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(dataDir)

	nodeRepo := node.NewJSONRepository(filepath.Join(dataDir, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
	ctx, cancel := context.WithCancel(context.Background())
	go nodeSvc.Start(ctx)
	t.Cleanup(cancel)

	skillLoader := skill.NewLoader(skillDir)
	skillBindingRepo := skill.NewJSONBindingRepository(filepath.Join(dataDir, "skills"))
	skillSvc := skill.NewService(skillLoader, skillBindingRepo)

	tokenRepo, err := tokentrack.NewSQLiteTokenRepository(filepath.Join(dataDir, "tokens.db"))
	if err != nil {
		t.Fatalf("init token repo: %v", err)
	}
	tokenSvc := tokentrack.NewService(tokenRepo, hub)

	memRepo, err := memory.NewSQLiteMemoryRepository(filepath.Join(dataDir, "memory.db"))
	if err != nil {
		t.Fatalf("init memory repo: %v", err)
	}
	memorySvc := memory.NewService(memRepo)

	ledgerRepo, err := ledger.NewSQLiteRepository(filepath.Join(dataDir, "ledger.db"))
	if err != nil {
		t.Fatalf("init ledger repo: %v", err)
	}
	ledgerSvc := ledger.NewService(ledgerRepo)

	handler := apihttp.NewHandlerWithDependencies(svc, hub, projectRepo, ".", "/api/v1", "/ws",
		apihttp.ExtendedServices{
			NodeService:   nodeSvc,
			SkillService:  skillSvc,
			TokenService:  tokenSvc,
			MemoryService: memorySvc,
			LedgerService: ledgerSvc,
		}, plathttp.PermissiveWebSocketUpgrader())

	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)

	return &testEnv{
		Srv: srv, NodeSvc: nodeSvc, SkillSvc: skillSvc,
		TokenSvc: tokenSvc, LedgerSvc: ledgerSvc, MemSvc: memorySvc, Hub: hub, SkillDir: skillDir,
	}
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

func doReq(t *testing.T, env *testEnv, method, path string, body any, headers ...map[string]string) *http.Response {
	t.Helper()
	var r io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		r = bytes.NewBuffer(b)
	}
	req, err := http.NewRequest(method, env.Srv.URL+path, r)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, h := range headers {
		for k, v := range h {
			req.Header.Set(k, v)
		}
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request %s %s: %v", method, path, err)
	}
	return resp
}

func readBody(t *testing.T, resp *http.Response) map[string]any {
	t.Helper()
	defer resp.Body.Close()
	var m map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return m
}

func mustStatus(t *testing.T, resp *http.Response, want int) map[string]any {
	t.Helper()
	body := readBody(t, resp)
	if resp.StatusCode != want {
		t.Fatalf("expected status %d, got %d — %v", want, resp.StatusCode, body)
	}
	return body
}

func withActorID(actorID string) map[string]string {
	return map[string]string{"X-Kraken-Actor-Id": actorID}
}

// ── Domain helpers ────────────────────────────────────────────────────────────

// registerNode registers a node with the given hostname and returns its id.
func registerNode(t *testing.T, env *testEnv, id, hostname string) string {
	t.Helper()
	resp := doReq(t, env, http.MethodPost, "/api/v1/nodes/register", map[string]any{
		"id":       id,
		"hostname": hostname,
		"nodeType": "k8s_pod",
		"labels":   map[string]string{},
	})
	body := mustStatus(t, resp, http.StatusCreated)
	nodeID, _ := body["id"].(string)
	if nodeID == "" {
		t.Fatalf("registerNode: no id in response: %v", body)
	}
	return nodeID
}

// reportToken reports a token event and returns the response body.
func reportToken(t *testing.T, env *testEnv, memberID, nodeID, model string, in, out int64) map[string]any {
	t.Helper()
	resp := doReq(t, env, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId":     memberID,
		"nodeId":       nodeID,
		"model":        model,
		"inputTokens":  in,
		"outputTokens": out,
		"cost":         0,
	})
	return mustStatus(t, resp, http.StatusCreated)
}

// putMemory writes a memory entry and returns the response body.
func putMemory(t *testing.T, env *testEnv, scope, key, value, actorID string, ttlSec int64) map[string]any {
	t.Helper()
	payload := map[string]any{"value": value}
	if ttlSec > 0 {
		payload["ttlSeconds"] = ttlSec
	}
	path := fmt.Sprintf("/api/v1/memory/%s/%s", scope, key)
	resp := doReq(t, env, http.MethodPut, path, payload, withActorID(actorID))
	return mustStatus(t, resp, http.StatusOK)
}

// getMemory reads a memory entry and returns (body, statusCode).
func getMemory(t *testing.T, env *testEnv, scope, key, actorID string) (map[string]any, int) {
	t.Helper()
	path := fmt.Sprintf("/api/v1/memory/%s/%s", scope, key)
	resp := doReq(t, env, http.MethodGet, path, nil, withActorID(actorID))
	defer resp.Body.Close()
	var m map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&m)
	return m, resp.StatusCode
}

// waitFor polls pred every interval until it returns true or timeout elapses.
func waitFor(t *testing.T, timeout, interval time.Duration, pred func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if pred() {
			return true
		}
		time.Sleep(interval)
	}
	return false
}
