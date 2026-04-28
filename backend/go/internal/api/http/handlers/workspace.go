package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/settings"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/provider"
)

type teamFixtureRow struct {
	TeamID  string           `json:"teamId"`
	Name    string           `json:"name"`
	Members []map[string]any `json:"members"`
}

type workspaceFixture struct {
	Workspace struct {
		ID       string `json:"id"`
		Name     string `json:"name"`
		RootPath string `json:"rootPath"`
		ReadOnly bool   `json:"readOnly"`
	} `json:"workspace"`
	Members struct {
		Members []map[string]any `json:"members"`
	} `json:"members"`
	Teams         []teamFixtureRow            `json:"teams"`
	Conversations []map[string]any            `json:"conversations"`
	Messages      map[string][]map[string]any `json:"messages"`
	Roadmap       map[string]any              `json:"roadmap"`
	ProjectData   map[string]any              `json:"projectData"`
	Terminals     []map[string]any            `json:"terminalSessions"`
}

type WorkspaceHandler struct {
	mu            sync.RWMutex
	hub           *realtime.Hub
	service       *terminal.Service
	msgSvc        *message.Service // nil = fallback to fixture messages
	state         workspaceFixture
	authorizer    authz.Service
	projectRepo   projectdata.ProjectDataRepository
	projectWriter projectdata.GuardedService
	workspaceRoot string
	instanceMgr   *instance.Manager
	providerReg   *provider.Registry
	nodeSvc       *node.Service
	settingsSvc   *settings.Service
	// teams mirrors roster.json (memberIds); expanded in API responses.
	teams         []roster.Team
	rosterVersion int64
	rosterStore   roster.Store
	rosterStorage string
}

func NewWorkspaceHandler(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string) *WorkspaceHandler {
	handler := newWorkspaceHandlerBase(service, hub, projectRepo, workspaceRoot)
	handler.initRosterFromDisk()
	handler.publishSnapshots()
	return handler
}

func NewWorkspaceHandlerWithRosterStore(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string, store roster.Store) (*WorkspaceHandler, error) {
	handler := newWorkspaceHandlerBase(service, hub, projectRepo, workspaceRoot)
	if store != nil {
		if err := handler.SetRosterStore(context.Background(), store); err != nil {
			return nil, err
		}
	} else {
		handler.initRosterFromDisk()
	}
	handler.publishSnapshots()
	return handler, nil
}

func newWorkspaceHandlerBase(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string) *WorkspaceHandler {
	handler := &WorkspaceHandler{
		hub:           hub,
		service:       service,
		state:         loadWorkspaceFixture(),
		authorizer:    authz.NewService(),
		projectRepo:   projectRepo,
		projectWriter: projectdata.NewGuardedService(projectRepo),
		workspaceRoot: strings.TrimSpace(workspaceRoot),
		rosterStorage: "workspace",
	}
	handler.teams = teamsFromFixtureTeams(handler.state.Teams)
	handler.ensureDefaultTeam()
	return handler
}

// SetRosterStore switches team/member roster persistence to the supplied
// durable store. When the store is empty, the current fixture/file roster is
// seeded into it so a cluster deployment starts with the same baseline data.
func (h *WorkspaceHandler) SetRosterStore(ctx context.Context, store roster.Store) error {
	if store == nil {
		return nil
	}
	doc, found, err := store.Read(ctx, h.state.Workspace.ID)
	if err != nil {
		return err
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	h.rosterStore = store
	h.rosterStorage = "postgres"
	if found {
		h.state.Members.Members = doc.Members
		h.teams = doc.Teams
		h.ensureDefaultTeam()
		h.rosterVersion = doc.Meta.Version
		if h.rosterVersion < 1 {
			h.rosterVersion = 1
		}
		return nil
	}
	return h.persistRosterLocked()
}

// SetMessageService injects the message service for persistent message handling.
// When set, message list/create routes delegate to the service instead of fixture data.
func (h *WorkspaceHandler) SetMessageService(svc *message.Service) {
	h.msgSvc = svc
}

// SetAgentRuntime wires the backend AgentInstance pool and provider registry
// used when the UI creates a real AI agent, not just a roster row.
func (h *WorkspaceHandler) SetAgentRuntime(mgr *instance.Manager, reg *provider.Registry, nodeSvc *node.Service) {
	h.instanceMgr = mgr
	h.providerReg = reg
	h.nodeSvc = nodeSvc
}

func (h *WorkspaceHandler) SetSettingsService(svc *settings.Service) {
	h.settingsSvc = svc
}

// publishSnapshots publishes initial snapshot events for all conversations,
// presence, and roadmap state.
func (h *WorkspaceHandler) publishSnapshots() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, conversation := range h.state.Conversations {
		if id, _ := conversation["id"].(string); id != "" {
			h.publishChatSnapshotLocked(id)
		}
	}
	h.publishPresenceLocked()
	h.publishRoadmapLocked()
}

// --- Terminal routes (workspace-scoped) ---

