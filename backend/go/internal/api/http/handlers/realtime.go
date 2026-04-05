package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

type RealtimeHandler struct {
	service       *terminal.Service
	hub           *realtime.Hub
	authorizer    authz.Service
	startupCursor string
}

func NewRealtimeHandler(service *terminal.Service, hub *realtime.Hub) *RealtimeHandler {
	return &RealtimeHandler{
		service:       service,
		hub:           hub,
		authorizer:    authz.NewService(),
		startupCursor: hub.LatestCursor(),
	}
}

var upgrader = websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}

func (h *RealtimeHandler) HandleWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	var writeMu sync.Mutex
	writeJSON := func(value interface{}) error {
		writeMu.Lock()
		defer writeMu.Unlock()
		return conn.WriteJSON(value)
	}
	sessionCtx, cancelSession := context.WithCancel(context.Background())
	defer cancelSession()
	var relayMu sync.Mutex
	var stopRelay context.CancelFunc
	stopCurrentRelay := func() {
		relayMu.Lock()
		cancel := stopRelay
		stopRelay = nil
		relayMu.Unlock()
		if cancel != nil {
			cancel()
		}
	}
	defer stopCurrentRelay()
	startRelay := func(subscription *realtime.Subscription, backlog []realtime.Event) {
		relayCtx, relayCancel := context.WithCancel(sessionCtx)
		relayMu.Lock()
		prev := stopRelay
		stopRelay = relayCancel
		relayMu.Unlock()
		if prev != nil {
			prev()
		}
		go func() {
			defer subscription.Close()
			for _, event := range backlog {
				select {
				case <-relayCtx.Done():
					return
				default:
				}
				if err := writeJSON(event); err != nil {
					cancelSession()
					return
				}
			}
			for {
				select {
				case <-relayCtx.Done():
					return
				case event, ok := <-subscription.Events:
					if !ok {
						return
					}
					if err := writeJSON(event); err != nil {
						cancelSession()
						return
					}
				}
			}
		}()
	}

	query := r.URL.Query()
	workspaceID := strings.TrimSpace(query.Get("workspaceId"))
	memberID := strings.TrimSpace(query.Get("memberId"))
	subscriptions := parseSubscriptions(query.Get("subscriptions"))
	channelIDs := query["conversationId"]
	terminalIDs := query["terminalId"]
	if workspaceID == "" || memberID == "" {
		_ = writeJSON(handshakeRejected("realtime_invalid_handshake", "workspaceId and memberId are required", http.StatusBadRequest))
		return
	}
	authCtx, err := authContextFromRequest(r, authz.ActionTerminalAttach)
	if err != nil {
		_ = writeJSON(handshakeRejected("auth.unauthorized", err.Error(), http.StatusUnauthorized))
		return
	}
	authCtx.WorkspaceID = workspaceID
	authCtx.TargetMemberID = memberID
	if err := h.authorizer.Enforce(authCtx); err != nil {
		_ = writeJSON(handshakeRejected("auth.capability_denied", err.Error(), http.StatusForbidden))
		return
	}

	result, err := h.hub.Subscribe(realtime.SubscribeRequest{
		WorkspaceID: workspaceID,
		ChannelIDs:  channelIDs,
		TerminalIDs: terminalIDs,
		Cursor:      strings.TrimSpace(query.Get("cursor")),
	})
	if err != nil {
		if err == realtime.ErrCursorAhead && h.startupCursor == realtime.NewCursor(0) {
			result, err = h.hub.Subscribe(realtime.SubscribeRequest{
				WorkspaceID: workspaceID,
				ChannelIDs:  channelIDs,
				TerminalIDs: terminalIDs,
			})
			if err == nil {
				result.Mode = "snapshot"
				result.ResyncRequired = true
			}
		}
	}
	if err != nil {
		_ = writeJSON(handshakeRejected("realtime_invalid_cursor", err.Error(), http.StatusBadRequest))
		return
	}
	defer result.Subscription.Close()

	if err := writeJSON(handshakeAccepted(workspaceID, memberID, subscriptions, channelIDs, terminalIDs, strings.TrimSpace(query.Get("cursor")), result)); err != nil {
		return
	}
	startRelay(result.Subscription, result.Events)

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			var envelope struct {
				Type    string          `json:"type"`
				Payload json.RawMessage `json:"payload"`
			}
			if err := conn.ReadJSON(&envelope); err != nil {
				return
			}
			if envelope.Type != session.EventAttach {
				continue
			}
			var req session.AttachRequest
			if err := json.Unmarshal(envelope.Payload, &req); err != nil {
				return
			}
			stopCurrentRelay()
			authCtx, err := authContextFromRequest(r, authz.ActionTerminalAttach)
			if err != nil {
				_ = writeJSON(realtime.Event{
					Name:        realtime.EventTerminalStatus,
					WorkspaceID: workspaceID,
					MemberID:    memberID,
					TerminalID:  req.SessionID,
					Payload: realtime.TerminalStatusPayload{
						TerminalID:      req.SessionID,
						ConnectionState: "detached",
						ProcessState:    "failed",
						Reason:          err.Error(),
					},
				})
				continue
			}
			attach, err := h.service.AttachSessionAuthorized(req, authCtx, h.authorizer)
			if err != nil {
				_ = writeJSON(realtime.Event{
					Name:        realtime.EventTerminalStatus,
					WorkspaceID: workspaceID,
					MemberID:    memberID,
					TerminalID:  req.SessionID,
					Payload: realtime.TerminalStatusPayload{
						TerminalID:      req.SessionID,
						ConnectionState: "detached",
						ProcessState:    "failed",
						Reason:          err.Error(),
					},
				})
				continue
			}
			if err := writeJSON(realtime.Event{
				Name:        realtime.EventTerminalAttach,
				WorkspaceID: workspaceID,
				MemberID:    memberID,
				TerminalID:  attach.Snapshot.SessionID,
				Payload: realtime.TerminalAttachPayload{
					TerminalID:      attach.Snapshot.SessionID,
					ConnectionState: "attached",
					ProcessState:    session.ProcessState(attach.Snapshot.TerminalStatus),
				},
			}); err != nil {
				return
			}
			if err := writeJSON(realtime.Event{
				Name:        realtime.EventTerminalSnapshot,
				WorkspaceID: workspaceID,
				MemberID:    memberID,
				TerminalID:  attach.Snapshot.SessionID,
				Payload: realtime.TerminalSnapshotPayload{
					TerminalID:      attach.Snapshot.SessionID,
					ConnectionState: "attached",
					ProcessState:    session.ProcessState(attach.Snapshot.TerminalStatus),
					Rows:            int(attach.Snapshot.Rows),
					Cols:            int(attach.Snapshot.Cols),
					Buffer:          attach.Snapshot.Buffer,
				},
			}); err != nil {
				return
			}
			for _, delta := range attach.Deltas {
				if err := writeJSON(realtime.Event{
					Name:        realtime.EventTerminalDelta,
					WorkspaceID: workspaceID,
					MemberID:    memberID,
					TerminalID:  delta.SessionID,
					Payload: realtime.TerminalDeltaPayload{
						TerminalID: delta.SessionID,
						Sequence:   delta.Seq,
						Data:       delta.Data,
					},
				}); err != nil {
					return
				}
			}
			if err := writeJSON(realtime.Event{
				Name:        realtime.EventTerminalStatus,
				WorkspaceID: workspaceID,
				MemberID:    memberID,
				TerminalID:  attach.Status.SessionID,
				Payload: realtime.TerminalStatusPayload{
					TerminalID:      attach.Status.SessionID,
					ConnectionState: "attached",
					ProcessState:    session.ProcessState(attach.Status.TerminalStatus),
					Reason:          "attach_replay_complete",
				},
			}); err != nil {
				return
			}
			cursor := h.hub.LatestCursor()
			nextResult, err := h.hub.Subscribe(realtime.SubscribeRequest{
				WorkspaceID: workspaceID,
				ChannelIDs:  channelIDs,
				TerminalIDs: unionIDs(terminalIDs, req.SessionID),
				Cursor:      cursor,
			})
			if err != nil {
				return
			}
			startRelay(nextResult.Subscription, nextResult.Events)
		}
	}()
	select {
	case <-done:
	case <-sessionCtx.Done():
	}
}

