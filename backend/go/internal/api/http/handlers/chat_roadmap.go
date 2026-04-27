package handlers

import (
	"context"
	"fmt"
	"hash/fnv"
	"regexp"
	"strings"
	"time"

	"open-kraken/backend/go/internal/projectdata"
)

var roadmapTaskLine = regexp.MustCompile(`^\s*(?:[-*•]|\d+[.)]|任务[:：]|todo[:：]|task[:：])\s+(.+?)\s*$`)

func (h *WorkspaceHandler) ingestRoadmapTasksFromChat(ctx context.Context, workspaceID, conversationID, messageID, text string) {
	titles := extractRoadmapTaskTitles(text)
	if len(titles) == 0 {
		return
	}

	h.mu.Lock()
	defer h.mu.Unlock()

	existing := roadmapTasksFromState(h.state.Roadmap)
	seen := make(map[string]bool, len(existing))
	maxOrder := 0
	for _, task := range existing {
		seen[strings.ToLower(strings.TrimSpace(task.Title))] = true
		if task.Order > maxOrder {
			maxOrder = task.Order
		}
	}

	assignees := h.assistantIDsForConversationLocked(conversationID)
	created := make([]projectdata.RoadmapTask, 0, len(titles))
	for i, title := range titles {
		key := strings.ToLower(strings.TrimSpace(title))
		if key == "" || seen[key] {
			continue
		}
		maxOrder++
		task := projectdata.RoadmapTask{
			ID:        stableChatTaskID(conversationID, messageID, title),
			Title:     title,
			Status:    "todo",
			Order:     maxOrder,
			StartedAt: "",
		}
		if len(assignees) > 0 {
			task.AssigneeID = assignees[i%len(assignees)]
		}
		if task.ID == "" {
			task.ID = fmt.Sprintf("task_chat_%d", time.Now().UnixNano())
		}
		existing = append(existing, task)
		created = append(created, task)
		seen[key] = true
	}
	if len(created) == 0 {
		return
	}

	objective := readStringMap(h.state.Roadmap, "objective")
	if objective == "" {
		objective = firstSentence(text)
	}
	h.state.Roadmap = map[string]any{
		"objective": objective,
		"tasks":     existing,
	}
	if h.state.ProjectData != nil {
		h.state.ProjectData["roadmap"] = h.state.Roadmap
	}

	_, _ = h.projectRepo.WriteGlobalRoadmap(projectdata.ReadRequest{
		WorkspaceID:   workspaceID,
		WorkspacePath: h.workspaceRoot,
	}, projectdata.GlobalRoadmapDocument{
		Objective: objective,
		Tasks:     existing,
	}, projectdata.WriteOptions{})
	h.publishRoadmapLocked()
}

func extractRoadmapTaskTitles(text string) []string {
	lines := strings.Split(text, "\n")
	titles := make([]string, 0)
	for _, line := range lines {
		if match := roadmapTaskLine.FindStringSubmatch(line); len(match) == 2 {
			if title := cleanRoadmapTaskTitle(match[1]); title != "" {
				titles = append(titles, title)
			}
			continue
		}
	}
	if len(titles) == 0 && looksLikeTaskRequest(text) {
		if title := cleanRoadmapTaskTitle(text); title != "" {
			titles = append(titles, title)
		}
	}
	if len(titles) > 12 {
		return titles[:12]
	}
	return titles
}

func cleanRoadmapTaskTitle(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Trim(value, "-*• \t")
	value = strings.TrimSpace(value)
	if value == "" || len([]rune(value)) < 4 {
		return ""
	}
	if len([]rune(value)) > 180 {
		runes := []rune(value)
		value = string(runes[:180])
	}
	return value
}

func looksLikeTaskRequest(text string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	if len([]rune(lower)) < 12 {
		return false
	}
	return strings.Contains(lower, "todo") ||
		strings.Contains(lower, "task") ||
		strings.Contains(lower, "任务") ||
		strings.Contains(lower, "计划") ||
		strings.Contains(lower, "规划")
}

func roadmapTasksFromState(payload map[string]any) []projectdata.RoadmapTask {
	if payload == nil {
		return []projectdata.RoadmapTask{}
	}
	if typed, ok := payload["tasks"].([]projectdata.RoadmapTask); ok {
		return append([]projectdata.RoadmapTask(nil), typed...)
	}
	raw, _ := payload["tasks"].([]any)
	out := make([]projectdata.RoadmapTask, 0, len(raw))
	for _, item := range raw {
		row, ok := item.(map[string]any)
		if !ok {
			continue
		}
		task := projectdata.RoadmapTask{
			ID:          asString(row["id"]),
			Title:       asString(row["title"]),
			Status:      asString(row["status"]),
			AssigneeID:  asString(row["assigneeId"]),
			TeamID:      asString(row["teamId"]),
			StartedAt:   asString(row["startedAt"]),
			DueAt:       asString(row["dueAt"]),
			CompletedAt: asString(row["completedAt"]),
		}
		switch order := row["order"].(type) {
		case int:
			task.Order = order
		case float64:
			task.Order = int(order)
		}
		if task.Status == "" {
			task.Status = "todo"
		}
		out = append(out, task)
	}
	return out
}

func (h *WorkspaceHandler) assistantIDsForConversationLocked(conversationID string) []string {
	allowed := map[string]bool{}
	for _, conversation := range h.state.Conversations {
		if asString(conversation["id"]) != conversationID {
			continue
		}
		if teamID := asString(conversation["teamId"]); teamID != "" {
			for _, team := range h.teams {
				if team.TeamID == teamID {
					for _, id := range team.MemberIDs {
						allowed[id] = true
					}
				}
			}
		}
		for _, id := range asStringSlice(conversation["memberIds"]) {
			allowed[id] = true
		}
		break
	}

	var ids []string
	for _, member := range h.state.Members.Members {
		id := asString(member["memberId"])
		if id == "" || (len(allowed) > 0 && !allowed[id]) {
			continue
		}
		if asString(member["roleType"]) == "assistant" ||
			asString(member["agentInstanceId"]) != "" ||
			asString(member["agentRuntimeState"]) != "" {
			ids = append(ids, id)
		}
	}
	return ids
}

func stableChatTaskID(conversationID, messageID, title string) string {
	h := fnv.New32a()
	_, _ = h.Write([]byte(conversationID + "\x00" + messageID + "\x00" + title))
	return fmt.Sprintf("task_chat_%08x", h.Sum32())
}

func firstSentence(text string) string {
	text = strings.TrimSpace(strings.ReplaceAll(text, "\n", " "))
	if text == "" {
		return "Chat generated plan"
	}
	for _, sep := range []string{".", "。", "!", "！", "?", "？"} {
		if idx := strings.Index(text, sep); idx > 0 {
			return cleanRoadmapTaskTitle(text[:idx])
		}
	}
	return cleanRoadmapTaskTitle(text)
}