func (h *WorkspaceHandler) HandleTerminalRoutes(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 && r.Method == http.MethodGet {
		items := h.service.ListSessions(workspaceID)
		writeJSON(w, http.StatusOK, map[string]any{"items": decorateSessions(items, nil)})
		return
	}
	if len(parts) == 2 && parts[1] == "attach" && r.Method == http.MethodGet {
		terminalID := parts[0]
		envelope, err := h.service.AttachSession(session.AttachRequest{
			SessionID:    terminalID,
			SubscriberID: "http-attach",
			AfterSeq:     0,
		})
		if err != nil {
			writeServiceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"session":  decorateSession(findSession(h.service.ListSessions(workspaceID), terminalID), nil),
			"snapshot": envelope.Snapshot,
			"recovery": recoveryEnvelope("snapshot", "", false, "snapshot_only"),
		})
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

// --- Fixture loading ---

func loadWorkspaceFixture() workspaceFixture {
	_, file, _, _ := runtime.Caller(0)
	root := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "..", ".."))
	path := filepath.Join(root, "backend", "tests", "fixtures", "workspace-fixture.json")
	bytes, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	var fixture workspaceFixture
	if err := json.Unmarshal(bytes, &fixture); err != nil {
		panic(err)
	}
	return fixture
}

// --- Session decoration helpers ---

func persistenceEnvelope(storage projectdata.Storage, warning string) map[string]any {
	return map[string]any{
		"storage": storage,
		"warning": warning,
		"error":   nil,
	}
}

func recoveryEnvelope(mode, lastAckCursor string, resyncRequired bool, terminalReplay string) map[string]any {
	var cursor any
	if lastAckCursor == "" {
		cursor = nil
	} else {
		cursor = lastAckCursor
	}
	return map[string]any{
		"mode":           mode,
		"lastAckCursor":  cursor,
		"resyncRequired": resyncRequired,
		"terminalReplay": terminalReplay,
		"dedupeKey":      "cursor_then_terminal_seq",
	}
}

func decorateSessions(items []session.SessionInfo, cursor *string) []map[string]any {
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		out = append(out, decorateSession(item, cursor))
	}
	return out
}

func decorateSession(item session.SessionInfo, cursor *string) map[string]any {
	lastCursor := ""
	if cursor != nil {
		lastCursor = *cursor
	}
	return map[string]any{
		"terminalId":   item.SessionID,
		"memberId":     item.MemberID,
		"workspaceId":  item.WorkspaceID,
		"terminalType": item.TerminalType,
		"command":      item.Command,
		"status":       string(item.Status),
		"seq":          item.Seq,
		"unackedBytes": 0,
		"keepAlive":    item.KeepAlive,
		"createdAt":    item.CreatedAt.Format(time.RFC3339),
		"updatedAt":    item.UpdatedAt.Format(time.RFC3339),
		"recovery":     recoveryEnvelope("replay", lastCursor, false, "delta_after_snapshot"),
		"snapshot": map[string]any{
			"terminalId": item.SessionID,
			"seq":        item.Seq,
			"buffer": map[string]any{
				"data":      "",
				"rows":      24,
				"cols":      80,
				"cursorRow": 0,
				"cursorCol": 0,
			},
		},
	}
}

func findSession(items []session.SessionInfo, sessionID string) session.SessionInfo {
	for _, item := range items {
		if item.SessionID == sessionID {
			return item
		}
	}
	return session.SessionInfo{}
}

// --- Utility helpers ---

func asString(value any) string {
	text, _ := value.(string)
	return text
}

func readStringMap(input map[string]any, key string) string {
	value, _ := input[key].(string)
	return value
}

func readMapMap(input map[string]any, key string) map[string]any {
	value, _ := input[key].(map[string]any)
	if value == nil {
		return map[string]any{}
	}
	return cloneMap(value)
}

func cloneMap(input map[string]any) map[string]any {
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

// --- Workspace route dispatch ---

var errWorkspaceRouteNotFound = errors.New("workspace route not found")

func HandleWorkspaceRoute(handler *WorkspaceHandler, w http.ResponseWriter, r *http.Request) error {
	path := strings.Trim(r.URL.Path, "/")
	parts := strings.Split(path, "/")
	if len(parts) < 4 || parts[0] != "api" || parts[1] != "v1" || parts[2] != "workspaces" {
		return errWorkspaceRouteNotFound
	}
	workspaceID := parts[3]
	resource := parts[4:]
	if len(resource) == 0 {
		return errWorkspaceRouteNotFound
	}
	switch resource[0] {
	case "chat":
		if len(resource) == 2 && resource[1] == "home" {
			handler.HandleChatHome(w, r, workspaceID)
			return nil
		}
	case "conversations":
		handler.HandleConversations(w, r, workspaceID, resource[1:])
		return nil
	case "members":
		handler.HandleMembers(w, r, workspaceID, resource[1:])
		return nil
	case "teams":
		handler.HandleTeams(w, r, workspaceID, resource[1:])
		return nil
	case "roadmap":
		handler.HandleRoadmap(w, r, workspaceID)
		return nil
	case "project-data":
		handler.HandleProjectData(w, r, workspaceID)
		return nil
	case "terminals":
		handler.HandleTerminalRoutes(w, r, workspaceID, resource[1:])
		return nil
	case "terminal":
		if len(resource) >= 3 && resource[1] == "sessions" && resource[len(resource)-1] == "attach" {
			handler.HandleTerminalRoutes(w, r, workspaceID, []string{resource[2], "attach"})
			return nil
		}
	}
	return errWorkspaceRouteNotFound
}