func handshakeAccepted(workspaceID, memberID string, subscriptions map[string]bool, channelIDs, terminalIDs []string, requestedCursor string, result *realtime.SubscribeResult) map[string]any {
	scope := map[string]any{}
	scope["chat"] = subscriptions["chat"]
	if len(channelIDs) > 0 {
		scope["chat"] = channelIDs
	}
	scope["members"] = subscriptions["members"]
	scope["roadmap"] = subscriptions["roadmap"]
	scope["terminal"] = subscriptions["terminal"]
	if len(terminalIDs) > 0 {
		scope["terminal"] = terminalIDs
	}
	return map[string]any{
		"type":                "handshake.accepted",
		"workspaceId":         workspaceID,
		"memberId":            memberID,
		"subscriptionScope":   scope,
		"mode":                result.Mode,
		"cursor":              result.LatestCursor,
		"replayFromCursor":    requestedCursor,
		"resyncRequired":      result.ResyncRequired,
		"recovery":            recoveryEnvelopeForHandshake(requestedCursor, result),
		"heartbeatIntervalMs": 15000,
	}
}

func handshakeRejected(code, message string, status int) map[string]any {
	return map[string]any{
		"type": "handshake.rejected",
		"error": map[string]any{
			"code":      code,
			"message":   message,
			"status":    status,
			"requestId": "req_realtime_handshake",
			"retryable": false,
		},
	}
}

func parseSubscriptions(raw string) map[string]bool {
	result := map[string]bool{
		"chat":     true,
		"members":  true,
		"roadmap":  true,
		"terminal": true,
	}
	if strings.TrimSpace(raw) == "" {
		return result
	}
	result = map[string]bool{
		"chat":     false,
		"members":  false,
		"roadmap":  false,
		"terminal": false,
	}
	for _, part := range strings.Split(raw, ",") {
		name := strings.TrimSpace(part)
		if _, ok := result[name]; ok {
			result[name] = true
		}
	}
	return result
}

func unionIDs(existing []string, next string) []string {
	if next == "" {
		return existing
	}
	for _, item := range existing {
		if item == next {
			return existing
		}
	}
	out := append([]string{}, existing...)
	out = append(out, next)
	return out
}

func recoveryEnvelopeForHandshake(requestedCursor string, result *realtime.SubscribeResult) map[string]any {
	mode := result.Mode
	terminalReplay := "none"
	if mode == "snapshot" {
		terminalReplay = "snapshot_only"
	}
	if mode == "replay" {
		terminalReplay = "delta_after_snapshot"
	}
	if result.ResyncRequired {
		mode = "snapshot_resync"
		terminalReplay = "snapshot_only"
	}
	return map[string]any{
		"mode":           mode,
		"lastAckCursor":  emptyToNil(requestedCursor),
		"resyncRequired": result.ResyncRequired,
		"terminalReplay": terminalReplay,
		"dedupeKey":      "cursor_then_terminal_seq",
	}
}

func emptyToNil(value string) any {
	if value == "" {
		return nil
	}
	return value
}
