package handlers_test

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

	"open-kraken/backend/go/internal/account"
	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/node"
	plathttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/settings"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/provider"
)

type fakeRosterStore struct {
	doc   roster.Document
	found bool
}

func (s *fakeRosterStore) Read(_ context.Context, workspaceID string) (roster.Document, bool, error) {
	if !s.found || s.doc.Meta.WorkspaceID != workspaceID {
		return roster.Document{}, false, nil
	}
	return s.doc, true, nil
}

func (s *fakeRosterStore) Write(_ context.Context, doc roster.Document) error {
	doc.Meta.Storage = "postgres"
	s.doc = doc
	s.found = true
	return nil
}

func TestWorkspaceRoadmapAndProjectDataAuthzViaBearerAdapter(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())

	roadmapGet := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/roadmap", nil)
	roadmapGetRec := httptest.NewRecorder()
	handler.ServeHTTP(roadmapGetRec, roadmapGet)
	if roadmapGetRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing auth, got %d body=%s", roadmapGetRec.Code, roadmapGetRec.Body.String())
	}

	assistantToken := mustToken(t, authz.Principal{
		MemberID:    "assistant-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleAssistant,
	})
	roadmapPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/roadmap", bytes.NewBufferString(`{"roadmap":{"objective":"Ship auth","tasks":[{"id":"task-1","title":"Lock bearer adapter","status":"in_progress","order":1,"pinned":true}]}}`))
	roadmapPut.Header.Set("Authorization", assistantToken)
	roadmapPutRec := httptest.NewRecorder()
	handler.ServeHTTP(roadmapPutRec, roadmapPut)
	if roadmapPutRec.Code != http.StatusOK {
		t.Fatalf("expected roadmap write 200, got %d body=%s", roadmapPutRec.Code, roadmapPutRec.Body.String())
	}

	projectPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/project-data", bytes.NewBufferString(`{"payload":{"projectId":"project_open_kraken","projectName":"open-kraken","attributes":{"theme":"signal"}}}`))
	projectPut.Header.Set("Authorization", mustToken(t, authz.Principal{
		MemberID:    "member-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleMember,
	}))
	projectPutRec := httptest.NewRecorder()
	handler.ServeHTTP(projectPutRec, projectPut)
	if projectPutRec.Code != http.StatusForbidden {
		t.Fatalf("expected project data write 403, got %d body=%s", projectPutRec.Code, projectPutRec.Body.String())
	}

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	projectOwnerPut := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/project-data", bytes.NewBufferString(`{"payload":{"projectId":"project_open_kraken","projectName":"open-kraken","attributes":{"theme":"signal","mode":"strict"}}}`))
	projectOwnerPut.Header.Set("Authorization", ownerToken)
	projectOwnerPutRec := httptest.NewRecorder()
	handler.ServeHTTP(projectOwnerPutRec, projectOwnerPut)
	if projectOwnerPutRec.Code != http.StatusOK {
		t.Fatalf("expected owner project data write 200, got %d body=%s", projectOwnerPutRec.Code, projectOwnerPutRec.Body.String())
	}

	projectGet := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/project-data", nil)
	projectGet.Header.Set("Authorization", ownerToken)
	projectGetRec := httptest.NewRecorder()
	handler.ServeHTTP(projectGetRec, projectGet)
	if projectGetRec.Code != http.StatusOK {
		t.Fatalf("expected project data read 200, got %d body=%s", projectGetRec.Code, projectGetRec.Body.String())
	}

	result, err := repo.ReadGlobalRoadmap(projectdata.ReadRequest{
		WorkspaceID:   "ws_open_kraken",
		WorkspacePath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("ReadGlobalRoadmap: %v", err)
	}
	if !result.Found || result.Document.Objective != "Ship auth" {
		t.Fatalf("expected persisted roadmap objective, got %+v", result)
	}
}

