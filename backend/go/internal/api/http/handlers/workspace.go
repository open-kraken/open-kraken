package handlers

import (
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
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

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
	state         workspaceFixture
	authorizer    authz.Service
	projectRepo   projectdata.ProjectDataRepository
	projectWriter projectdata.GuardedService
	workspaceRoot string
}

func NewWorkspaceHandler(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string) *WorkspaceHandler {
	handler := &WorkspaceHandler{
		hub:           hub,
		service:       service,
		state:         loadWorkspaceFixture(),
		authorizer:    authz.NewService(),
		projectRepo:   projectRepo,
		projectWriter: projectdata.NewGuardedService(projectRepo),
		workspaceRoot: strings.TrimSpace(workspaceRoot),
	}
	handler.publishSnapshots()
	return handler
}

func (h *WorkspaceHandler) HandleChatHome(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"workspace":             h.state.Workspace,
		"conversations":         h.state.Conversations,
		"members":               h.state.Members.Members,
		"defaultConversationId": firstConversationID(h.state.Conversations),
		"totalUnreadCount":      totalUnreadCount(h.state.Conversations),
	})
}

func (h *WorkspaceHandler) HandleConversations(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		h.HandleChatHome(w, r, workspaceID)
		return
	}
	conversationID := parts[0]
	if len(parts) == 2 && parts[1] == "messages" {
		switch r.Method {
		case http.MethodGet:
			h.handleMessagesList(w, conversationID)
		case http.MethodPost:
			h.handleMessagesCreate(w, r, workspaceID, conversationID)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *WorkspaceHandler) HandleMembers(w http.ResponseWriter, r *http.Request, workspaceID string, parts []string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if len(parts) == 0 && r.Method == http.MethodGet {
		h.mu.RLock()
		defer h.mu.RUnlock()
		writeJSON(w, http.StatusOK, map[string]any{"members": h.state.Members.Members})
		return
	}
	if len(parts) == 1 && parts[0] == "status" && r.Method == http.MethodPatch {
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		memberID, _ := body["memberId"].(string)
		h.mu.Lock()
		defer h.mu.Unlock()
		for _, member := range h.state.Members.Members {
			if member["memberId"] == memberID {
				if manual, ok := body["manualStatus"].(string); ok {
					member["manualStatus"] = manual
				}
				if terminalStatus, ok := body["terminalStatus"].(string); ok {
					member["terminalStatus"] = terminalStatus
				}
				h.publishPresenceLocked()
				writeJSON(w, http.StatusOK, map[string]any{"members": h.state.Members.Members})
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNotFound)
}

func (h *WorkspaceHandler) HandleRoadmap(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	authCtx, err := authContextFromRequest(r, authz.ActionRoadmapRead)
	if err != nil {
		writeAuthzError(w, err)
		return
	}
	authCtx.WorkspaceID = workspaceID
	req := projectdata.ReadRequest{WorkspaceID: workspaceID, WorkspacePath: h.workspaceRoot}
	switch r.Method {
	case http.MethodGet:
		if err := h.authorizer.Enforce(authCtx); err != nil {
			writeAuthzError(w, err)
			return
		}
		result, err := h.projectRepo.ReadGlobalRoadmap(req)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		roadmapPayload := h.state.Roadmap
		if result.Found {
			roadmapPayload = map[string]any{
				"objective": result.Document.Objective,
				"tasks":     result.Document.Tasks,
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"readOnly": false,
			"storage":  result.Storage,
			"warning":  result.Warning,
			"roadmap":  roadmapPayload,
		})
	case http.MethodPut:
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		roadmapPayload, _ := body["roadmap"].(map[string]any)
		roadmapTasks, _ := roadmapPayload["tasks"].([]any)
		tasks := make([]projectdata.RoadmapTask, 0, len(roadmapTasks))
		for _, item := range roadmapTasks {
			taskMap, ok := item.(map[string]any)
			if !ok {
				continue
			}
			task := projectdata.RoadmapTask{}
			if value, ok := taskMap["id"].(string); ok {
				task.ID = value
			}
			if value, ok := taskMap["title"].(string); ok {
				task.Title = value
			}
			if value, ok := taskMap["status"].(string); ok {
				task.Status = value
			}
			if value, ok := taskMap["pinned"].(bool); ok {
				task.Pinned = value
			}
			switch value := taskMap["order"].(type) {
			case float64:
				task.Order = int(value)
			case int:
				task.Order = value
			}
			tasks = append(tasks, task)
		}
		result, err := h.projectWriter.WriteGlobalRoadmap(authCtx, req, projectdata.GlobalRoadmapDocument{
			Objective: readStringMap(roadmapPayload, "objective"),
			Tasks:     tasks,
		}, projectdata.WriteOptions{})
		if err != nil {
			writeAuthzError(w, err)
			return
		}
		h.mu.Lock()
		h.state.Roadmap = map[string]any{
			"objective": result.Document.Objective,
			"tasks":     result.Document.Tasks,
		}
		if projectRoadmap, ok := h.state.ProjectData["roadmap"].(map[string]any); ok {
			for k := range projectRoadmap {
				delete(projectRoadmap, k)
			}
			for k, v := range h.state.Roadmap {
				projectRoadmap[k] = v
			}
		}
		h.publishRoadmapLocked()
		h.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"readOnly": false,
			"storage":  result.Storage,
			"warning":  result.Warning,
			"roadmap":  h.state.Roadmap,
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *WorkspaceHandler) HandleProjectData(w http.ResponseWriter, r *http.Request, workspaceID string) {
	if workspaceID != h.state.Workspace.ID {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	authCtx, err := authContextFromRequest(r, authz.ActionProjectDataRead)
	if err != nil {
		writeAuthzError(w, err)
		return
	}
	authCtx.WorkspaceID = workspaceID
	req := projectdata.ReadRequest{WorkspaceID: workspaceID, WorkspacePath: h.workspaceRoot}
	switch r.Method {
	case http.MethodGet:
		if err := h.authorizer.Enforce(authCtx); err != nil {
			writeAuthzError(w, err)
			return
		}
		result, err := h.projectRepo.ReadProjectData(req)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		payload := h.state.ProjectData
		if result.Found {
			payload = map[string]any{
				"workspaceId": workspaceID,
				"projectId":   result.Document.ProjectID,
				"projectName": result.Document.ProjectName,
				"attributes":  result.Document.Attributes,
				"roadmap":     h.state.ProjectData["roadmap"],
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"readOnly": false,
			"storage":  result.Storage,
			"warning":  result.Warning,
			"payload":  payload,
		})
	case http.MethodPut:
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		payload, _ := body["payload"].(map[string]any)
		if payload == nil {
			payload = body
		}
		result, err := h.projectWriter.WriteProjectData(authCtx, req, projectdata.ProjectDataDocument{
			ProjectID:   readStringMap(payload, "projectId"),
			ProjectName: readStringMap(payload, "projectName"),
			Attributes:  readMapMap(payload, "attributes"),
		}, projectdata.WriteOptions{})
		if err != nil {
			writeAuthzError(w, err)
			return
		}
		h.mu.Lock()
		h.state.ProjectData["workspaceId"] = workspaceID
		h.state.ProjectData["projectId"] = result.Document.ProjectID
		h.state.ProjectData["projectName"] = result.Document.ProjectName
		h.state.ProjectData["attributes"] = result.Document.Attributes
		if roadmapPayload, ok := payload["roadmap"].(map[string]any); ok {
			h.state.Roadmap = cloneMap(roadmapPayload)
			h.publishRoadmapLocked()
			h.state.ProjectData["roadmap"] = cloneMap(roadmapPayload)
		}
		h.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"readOnly": false,
			"storage":  result.Storage,
			"warning":  result.Warning,
			"payload":  h.state.ProjectData,
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

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

func (h *WorkspaceHandler) handleMessagesList(w http.ResponseWriter, conversationID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"conversationId": conversationID,
		"items":          h.state.Messages[conversationID],
		"nextBefore":     nil,
	})
}

func (h *WorkspaceHandler) handleMessagesCreate(w http.ResponseWriter, r *http.Request, workspaceID, conversationID string) {
	var body map[string]any
	if !decodeJSON(r, &body, w) {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	message := map[string]any{
		"id":        "msg_" + time.Now().UTC().Format("150405.000"),
		"senderId":  body["senderId"],
		"content":   body["content"],
		"createdAt": time.Now().UTC().UnixMilli(),
		"isAi":      false,
		"status":    "sent",
	}
	h.state.Messages[conversationID] = append(h.state.Messages[conversationID], message)
	updateConversationPreview(h.state.Conversations, conversationID, message)
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatDelta,
		WorkspaceID: workspaceID,
		ChannelID:   conversationID,
		Payload: realtime.ChatDeltaPayload{
			ConversationID: conversationID,
			MessageID:      message["id"].(string),
			Sequence:       uint64(len(h.state.Messages[conversationID])),
			Body:           readMessageText(message),
		},
	})
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatStatus,
		WorkspaceID: workspaceID,
		ChannelID:   conversationID,
		Payload: realtime.ChatStatusPayload{
			ConversationID: conversationID,
			MessageID:      message["id"].(string),
			Status:         "sent",
		},
	})
	h.publishChatSnapshotLocked(conversationID)
	writeJSON(w, http.StatusCreated, map[string]any{"message": message})
}

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

func (h *WorkspaceHandler) publishChatSnapshotLocked(conversationID string) {
	items := h.state.Messages[conversationID]
	messageIDs := make([]string, 0, len(items))
	for _, item := range items {
		if id, _ := item["id"].(string); id != "" {
			messageIDs = append(messageIDs, id)
		}
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventChatSnapshot,
		WorkspaceID: h.state.Workspace.ID,
		ChannelID:   conversationID,
		Payload: realtime.ChatSnapshotPayload{
			ConversationID: conversationID,
			MessageIDs:     messageIDs,
		},
	})
}

func (h *WorkspaceHandler) publishPresenceLocked() {
	members := make([]realtime.PresenceMember, 0, len(h.state.Members.Members))
	for _, member := range h.state.Members.Members {
		members = append(members, realtime.PresenceMember{
			MemberID:       asString(member["memberId"]),
			PresenceState:  asString(member["manualStatus"]),
			TerminalStatus: asString(member["terminalStatus"]),
			LastHeartbeat:  time.Now().UTC(),
		})
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventPresenceSnapshot,
		WorkspaceID: h.state.Workspace.ID,
		Payload:     realtime.PresenceSnapshotPayload{Members: members},
	})
}

