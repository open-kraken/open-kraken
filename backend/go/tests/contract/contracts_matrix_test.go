package contract_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	contracts "open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/domain/message"
	"open-kraken/backend/go/internal/realtime"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", ".."))
}

func readRepoFile(t *testing.T, elems ...string) string {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(append([]string{repoRoot(t)}, elems...)...))
	if err != nil {
		t.Fatalf("read file: %v", err)
	}
	return string(data)
}

func TestEventNamesAreFrozen(t *testing.T) {
	expected := map[contracts.EventName]string{
		contracts.EventChatSnapshot:     "chat.snapshot",
		contracts.EventChatDelta:        "chat.delta",
		contracts.EventChatStatus:       "chat.status",
		contracts.EventPresenceSnapshot: "presence.snapshot",
		contracts.EventPresenceUpdated:  "presence.updated",
		contracts.EventPresenceStatus:   "presence.status",
		contracts.EventRoadmapSnapshot:  "roadmap.snapshot",
		contracts.EventRoadmapUpdated:   "roadmap.updated",
		contracts.EventTerminalAttach:   "terminal.attach",
		contracts.EventTerminalSnapshot: "terminal.snapshot",
		contracts.EventTerminalDelta:    "terminal.delta",
		contracts.EventTerminalStatus:   "terminal.status",
	}

	for got, want := range expected {
		if string(got) != want {
			t.Fatalf("event mismatch: got %q want %q", got, want)
		}
	}
}

func TestMessageStatusEnumsStayAlignedAcrossDomainContractsAndRealtime(t *testing.T) {
	expectedStatuses := []string{
		string(contracts.MessageStatusSending),
		string(contracts.MessageStatusSent),
		string(contracts.MessageStatusFailed),
	}
	gotStatuses := []string{
		string(message.StatusSending),
		string(message.StatusSent),
		string(message.StatusFailed),
	}
	for index, want := range expectedStatuses {
		if gotStatuses[index] != want {
			t.Fatalf("message status drifted at index %d: got %q want %q", index, gotStatuses[index], want)
		}
	}
	if realtime.EventChatStatus != string(contracts.EventChatStatus) {
		t.Fatalf("chat status event drifted: realtime=%q contracts=%q", realtime.EventChatStatus, contracts.EventChatStatus)
	}
}

func TestMessageStatusContractIsSharedByMocksFixturesAndDocs(t *testing.T) {
	fixture := readRepoFile(t, "backend", "tests", "fixtures", "workspace-fixture.json")
	server := readRepoFile(t, "scripts", "mock-server", "server.mjs")
	webMock := readRepoFile(t, "web", "src", "mocks", "mock-client.mjs")
	domainDoc := readRepoFile(t, "docs", "backend", "domain-mainline-contract.md")

	for _, token := range []string{
		string(contracts.MessageStatusSending),
		string(contracts.MessageStatusSent),
		string(contracts.MessageStatusFailed),
		string(contracts.EventChatStatus),
	} {
		if !strings.Contains(domainDoc, token) {
			t.Fatalf("domain doc missing token %q", token)
		}
	}
	if !strings.Contains(fixture, `"status": "sent"`) {
		t.Fatal("fixture missing canonical sent status")
	}
	if !strings.Contains(server, string(contracts.EventChatStatus)) {
		t.Fatal("mock server missing chat status event")
	}
	if !strings.Contains(webMock, string(contracts.EventChatStatus)) {
		t.Fatal("web mock client missing chat status event")
	}
	if !strings.Contains(server, `status: 'sent'`) || !strings.Contains(webMock, `status: message.status`) {
		t.Fatal("mock layers drifted from message status propagation contract")
	}
}

func TestDomainGateEntrypointIsFrozenInRootScriptsAndDocs(t *testing.T) {
	rootPackage := readRepoFile(t, "package.json")
	verifyScript := readRepoFile(t, "scripts", "verify-go-tests.sh")
	goBackendReadme := readRepoFile(t, "backend", "go", "README.md")
	domainDoc := readRepoFile(t, "docs", "backend", "domain-mainline-contract.md")

	if !strings.Contains(rootPackage, `"test:go:domain": "bash ./scripts/verify-go-tests.sh domain"`) {
		t.Fatal("package.json missing test:go:domain")
	}
	if !strings.Contains(verifyScript, "run_domain_mode") || !strings.Contains(verifyScript, "EXIT_DOMAIN_FAILURE=80") || !strings.Contains(verifyScript, "EXIT_DOMAIN_BLOCKED=81") {
		t.Fatal("verify-go-tests.sh missing domain gate contract")
	}
	if !strings.Contains(goBackendReadme, "npm run test:go:domain") || !strings.Contains(domainDoc, "npm run test:go:domain") {
		t.Fatal("docs missing canonical domain gate entrypoint")
	}
}

func TestMemberProjectionFieldNamesStayReusable(t *testing.T) {
	member := contracts.MemberDTO{}
	if member.WorkspaceID != "" || member.MemberID != "" || member.DisplayName != "" {
		t.Fatal("zero-value member projection changed unexpectedly")
	}
}

func TestFixtureIdentityFieldsAndEnumsStayReusable(t *testing.T) {
	var fixture map[string]any
	if err := json.Unmarshal([]byte(readRepoFile(t, "backend", "tests", "fixtures", "workspace-fixture.json")), &fixture); err != nil {
		t.Fatalf("unmarshal fixture: %v", err)
	}

	members, ok := fixture["members"].(map[string]any)
	if !ok {
		t.Fatal("fixture missing members block")
	}
	rows, ok := members["members"].([]any)
	if !ok || len(rows) == 0 {
		t.Fatal("fixture missing member rows")
	}
	first, ok := rows[0].(map[string]any)
	if !ok {
		t.Fatal("fixture member row has unexpected shape")
	}
	required := []string{"workspaceId", "memberId", "displayName", "avatar", "roleType", "manualStatus", "terminalStatus"}
	for _, key := range required {
		if _, ok := first[key]; !ok {
			t.Fatalf("fixture member missing key %q", key)
		}
	}
	roleType, _ := first["roleType"].(string)
	switch roleType {
	case "owner", "supervisor", "assistant", "member":
	default:
		t.Fatalf("fixture roleType drifted: %q", roleType)
	}
}

func TestEventNamesAreSharedByContractsMockServerAndWebMockClient(t *testing.T) {
	server := readRepoFile(t, "scripts", "mock-server", "server.mjs")
	webMock := readRepoFile(t, "web", "src", "mocks", "mock-client.mjs")
	eventNames := []string{
		string(contracts.EventChatSnapshot),
		string(contracts.EventChatDelta),
		string(contracts.EventChatStatus),
		string(contracts.EventPresenceSnapshot),
		string(contracts.EventPresenceUpdated),
		string(contracts.EventRoadmapUpdated),
		string(contracts.EventTerminalAttach),
		string(contracts.EventTerminalSnapshot),
		string(contracts.EventTerminalDelta),
		string(contracts.EventTerminalStatus),
	}
	for _, eventName := range eventNames {
		if !strings.Contains(server, eventName) {
			t.Fatalf("mock server missing event %q", eventName)
		}
		if !strings.Contains(webMock, eventName) {
			t.Fatalf("web mock client missing event %q", eventName)
		}
	}
}
