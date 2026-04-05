// Package integration contains T11 Phase 1-3 end-to-end tests.
// Most tests hit the API mux directly; routing via NewRuntimeHandler is covered separately.
package integration

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	plathttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/tokentrack"

	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
	"open-kraken/backend/go/internal/pty"
)

// testHandler builds a full API handler with in-process dependencies using temp dirs.
func testHandler(t *testing.T) http.Handler {
	t.Helper()
	dataDir := t.TempDir()
	skillDir := t.TempDir()

	hub := realtime.NewHub(64)
	svc := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(dataDir)

	nodeRepo := node.NewJSONRepository(filepath.Join(dataDir, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
	go nodeSvc.Start(context.Background())

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

	return apihttp.NewHandlerWithDependencies(svc, hub, projectRepo, ".", "/api/v1", "/ws",
		apihttp.ExtendedServices{
			NodeService:   nodeSvc,
			SkillService:  skillSvc,
			TokenService:  tokenSvc,
			MemoryService: memorySvc,
			LedgerService: ledgerSvc,
		}, plathttp.PermissiveWebSocketUpgrader())
}

func doJSON(t *testing.T, handler http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reqBody *bytes.Buffer
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal request: %v", err)
		}
		reqBody = bytes.NewBuffer(b)
	} else {
		reqBody = &bytes.Buffer{}
	}
	req := httptest.NewRequest(method, path, reqBody)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	return rr
}

func decodeBody(t *testing.T, rr *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var result map[string]any
	if err := json.NewDecoder(rr.Body).Decode(&result); err != nil {
		t.Fatalf("decode response body: %v (body=%s)", err, rr.Body.String())
	}
	return result
}