func (h *WorkspaceHandler) publishRoadmapLocked() {
	itemIDs := make([]string, 0)
	if tasks, ok := h.state.Roadmap["tasks"].([]any); ok {
		for _, task := range tasks {
			if row, ok := task.(map[string]any); ok {
				itemIDs = append(itemIDs, asString(row["id"]))
			}
		}
	}
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventRoadmapSnapshot,
		WorkspaceID: h.state.Workspace.ID,
		Payload: realtime.RoadmapSnapshotPayload{
			WorkspaceID: h.state.Workspace.ID,
			ItemIDs:     itemIDs,
			Version:     1,
		},
	})
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventRoadmapUpdated,
		WorkspaceID: h.state.Workspace.ID,
		Payload: realtime.RoadmapUpdatedPayload{
			WorkspaceID: h.state.Workspace.ID,
			Version:     1,
			Reason:      "write_committed",
		},
	})
}

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

func updateConversationPreview(conversations []map[string]any, conversationID string, message map[string]any) {
	for _, conversation := range conversations {
		if asString(conversation["id"]) == conversationID {
			conversation["lastMessageAt"] = message["createdAt"]
			conversation["lastMessagePreview"] = readMessageText(message)
		}
	}
}

func readMessageText(message map[string]any) string {
	content, _ := message["content"].(map[string]any)
	return asString(content["text"])
}

func firstConversationID(items []map[string]any) any {
	if len(items) == 0 {
		return nil
	}
	return items[0]["id"]
}

func totalUnreadCount(items []map[string]any) int {
	total := 0
	for _, item := range items {
		switch value := item["unreadCount"].(type) {
		case float64:
			total += int(value)
		case int:
			total += value
		}
	}
	return total
}

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