func TestWorkspaceRoadmapRejectsStaleExpectedVersion(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())

	token := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	first := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/roadmap", bytes.NewBufferString(`{"roadmap":{"objective":"v1","tasks":[]}}`))
	first.Header.Set("Authorization", token)
	firstRec := httptest.NewRecorder()
	handler.ServeHTTP(firstRec, first)
	if firstRec.Code != http.StatusOK {
		t.Fatalf("seed roadmap write got %d body=%s", firstRec.Code, firstRec.Body.String())
	}

	stale := httptest.NewRequest(http.MethodPut, "/api/v1/workspaces/ws_open_kraken/roadmap", bytes.NewBufferString(`{"expectedVersion":0,"roadmap":{"objective":"stale","tasks":[]}}`))
	stale.Header.Set("Authorization", token)
	staleRec := httptest.NewRecorder()
	handler.ServeHTTP(staleRec, stale)
	if staleRec.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d body=%s", staleRec.Code, staleRec.Body.String())
	}
	if !strings.Contains(staleRec.Body.String(), `"code":"version_conflict"`) {
		t.Fatalf("expected version conflict envelope, got %s", staleRec.Body.String())
	}
}

func mustToken(t *testing.T, principal authz.Principal) string {
	t.Helper()
	token, err := authn.NewDevelopmentBearerToken(principal)
	if err != nil {
		t.Fatalf("NewDevelopmentBearerToken: %v", err)
	}
	return token
}

func TestWorkspaceMembersPersistRosterToDisk(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	create := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/members", bytes.NewBufferString(`{"memberId":"roster_test_1","displayName":"RT","roleType":"member"}`))
	create.Header.Set("Authorization", ownerToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	path := filepath.Join(workspaceRoot, ".open-kraken", "roster.json")
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("roster.json missing: %v", err)
	}
}

func TestWorkspaceMembersPersistRosterToStore(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	store := &fakeRosterStore{}
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		RosterStore: store,
	}, plathttp.PermissiveWebSocketUpgrader())

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	create := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/members", bytes.NewBufferString(`{"memberId":"roster_store_1","displayName":"Store RT","roleType":"member"}`))
	create.Header.Set("Authorization", ownerToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	if store.doc.Meta.Storage != "postgres" {
		t.Fatalf("expected postgres storage metadata, got %+v", store.doc.Meta)
	}
	found := false
	for _, member := range store.doc.Members {
		if member["memberId"] == "roster_store_1" {
			found = true
		}
	}
	if !found {
		t.Fatalf("created member missing from roster store: %+v", store.doc.Members)
	}
	if _, err := os.Stat(filepath.Join(workspaceRoot, ".open-kraken", "roster.json")); !os.IsNotExist(err) {
		t.Fatalf("expected no local roster.json when roster store is configured, err=%v", err)
	}
}

func TestSystemUsersCanCreateAccountAndLogin(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	accountSvc, err := account.NewService(filepath.Join(appRoot, "accounts"), []account.SeedAccount{{
		MemberID:    "owner_1",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "Owner",
		Role:        authz.RoleOwner,
		Password:    "admin",
	}})
	if err != nil {
		t.Fatal(err)
	}
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		AccountService: accountSvc,
	}, plathttp.PermissiveWebSocketUpgrader())

	ownerToken := mustToken(t, authz.Principal{MemberID: "owner_1", WorkspaceID: "ws_open_kraken", Role: authz.RoleOwner})
	create := httptest.NewRequest(http.MethodPost, "/api/v1/system/users", bytes.NewBufferString(`{
		"memberId":"ops_1",
		"workspaceId":"ws_open_kraken",
		"displayName":"Ops",
		"role":"supervisor",
		"password":"ops-pass"
	}`))
	create.Header.Set("Authorization", ownerToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	login := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", bytes.NewBufferString(`{"memberId":"ops_1","password":"ops-pass"}`))
	loginRec := httptest.NewRecorder()
	handler.ServeHTTP(loginRec, login)
	if loginRec.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d body=%s", loginRec.Code, loginRec.Body.String())
	}
	if strings.Contains(loginRec.Body.String(), "ops-pass") {
		t.Fatalf("login response leaked password: %s", loginRec.Body.String())
	}

	demote := httptest.NewRequest(http.MethodPut, "/api/v1/system/users/owner_1", bytes.NewBufferString(`{"role":"member"}`))
	demote.Header.Set("Authorization", ownerToken)
	demoteRec := httptest.NewRecorder()
	handler.ServeHTTP(demoteRec, demote)
	if demoteRec.Code != http.StatusOK {
		t.Fatalf("expected demote 200, got %d body=%s", demoteRec.Code, demoteRec.Body.String())
	}
	createAfterDemote := httptest.NewRequest(http.MethodPost, "/api/v1/system/users", bytes.NewBufferString(`{
		"memberId":"should_fail",
		"workspaceId":"ws_open_kraken",
		"role":"member",
		"password":"x"
	}`))
	createAfterDemote.Header.Set("Authorization", ownerToken)
	forbiddenRec := httptest.NewRecorder()
	handler.ServeHTTP(forbiddenRec, createAfterDemote)
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("expected stale owner token to be forbidden after demotion, got %d body=%s", forbiddenRec.Code, forbiddenRec.Body.String())
	}
}

