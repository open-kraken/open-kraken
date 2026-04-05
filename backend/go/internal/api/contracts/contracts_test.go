package contracts

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func readRepoFile(t *testing.T, elems ...string) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", ".."))
	path := filepath.Join(append([]string{root}, elems...)...)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return string(data)
}

func requireContainsAll(t *testing.T, source string, snippets []string) {
	t.Helper()
	for _, snippet := range snippets {
		if !strings.Contains(source, snippet) {
			t.Fatalf("missing snippet %q", snippet)
		}
	}
}

func TestHTTPContractListsCriticalPathsAndErrorEnvelope(t *testing.T) {
	doc := readRepoFile(t, "docs", "api", "http-websocket-contract.md")

	requireContainsAll(t, doc, []string{
		"GET `/api/workspaces/{workspaceId}/chat/home`",
		"GET `/api/workspaces/{workspaceId}/conversations/{conversationId}/messages`",
		"POST `/api/workspaces/{workspaceId}/conversations/{conversationId}/messages`",
		"GET `/api/workspaces/{workspaceId}/members`",
		"GET `/api/workspaces/{workspaceId}/roles/matrix`",
		"GET `/api/workspaces/{workspaceId}/roadmap`",
		"PUT `/api/workspaces/{workspaceId}/roadmap`",
		"GET `/api/workspaces/{workspaceId}/project-data`",
		"PUT `/api/workspaces/{workspaceId}/project-data`",
		"GET `/api/workspaces/{workspaceId}/terminals`",
		"POST `/api/workspaces/{workspaceId}/terminals`",
		"POST `/api/workspaces/{workspaceId}/terminals/{terminalId}/dispatch`",
		"\"code\": \"terminal_forbidden\"",
		"\"message\": \"member cannot dispatch to this terminal\"",
		"\"status\": 403",
		"\"requestId\": \"req_01KN9B00000000000000000000\"",
		"\"retryable\": false",
		"\"details\": {",
		"\"code\": \"auth.capability_denied\"",
		"\"requiredCapability\": \"terminal.dispatch\"",
	})
}

func TestWebSocketHandshakeAndEventVocabularyAreFrozen(t *testing.T) {
	doc := readRepoFile(t, "docs", "api", "http-websocket-contract.md")

	requireContainsAll(t, doc, []string{
		"`GET /api/ws`",
		"`Authorization: Bearer <token>` header is required.",
		"`workspaceId` query parameter is required.",
		"`memberId` query parameter is required.",
		"`subscriptions` query parameter is optional comma-separated scope list.",
		"`cursor` query parameter is optional last acked event cursor.",
		"the token is missing, expired, or invalid",
		"requested scopes exceed the caller's readable authorization boundary",
		"`cursor_then_terminal_seq`",
		"`terminal.snapshot` before applying later `terminal.delta` frames",
		"`chat.snapshot`",
		"`chat.delta`",
		"`chat.status`",
		"`presence.snapshot`",
		"`presence.updated`",
		"`roadmap.updated`",
		"`roadmap.snapshot`",
		"`terminal.snapshot`",
		"`terminal.delta`",
		"`terminal.status`",
		"`conversationId`",
		"`messageId`",
		"`memberId`",
		"`sentAt`",
		"`version`",
		"`buffer`",
		"`sequence`",
		"`processState`",
	})
}

func TestOpenAPIIncludesCriticalHTTPSchemasErrorEnvelopeAndRealtimeEventSchemas(t *testing.T) {
	spec := readRepoFile(t, "docs", "api", "openapi.yaml")

	requireContainsAll(t, spec, []string{
		"/healthz:",
		"/api/workspaces/{workspaceId}/chat/home:",
		"/api/workspaces/{workspaceId}/conversations/{conversationId}/messages:",
		"/api/workspaces/{workspaceId}/members:",
		"/api/workspaces/{workspaceId}/roles/matrix:",
		"/api/workspaces/{workspaceId}/roadmap:",
		"/api/workspaces/{workspaceId}/project-data:",
		"/api/workspaces/{workspaceId}/terminals:",
		"/api/workspaces/{workspaceId}/terminals/{terminalId}/dispatch:",
		"ErrorResponse:",
		"ErrorBody:",
		"required: [code, message, status, requestId, retryable]",
		"details:",
		"RuntimeHealthResponse:",
		"RuntimeDetail:",
		"MessageStatus:",
		"enum: [pending, sent, failed]",
		"PersistenceState:",
		"RecoveryState:",
		"RoadmapResponse:",
		"ProjectDataResponse:",
		"TerminalSession:",
		"TerminalDispatchRequest:",
		"TerminalDispatchResponse:",
		"x-websocket:",
		"endpoint: /api/ws",
		"chat.snapshot:",
		"chat.delta:",
		"chat.status:",
		"presence.snapshot:",
		"presence.updated:",
		"roadmap.updated:",
		"roadmap.snapshot:",
		"terminal.attach:",
		"terminal.snapshot:",
		"terminal.delta:",
		"terminal.status:",
	})
}