func decodeItems(t *testing.T, rr *httptest.ResponseRecorder) []any {
	t.Helper()
	body := decodeBody(t, rr)
	items, ok := body["items"]
	if !ok {
		t.Fatalf("response missing 'items' key: %v", body)
	}
	return items.([]any)
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Node Registry – Happy Path
// ─────────────────────────────────────────────────────────────────

func TestTC_N01_01_EmptyNodeList(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/nodes", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-N01-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	items := decodeItems(t, rr)
	if len(items) != 0 {
		t.Fatalf("TC-N01-01: expected empty list, got %d items", len(items))
	}
}

func TestTC_REG_01_RegisterNode(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/nodes/register", map[string]any{
		"id": "node-1", "hostname": "host-1", "nodeType": "k8s_pod", "labels": map[string]string{"env": "test"},
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("TC-REG-01: expected 201, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if body["id"] != "node-1" {
		t.Fatalf("TC-REG-01: expected id=node-1, got %v", body["id"])
	}
	if body["status"] == nil {
		t.Fatal("TC-REG-01: response missing 'status'")
	}
}

func TestTC_N01_02_ListShowsRegisteredNodes(t *testing.T) {
	h := testHandler(t)
	for i, id := range []string{"node-1", "node-2"} {
		rr := doJSON(t, h, http.MethodPost, "/api/v1/nodes/register", map[string]any{
			"id": id, "hostname": "host-" + string(rune('0'+i+1)), "nodeType": "k8s_pod", "labels": map[string]string{},
		})
		if rr.Code != http.StatusCreated {
			t.Fatalf("register node-%d: %d — %s", i+1, rr.Code, rr.Body.String())
		}
	}
	rr := doJSON(t, h, http.MethodGet, "/api/v1/nodes", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-N01-02: expected 200, got %d", rr.Code)
	}
	items := decodeItems(t, rr)
	if len(items) != 2 {
		t.Fatalf("TC-N01-02: expected 2 nodes, got %d", len(items))
	}
}

func TestTC_N01_04_NodeResponseFieldCompleteness(t *testing.T) {
	h := testHandler(t)
	doJSON(t, h, http.MethodPost, "/api/v1/nodes/register", map[string]any{
		"id": "node-fields", "hostname": "hst", "nodeType": "k8s_pod", "labels": map[string]string{},
	})
	rr := doJSON(t, h, http.MethodGet, "/api/v1/nodes", nil)
	items := decodeItems(t, rr)
	node0 := items[0].(map[string]any)
	for _, field := range []string{"id", "status", "hostname", "nodeType", "registeredAt", "lastHeartbeatAt"} {
		if _, ok := node0[field]; !ok {
			t.Fatalf("TC-N01-04: node response missing field '%s'", field)
		}
	}
}

func TestTC_N02_01_GetNodeByID(t *testing.T) {
	h := testHandler(t)
	doJSON(t, h, http.MethodPost, "/api/v1/nodes/register", map[string]any{
		"id": "node-get", "hostname": "hget", "nodeType": "k8s_pod", "labels": map[string]string{},
	})
	rr := doJSON(t, h, http.MethodGet, "/api/v1/nodes/node-get", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-N02-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if body["id"] != "node-get" {
		t.Fatalf("TC-N02-01: wrong id %v", body["id"])
	}
	for _, field := range []string{"hostname", "nodeType", "lastHeartbeatAt"} {
		if _, ok := body[field]; !ok {
			t.Fatalf("TC-N02-01: missing field '%s'", field)
		}
	}
}

func TestTC_N02_02_GetNonExistentNodeReturns404(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/nodes/ghost", nil)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("TC-N02-02: expected 404, got %d — %s", rr.Code, rr.Body.String())
	}
}

func TestTC_N03_01_AssignAgentToOnlineNode(t *testing.T) {
	h := testHandler(t)
	doJSON(t, h, http.MethodPost, "/api/v1/nodes/register", map[string]any{
		"id": "node-assign", "hostname": "h1", "nodeType": "k8s_pod", "labels": map[string]string{},
	})
	rr := doJSON(t, h, http.MethodPost, "/api/v1/nodes/node-assign/agents", map[string]any{
		"agentId": "agent-x1",
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-N03-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
}

func TestTC_N03_03_AssignAgentToNonExistentNode(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/nodes/ghost-node/agents", map[string]any{
		"agentId": "agent-x",
	})
	if rr.Code != http.StatusNotFound {
		t.Fatalf("TC-N03-03: expected 404, got %d — %s", rr.Code, rr.Body.String())
	}
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Token Tracking – Happy Path
// ─────────────────────────────────────────────────────────────────

func TestTC_T03_01_RecordTokenEvent(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId": "member-a", "nodeId": "node-1", "model": "gpt-4o",
		"inputTokens": 100, "outputTokens": 50, "cost": 0.01,
	})
	if rr.Code != http.StatusCreated {
		t.Fatalf("TC-T03-01: expected 201, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	for _, field := range []string{"id", "memberId", "timestamp"} {
		if _, ok := body[field]; !ok {
			t.Fatalf("TC-T03-01: missing field '%s'", field)
		}
	}
	if body["memberId"] != "member-a" {
		t.Fatalf("TC-T03-01: wrong memberId: %v", body["memberId"])
	}
}

func TestTC_T01_01_StatsAfterEvents(t *testing.T) {
	h := testHandler(t)
	doJSON(t, h, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId": "m1", "nodeId": "n1", "model": "gpt-4o", "inputTokens": 100, "outputTokens": 50, "cost": 0.01,
	})
	doJSON(t, h, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId": "m2", "nodeId": "n2", "model": "gpt-4o", "inputTokens": 200, "outputTokens": 100, "cost": 0.02,
	})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/tokens/stats", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-T01-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	for _, field := range []string{"inputTokens", "outputTokens", "totalTokens", "eventCount"} {
		if _, ok := body[field]; !ok {
			t.Fatalf("TC-T01-01: missing field '%s'", field)
		}
	}
	// Aggregation check: inputTokens = 300
	if v, ok := body["inputTokens"].(float64); !ok || int(v) != 300 {
		t.Fatalf("TC-T01-02: expected inputTokens=300, got %v", body["inputTokens"])
	}
	if v, ok := body["eventCount"].(float64); !ok || int(v) != 2 {
		t.Fatalf("TC-T01-02: expected eventCount=2, got %v", body["eventCount"])
	}
}

func TestTC_T01_03_StatsFilterByNodeID(t *testing.T) {
	h := testHandler(t)
	doJSON(t, h, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId": "m1", "nodeId": "node-test-1", "model": "gpt-4o", "inputTokens": 100, "outputTokens": 50, "cost": 0.01,
	})
	doJSON(t, h, http.MethodPost, "/api/v1/tokens/events", map[string]any{
		"memberId": "m2", "nodeId": "node-test-2", "model": "gpt-4o", "inputTokens": 200, "outputTokens": 100, "cost": 0.02,
	})

	rr := doJSON(t, h, http.MethodGet, "/api/v1/tokens/stats?nodeId=node-test-1", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-T01-03: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if v, ok := body["inputTokens"].(float64); !ok || int(v) != 100 {
		t.Fatalf("TC-T01-03: expected inputTokens=100 for node-test-1, got %v", body["inputTokens"])
	}
}

// ─────────────────────────────────────────────────────────────────
// Phase 1: Skill Catalog – Happy Path
// ─────────────────────────────────────────────────────────────────

func TestTC_S01_01_SkillListEmpty(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/skills", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-S01-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if _, ok := body["items"]; !ok {
		t.Fatal("TC-S01-01: response missing 'items'")
	}
}