func TestRolePolicyBlocksMemberManagementForMemberRole(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	accountSvc, err := account.NewService(filepath.Join(appRoot, "accounts"), []account.SeedAccount{{
		MemberID:    "member_1",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "Member",
		Role:        authz.RoleMember,
		Password:    "member-pass",
	}})
	if err != nil {
		t.Fatal(err)
	}
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		AccountService: accountSvc,
	}, plathttp.PermissiveWebSocketUpgrader())

	memberToken := mustToken(t, authz.Principal{MemberID: "member_1", WorkspaceID: "ws_open_kraken", Role: authz.RoleMember})
	createMember := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/members", bytes.NewBufferString(`{"memberId":"blocked_1","displayName":"Blocked","roleType":"member"}`))
	createMember.Header.Set("Authorization", memberToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, createMember)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected member roster write 403, got %d body=%s", rec.Code, rec.Body.String())
	}

	aelRequest := httptest.NewRequest(http.MethodGet, "/api/v2/runs", nil)
	aelRequest.Header.Set("Authorization", memberToken)
	aelRec := httptest.NewRecorder()
	handler.ServeHTTP(aelRec, aelRequest)
	if aelRec.Code != http.StatusForbidden {
		t.Fatalf("expected member api v2 access 403, got %d body=%s", aelRec.Code, aelRec.Body.String())
	}
}

func TestSettingsHandlerRestrictsUsersToOwnSettings(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), realtime.NewHub(64))
	accountSvc, err := account.NewService(filepath.Join(appRoot, "accounts"), []account.SeedAccount{{
		MemberID:    "member_1",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "Member",
		Role:        authz.RoleMember,
		Password:    "member-pass",
	}, {
		MemberID:    "member_2",
		WorkspaceID: "ws_open_kraken",
		DisplayName: "Other",
		Role:        authz.RoleMember,
		Password:    "other-pass",
	}})
	if err != nil {
		t.Fatal(err)
	}
	handler := apihttp.NewHandlerWithDependencies(service, realtime.NewHub(64), repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		AccountService:  accountSvc,
		SettingsService: settings.NewService(filepath.Join(appRoot, "settings")),
	}, plathttp.PermissiveWebSocketUpgrader())

	memberToken := mustToken(t, authz.Principal{MemberID: "member_1", WorkspaceID: "ws_open_kraken", Role: authz.RoleMember})
	ownGet := httptest.NewRequest(http.MethodGet, "/api/v1/settings?memberId=member_1", nil)
	ownGet.Header.Set("Authorization", memberToken)
	ownRec := httptest.NewRecorder()
	handler.ServeHTTP(ownRec, ownGet)
	if ownRec.Code != http.StatusOK {
		t.Fatalf("expected own settings read 200, got %d body=%s", ownRec.Code, ownRec.Body.String())
	}

	otherGet := httptest.NewRequest(http.MethodGet, "/api/v1/settings?memberId=member_2", nil)
	otherGet.Header.Set("Authorization", memberToken)
	otherRec := httptest.NewRecorder()
	handler.ServeHTTP(otherRec, otherGet)
	if otherRec.Code != http.StatusForbidden {
		t.Fatalf("expected other settings read 403, got %d body=%s", otherRec.Code, otherRec.Body.String())
	}

	otherPut := httptest.NewRequest(http.MethodPut, "/api/v1/settings", bytes.NewBufferString(`{"memberId":"member_2","theme":"dark"}`))
	otherPut.Header.Set("Authorization", memberToken)
	otherPutRec := httptest.NewRecorder()
	handler.ServeHTTP(otherPutRec, otherPut)
	if otherPutRec.Code != http.StatusForbidden {
		t.Fatalf("expected other settings write 403, got %d body=%s", otherPutRec.Code, otherPutRec.Body.String())
	}
}

