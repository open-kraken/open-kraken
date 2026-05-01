package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
)

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
			"workspaceId": workspaceID,
			"readOnly":    false,
			"version":     result.Document.Meta.Version,
			"storage":     result.Storage,
			"warning":     result.Warning,
			"persistence": persistenceEnvelope(result.Storage, result.Warning),
			"roadmap":     roadmapPayload,
		})
	case http.MethodPut:
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		expectedVersion := readExpectedVersion(body)
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
			if value, ok := taskMap["assigneeId"].(string); ok {
				task.AssigneeID = value
			}
			if value, ok := taskMap["teamId"].(string); ok {
				task.TeamID = value
			}
			if deps, ok := taskMap["dependencies"].([]any); ok {
				for _, d := range deps {
					if s, ok := d.(string); ok {
						task.Dependencies = append(task.Dependencies, s)
					}
				}
			}
			if value, ok := taskMap["startedAt"].(string); ok {
				task.StartedAt = value
			}
			if value, ok := taskMap["dueAt"].(string); ok {
				task.DueAt = value
			}
			if value, ok := taskMap["completedAt"].(string); ok {
				task.CompletedAt = value
			}
			tasks = append(tasks, task)
		}
		result, err := h.projectWriter.WriteGlobalRoadmap(authCtx, req, projectdata.GlobalRoadmapDocument{
			Objective: readStringMap(roadmapPayload, "objective"),
			Tasks:     tasks,
		}, projectdata.WriteOptions{ExpectedVersion: expectedVersion})
		if err != nil {
			if errors.Is(err, projectdata.ErrVersionConflict) {
				writeError(w, http.StatusConflict, err)
			} else {
				writeAuthzError(w, err)
			}
			return
		}
		h.mu.Lock()
		h.roadmapVersion = result.Document.Meta.Version
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
			"workspaceId": workspaceID,
			"readOnly":    false,
			"version":     result.Document.Meta.Version,
			"storage":     result.Storage,
			"warning":     result.Warning,
			"persistence": persistenceEnvelope(result.Storage, result.Warning),
			"roadmap":     h.state.Roadmap,
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
			"workspaceId": workspaceID,
			"projectId":   readStringMap(payload, "projectId"),
			"projectName": readStringMap(payload, "projectName"),
			"attributes":  readMapMap(payload, "attributes"),
			"readOnly":    false,
			"version":     result.Document.Meta.Version,
			"storage":     result.Storage,
			"warning":     result.Warning,
			"persistence": persistenceEnvelope(result.Storage, result.Warning),
			"payload":     payload,
		})
	case http.MethodPut:
		var body map[string]any
		if !decodeJSON(r, &body, w) {
			return
		}
		expectedVersion := readExpectedVersion(body)
		payload, _ := body["payload"].(map[string]any)
		if payload == nil {
			payload = body
		}
		result, err := h.projectWriter.WriteProjectData(authCtx, req, projectdata.ProjectDataDocument{
			ProjectID:   readStringMap(payload, "projectId"),
			ProjectName: readStringMap(payload, "projectName"),
			Attributes:  readMapMap(payload, "attributes"),
		}, projectdata.WriteOptions{ExpectedVersion: expectedVersion})
		if err != nil {
			if errors.Is(err, projectdata.ErrVersionConflict) {
				writeError(w, http.StatusConflict, err)
			} else {
				writeAuthzError(w, err)
			}
			return
		}
		h.mu.Lock()
		h.state.ProjectData["workspaceId"] = workspaceID
		h.state.ProjectData["projectId"] = result.Document.ProjectID
		h.state.ProjectData["projectName"] = result.Document.ProjectName
		h.state.ProjectData["attributes"] = result.Document.Attributes
		if roadmapPayload, ok := payload["roadmap"].(map[string]any); ok {
			h.state.Roadmap = cloneMap(roadmapPayload)
			h.roadmapVersion = result.Document.Meta.Version
			h.publishRoadmapLocked()
			h.state.ProjectData["roadmap"] = cloneMap(roadmapPayload)
		}
		h.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{
			"workspaceId": workspaceID,
			"projectId":   result.Document.ProjectID,
			"projectName": result.Document.ProjectName,
			"attributes":  result.Document.Attributes,
			"readOnly":    false,
			"version":     result.Document.Meta.Version,
			"storage":     result.Storage,
			"warning":     result.Warning,
			"persistence": persistenceEnvelope(result.Storage, result.Warning),
			"payload":     h.state.ProjectData,
		})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func readExpectedVersion(body map[string]any) *int64 {
	switch value := body["expectedVersion"].(type) {
	case float64:
		version := int64(value)
		return &version
	case int:
		version := int64(value)
		return &version
	case int64:
		version := value
		return &version
	case json.Number:
		if parsed, err := value.Int64(); err == nil {
			return &parsed
		}
	}
	return nil
}

func (h *WorkspaceHandler) publishRoadmapLocked() {
	version := uint64(h.roadmapVersion)
	if version == 0 {
		version = 1
	}
	itemIDs := make([]string, 0)
	if tasks, ok := h.state.Roadmap["tasks"].([]projectdata.RoadmapTask); ok {
		for _, task := range tasks {
			itemIDs = append(itemIDs, task.ID)
		}
	} else if tasks, ok := h.state.Roadmap["tasks"].([]any); ok {
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
			Version:     version,
		},
	})
	h.hub.Publish(realtime.Event{
		Name:        realtime.EventRoadmapUpdated,
		WorkspaceID: h.state.Workspace.ID,
		Payload: realtime.RoadmapUpdatedPayload{
			WorkspaceID: h.state.Workspace.ID,
			Version:     version,
			Reason:      "write_committed",
		},
	})
}