func TestTC_S01_03_SkillFromDir(t *testing.T) {
	dataDir := t.TempDir()
	skillDir := t.TempDir()
	// Write a minimal SKILL.md
	skillContent := "---\nname: test-skill\ndescription: A test skill\ncategory: test\n---\n\nDoes nothing."
	if err := os.WriteFile(filepath.Join(skillDir, "SKILL.md"), []byte(skillContent), 0644); err != nil {
		t.Fatal(err)
	}

	hub := realtime.NewHub(16)
	svc := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(dataDir)
	nodeRepo := node.NewJSONRepository(filepath.Join(dataDir, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
	skillLoader := skill.NewLoader(skillDir)
	skillBindingRepo := skill.NewJSONBindingRepository(filepath.Join(dataDir, "skills"))
	skillSvc := skill.NewService(skillLoader, skillBindingRepo)
	tokenRepo, _ := tokentrack.NewSQLiteTokenRepository(filepath.Join(dataDir, "tokens.db"))
	tokenSvc := tokentrack.NewService(tokenRepo, hub)
	memRepo, _ := memory.NewSQLiteMemoryRepository(filepath.Join(dataDir, "memory.db"))
	memorySvc := memory.NewService(memRepo)

	h := apihttp.NewHandlerWithDependencies(svc, hub, projectRepo, ".", "/api/v1", "/ws",
		apihttp.ExtendedServices{NodeService: nodeSvc, SkillService: skillSvc, TokenService: tokenSvc, MemoryService: memorySvc},
		plathttp.PermissiveWebSocketUpgrader())

	rr := doJSON(t, h, http.MethodGet, "/api/v1/skills", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-S01-03: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	items := decodeItems(t, rr)
	if len(items) < 1 {
		t.Fatalf("TC-S01-03: expected at least 1 skill, got %d", len(items))
	}
}

// ─────────────────────────────────────────────────────────────────
// Phase 2: Error Handling + Boundary
// ─────────────────────────────────────────────────────────────────

func TestTC_T03_invalid_BadJSONReturns400(t *testing.T) {
	h := testHandler(t)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tokens/events", strings.NewReader("not-json"))
	req.Header.Set("Content-Type", "application/json")
	rr := httptest.NewRecorder()
	h.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("TC-T03-invalid: expected 400, got %d — %s", rr.Code, rr.Body.String())
	}
}

func TestTC_S02_01_GetMemberSkills(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodGet, "/api/v1/members/member-a/skills", nil)
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-S02-01: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if body["memberId"] != "member-a" {
		t.Fatalf("TC-S02-01: wrong memberId: %v", body["memberId"])
	}
	if _, ok := body["skills"]; !ok {
		t.Fatal("TC-S02-01: response missing 'skills'")
	}
}

func TestTC_S03_05_PUTEmptySkillsArray(t *testing.T) {
	h := testHandler(t)
	rr := doJSON(t, h, http.MethodPut, "/api/v1/members/member-a/skills", map[string]any{
		"skills": []string{},
	})
	if rr.Code != http.StatusOK {
		t.Fatalf("TC-S03-05: expected 200, got %d — %s", rr.Code, rr.Body.String())
	}
	body := decodeBody(t, rr)
	if body["memberId"] != "member-a" {
		t.Fatalf("TC-S03-05: wrong memberId: %v", body["memberId"])
	}
}

// ─────────────────────────────────────────────────────────────────
// Phase 3: WebSocket – Upgrade Check
// ─────────────────────────────────────────────────────────────────

func TestTC_W01_01_WebSocketUpgrade(t *testing.T) {
	h := testHandler(t)
	srv := httptest.NewServer(h)
	defer srv.Close()

	// Attempt WS upgrade — expect 101 (or at minimum non-5xx)
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws"
	req, _ := http.NewRequest(http.MethodGet, "http"+strings.TrimPrefix(srv.URL, "http")+"/ws", nil)
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	req.Header.Set("Sec-WebSocket-Version", "13")

	client := &http.Client{
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
		Timeout:       3 * time.Second,
	}
	_ = wsURL
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("TC-W01-01: WS request error: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("TC-W01-01: expected 101 Switching Protocols, got %d", resp.StatusCode)
	}
}

// TestRuntimeHandler_RoutesVersionedAPIPaths checks that NewRuntimeHandler forwards
// requests under OPEN_KRAKEN_API_BASE_PATH to the API mux (not the static file handler).
func TestRuntimeHandler_RoutesVersionedAPIPaths(t *testing.T) {
	distDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("ok"), 0o644); err != nil {
		t.Fatal(err)
	}
	cfg := runtimecfg.Config{
		ServiceName: "open-kraken-backend",
		APIBasePath: "/api/v1",
		WSPath:      "/ws",
		WebDistDir:  distDir,
	}
	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		_, _ = w.Write([]byte("api:" + r.URL.Path))
	})
	stack := plathttp.NewRuntimeHandler(cfg, apiHandler)
	rr := httptest.NewRecorder()
	stack.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil))
	if rr.Code != http.StatusOK || rr.Body.String() != "api:/api/v1/nodes" {
		t.Fatalf("expected API mux for /api/v1/nodes, got code=%d body=%q", rr.Code, rr.Body.String())
	}
}