func TestWorkspaceCreateAgentInitializesRuntimeInstance(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	hub := realtime.NewHub(64)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	instanceMgr := instance.NewManagerWithRepository(instance.NewMemoryRepository(), nil)
	nodeSvc := node.NewService(node.NewJSONRepository(filepath.Join(appRoot, "nodes")), hub)
	if _, err := nodeSvc.Register(context.Background(), node.Node{
		ID:       "node-runtime-1",
		Hostname: "runtime-host-1",
		NodeType: node.NodeTypeK8sPod,
	}); err != nil {
		t.Fatalf("register node: %v", err)
	}
	handler := apihttp.NewHandlerWithDependencies(service, hub, repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		NodeService:      nodeSvc,
		ProviderRegistry: provider.NewRegistry(),
		InstanceManager:  instanceMgr,
	}, plathttp.PermissiveWebSocketUpgrader())

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	createTeam := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/teams", bytes.NewBufferString(`{
		"teamId":"team_runtime",
		"name":"Runtime Team"
	}`))
	createTeam.Header.Set("Authorization", ownerToken)
	teamRec := httptest.NewRecorder()
	handler.ServeHTTP(teamRec, createTeam)
	if teamRec.Code != http.StatusCreated {
		t.Fatalf("expected team create 201, got %d body=%s", teamRec.Code, teamRec.Body.String())
	}
	create := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/members", bytes.NewBufferString(`{
		"memberId":"agent_runtime_1",
		"displayName":"Runtime Agent",
		"roleType":"assistant",
		"teamId":"team_runtime",
		"createRuntime":true,
		"providerId":"shell",
		"terminalType":"shell",
		"command":"/bin/bash",
		"workingDir":"/tmp"
	}`))
	create.Header.Set("Authorization", ownerToken)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d body=%s", rec.Code, rec.Body.String())
	}

	var body struct {
		Members []map[string]any `json:"members"`
		Teams   []struct {
			TeamID  string           `json:"teamId"`
			Members []map[string]any `json:"members"`
		} `json:"teams"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	var row map[string]any
	for _, member := range body.Members {
		if member["memberId"] == "agent_runtime_1" {
			row = member
			break
		}
	}
	if row == nil {
		t.Fatalf("created agent missing from response: %s", rec.Body.String())
	}
	instanceID, _ := row["agentInstanceId"].(string)
	if instanceID == "" || row["runtimeReady"] != true || row["terminalId"] == "" {
		t.Fatalf("runtime fields missing from member row: %+v", row)
	}
	if row["agentPlacementState"] != "placed" || row["nodeId"] != "node-runtime-1" {
		t.Fatalf("placement fields missing from member row: %+v", row)
	}
	if row["teamId"] != "team_runtime" {
		t.Fatalf("teamId missing from member row: %+v", row)
	}
	foundInTargetTeam := false
	for _, team := range body.Teams {
		if team.TeamID != "team_runtime" {
			continue
		}
		for _, member := range team.Members {
			if member["memberId"] == "agent_runtime_1" {
				foundInTargetTeam = true
			}
		}
	}
	if !foundInTargetTeam {
		t.Fatalf("created agent not returned in target team: %+v", body.Teams)
	}
	inst, ok := instanceMgr.Get(instanceID)
	if !ok {
		t.Fatalf("agent instance %q not registered", instanceID)
	}
	if inst.State() != instance.StateIdle {
		t.Fatalf("expected initialized instance idle, got %s", inst.State())
	}
	if terminalID, ok := inst.GetContext("terminalId"); !ok || terminalID == "" {
		t.Fatalf("terminalId missing from instance context")
	}
	if nodeID, ok := inst.GetContext("nodeId"); !ok || nodeID != "node-runtime-1" {
		t.Fatalf("nodeId missing from instance context: %v", nodeID)
	}
	if _, found := service.ResolveMemberSession("ws_open_kraken", "agent_runtime_1"); !found {
		t.Fatalf("terminal session not ready for created agent")
	}
	placed, err := nodeSvc.GetByID(context.Background(), "node-runtime-1")
	if err != nil {
		t.Fatalf("get placement node: %v", err)
	}
	if !placed.HasAgent("agent_runtime_1") {
		t.Fatalf("created agent not assigned to node: %+v", placed.Agents)
	}
}