func TestDocAndOpenAPIAgreeOnKeyEventPayloadFields(t *testing.T) {
	doc := readRepoFile(t, "docs", "api", "http-websocket-contract.md")
	spec := readRepoFile(t, "docs", "api", "openapi.yaml")

	pairs := map[string][]string{
		"chat.snapshot": {
			"conversationId",
			"messageIds",
		},
		"chat.delta": {
			"conversationId",
			"messageId",
			"sequence",
			"body",
		},
		"chat.status": {
			"conversationId",
			"messageId",
			"status",
		},
		"presence.snapshot": {
			"memberId",
			"presenceState",
			"terminalStatus",
			"lastHeartbeat",
		},
		"presence.updated": {
			"memberId",
			"presenceState",
			"sentAt",
		},
		"roadmap.updated": {
			"version",
			"workspaceId",
			"reason",
		},
		"roadmap.snapshot": {
			"workspaceId",
			"itemIds",
			"version",
		},
		"terminal.attach": {
			"terminalId",
			"connectionState",
			"processState",
		},
		"terminal.snapshot": {
			"terminalId",
			"buffer",
			"rows",
			"cols",
			"connectionState",
			"processState",
		},
		"terminal.delta": {
			"terminalId",
			"sequence",
			"data",
		},
		"terminal.status": {
			"terminalId",
			"connectionState",
			"processState",
			"reason",
		},
	}

	for event, fields := range pairs {
		if !strings.Contains(doc, "`"+event+"`") {
			t.Fatalf("doc missing event heading %s", event)
		}
		if !strings.Contains(spec, event+":") {
			t.Fatalf("openapi missing event schema %s", event)
		}
		for _, field := range fields {
			if !strings.Contains(doc, field) {
				t.Fatalf("doc missing field %s for %s", field, event)
			}
			if !strings.Contains(spec, field+":") && !strings.Contains(spec, field) {
				t.Fatalf("openapi missing field %s for %s", field, event)
			}
		}
	}
}

func TestDocAndOpenAPIAgreeOnMessageStatusPersistenceAndRecoverySemantics(t *testing.T) {
	doc := readRepoFile(t, "docs", "api", "http-websocket-contract.md")
	spec := readRepoFile(t, "docs", "api", "openapi.yaml")

	requireContainsAll(t, doc, []string{
		"`pending`: message truth is persisted",
		"`sent`: message truth is persisted",
		"`failed`: message truth is persisted",
		"\"persistence\": {",
		"\"storage\": \"app\"",
		"\"warning\": \"workspace write failed: permission denied\"",
		"\"error\": null",
		"\"recovery\": {",
		"\"mode\": \"replay\"",
		"\"terminalReplay\": \"delta_after_snapshot\"",
		"\"dedupeKey\": \"cursor_then_terminal_seq\"",
		"\"messageStatus\": \"pending\"",
	})

	requireContainsAll(t, spec, []string{
		"MessageStatus:",
		"enum: [pending, sent, failed]",
		"PersistenceState:",
		"warning:",
		"RecoveryState:",
		"dedupeKey:",
		"const: cursor_then_terminal_seq",
		"messageStatus:",
	})
}

func TestRuntimeHealthAndAPIDocsAgreeOnWarningAndErrorShape(t *testing.T) {
	doc := readRepoFile(t, "docs", "api", "http-websocket-contract.md")
	spec := readRepoFile(t, "docs", "api", "openapi.yaml")

	requireContainsAll(t, doc, []string{
		"Roadmap and project-data responses share one persistence outcome object:",
		"`error`: optional embedded shared error body",
		"HTTP `401`, HTTP `403`, and WebSocket `handshake.rejected` must all reuse the shared error envelope.",
	})

	requireContainsAll(t, spec, []string{
		"/healthz:",
		"RuntimeHealthResponse:",
		"enum: [ok, degraded, unhealthy]",
		"warnings:",
		"errors:",
		"RuntimeDetail:",
	})
}