func TestWorkspaceConversationCreateAndSendMessage(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	hub := realtime.NewHub(64)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	handler := apihttp.NewHandlerWithDependencies(service, hub, repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())

	create := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/conversations", bytes.NewBufferString(`{"type":"direct","memberId":"assistant_1"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected conversation create 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	var created struct {
		Conversation map[string]any `json:"conversation"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	conversationID, _ := created.Conversation["id"].(string)
	if conversationID == "" {
		t.Fatalf("conversation id missing: %+v", created.Conversation)
	}
	if created.Conversation["type"] != "direct" {
		t.Fatalf("expected direct conversation, got %+v", created.Conversation)
	}

	send := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/conversations/"+conversationID+"/messages", bytes.NewBufferString(`{"senderId":"owner_1","content":{"type":"text","text":"hello from test"},"isAI":false}`))
	sendRec := httptest.NewRecorder()
	handler.ServeHTTP(sendRec, send)
	if sendRec.Code != http.StatusCreated {
		t.Fatalf("expected message create 201, got %d body=%s", sendRec.Code, sendRec.Body.String())
	}

	list := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/conversations/"+conversationID+"/messages", nil)
	listRec := httptest.NewRecorder()
	handler.ServeHTTP(listRec, list)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected message list 200, got %d body=%s", listRec.Code, listRec.Body.String())
	}
	var page struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(listRec.Body.Bytes(), &page); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	foundMessage := false
	for _, item := range page.Items {
		content, _ := item["content"].(map[string]any)
		if item["senderId"] == "owner_1" && content["text"] == "hello from test" {
			foundMessage = true
		}
	}
	if !foundMessage {
		t.Fatalf("message not persisted/listed: %+v", page.Items)
	}

	home := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/conversations", nil)
	homeRec := httptest.NewRecorder()
	handler.ServeHTTP(homeRec, home)
	if homeRec.Code != http.StatusOK {
		t.Fatalf("expected conversations 200, got %d body=%s", homeRec.Code, homeRec.Body.String())
	}
	if !bytes.Contains(homeRec.Body.Bytes(), []byte("hello from test")) {
		t.Fatalf("conversation preview not updated: %s", homeRec.Body.String())
	}

	plan := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/conversations/"+conversationID+"/messages", bytes.NewBufferString(`{"senderId":"owner_1","content":{"type":"text","text":"计划：\n- Implement chat generated roadmap\n- Verify assigned assistant task state"},"isAI":false}`))
	planRec := httptest.NewRecorder()
	handler.ServeHTTP(planRec, plan)
	if planRec.Code != http.StatusCreated {
		t.Fatalf("expected plan message create 201, got %d body=%s", planRec.Code, planRec.Body.String())
	}
	roadmap, err := repo.ReadGlobalRoadmap(projectdata.ReadRequest{
		WorkspaceID:   "ws_open_kraken",
		WorkspacePath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("ReadGlobalRoadmap after chat plan: %v", err)
	}
	if !roadmap.Found || len(roadmap.Document.Tasks) < 2 {
		t.Fatalf("expected chat plan to create roadmap tasks, got %+v", roadmap)
	}
	if roadmap.Document.Tasks[0].AssigneeID != "assistant_1" {
		t.Fatalf("expected direct assistant assignment, got %+v", roadmap.Document.Tasks[0])
	}
}

func TestWorkspaceDirectAssistantMessageEnqueuesOutbox(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	projectRepo := projectdata.NewRepository(appRoot)
	hub := realtime.NewHub(64)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	instanceMgr := instance.NewManagerWithRepository(instance.NewMemoryRepository(), nil)
	msgRepo, err := message.NewSQLiteRepository(filepath.Join(t.TempDir(), "messages.db"))
	if err != nil {
		t.Fatalf("new message repo: %v", err)
	}
	outbox, err := message.NewOutboxStore(msgRepo.(message.DBAccessor).DB())
	if err != nil {
		t.Fatalf("new outbox store: %v", err)
	}
	msgSvc := message.NewService(msgRepo, hub)
	msgSvc.SetOutboxStore(outbox)
	handler := apihttp.NewHandlerWithDependencies(service, hub, projectRepo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{
		MessageService:   msgSvc,
		ProviderRegistry: provider.NewRegistry(),
		InstanceManager:  instanceMgr,
	}, plathttp.PermissiveWebSocketUpgrader())

	ownerToken := mustToken(t, authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws_open_kraken",
		Role:        authz.RoleOwner,
	})
	createAgent := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/members", bytes.NewBufferString(`{
		"memberId":"agent_runtime_outbox",
		"displayName":"Runtime Outbox Agent",
		"roleType":"assistant",
		"createRuntime":true,
		"providerId":"shell",
		"terminalType":"shell",
		"command":"/bin/bash",
		"workingDir":"/tmp"
	}`))
	createAgent.Header.Set("Authorization", ownerToken)
	agentRec := httptest.NewRecorder()
	handler.ServeHTTP(agentRec, createAgent)
	if agentRec.Code != http.StatusCreated {
		t.Fatalf("expected runtime agent create 201, got %d body=%s", agentRec.Code, agentRec.Body.String())
	}

	create := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/conversations", bytes.NewBufferString(`{"type":"direct","memberId":"agent_runtime_outbox"}`))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, create)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected conversation create 201, got %d body=%s", rec.Code, rec.Body.String())
	}
	var created struct {
		Conversation map[string]any `json:"conversation"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	conversationID, _ := created.Conversation["id"].(string)
	if conversationID == "" {
		t.Fatalf("conversation id missing: %+v", created.Conversation)
	}

	send := httptest.NewRequest(http.MethodPost, "/api/v1/workspaces/ws_open_kraken/conversations/"+conversationID+"/messages", bytes.NewBufferString(`{"senderId":"owner_1","content":{"type":"text","text":"please inspect this instance"},"isAI":false}`))
	sendRec := httptest.NewRecorder()
	handler.ServeHTTP(sendRec, send)
	if sendRec.Code != http.StatusCreated {
		t.Fatalf("expected message create 201, got %d body=%s", sendRec.Code, sendRec.Body.String())
	}
	tasks, err := outbox.ClaimDue(context.Background(), 10)
	if err != nil {
		t.Fatalf("claim outbox: %v", err)
	}
	if len(tasks) != 1 {
		t.Fatalf("expected one outbox task, got %d", len(tasks))
	}
	if tasks[0].TargetMemberID != "agent_runtime_outbox" {
		t.Fatalf("expected agent_runtime_outbox target, got %s", tasks[0].TargetMemberID)
	}
}

func TestWorkspaceHandlerStillAcceptsLegacyHeadersAsAdapterFallback(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := projectdata.NewRepository(appRoot)
	hub := realtime.NewHub(64)
	service := terminal.NewService(session.NewRegistry(), pty.NewFakeLauncher(pty.NewFakeProcess()), hub)
	_, err := service.CreateSession(context.Background(), session.CreateRequest{
		SessionID:   "session-1",
		WorkspaceID: "ws_open_kraken",
		MemberID:    "owner-1",
	})
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}

	handler := apihttp.NewHandlerWithDependencies(service, hub, repo, workspaceRoot, "/api/v1", "/ws", apihttp.ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())
	req := httptest.NewRequest(http.MethodGet, "/api/v1/workspaces/ws_open_kraken/roadmap", nil)
	req.Header.Set("X-Open-Kraken-Actor-Id", "owner-1")
	req.Header.Set("X-Open-Kraken-Actor-Role", "owner")
	req.Header.Set("X-Open-Kraken-Workspace-Id", "ws_open_kraken")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected legacy fallback 200, got %d body=%s", rec.Code, rec.Body.String())
	}
}
