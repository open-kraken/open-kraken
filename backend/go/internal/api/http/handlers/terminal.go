package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
)

type TerminalHandler struct {
	service    *terminal.Service
	authorizer authz.Service
}

func NewTerminalHandler(service *terminal.Service) *TerminalHandler {
	return &TerminalHandler{service: service, authorizer: authz.NewService()}
}

func (h *TerminalHandler) HandleSessions(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, h.service.ListSessions(r.URL.Query().Get("workspaceId")))
	case http.MethodPost:
		var req session.CreateRequest
		if !decodeJSON(r, &req, w) {
			return
		}
		info, err := h.service.CreateSession(r.Context(), req)
		if err != nil {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeJSON(w, http.StatusCreated, info)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *TerminalHandler) HandleMemberSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	sessionID, ok := h.service.ResolveMemberSession(r.URL.Query().Get("workspaceId"), r.URL.Query().Get("memberId"))
	writeJSON(w, http.StatusOK, map[string]interface{}{"sessionId": sessionID, "found": ok})
}

func (h *TerminalHandler) HandleSessionByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/terminal/sessions/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	sessionID := parts[0]
	action := ""
	if len(parts) > 1 {
		action = parts[1]
	}

	switch action {
	case "":
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		for _, item := range h.service.ListSessions("") {
			if item.SessionID == sessionID {
				writeJSON(w, http.StatusOK, item)
				return
			}
		}
		w.WriteHeader(http.StatusNotFound)
	case "attach":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req session.AttachRequest
		if !decodeJSON(r, &req, w) {
			return
		}
		req.SessionID = sessionID
		authCtx, err := authContextFromRequest(r, authz.ActionTerminalAttach)
		if err != nil {
			writeAuthzError(w, err)
			return
		}
		envelope, err := h.service.AttachSessionAuthorized(req, authCtx, h.authorizer)
		if err != nil {
			writeTerminalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, envelope)
	case "input":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			Data string `json:"data"`
		}
		if !decodeJSON(r, &payload, w) {
			return
		}
		if err := h.service.WriteInput(sessionID, payload.Data); err != nil {
			writeServiceError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "dispatch":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			Data    string                  `json:"data"`
			Context session.DispatchContext `json:"context"`
		}
		if !decodeJSON(r, &payload, w) {
			return
		}
		authCtx, err := authContextFromRequest(r, authz.ActionTerminalDispatch)
		if err != nil {
			writeAuthzError(w, err)
			return
		}
		if err := h.service.DispatchAuthorized(sessionID, payload.Data, payload.Context, authCtx, h.authorizer); err != nil {
			writeTerminalError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "resize":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			Cols uint16 `json:"cols"`
			Rows uint16 `json:"rows"`
		}
		if !decodeJSON(r, &payload, w) {
			return
		}
		if err := h.service.Resize(sessionID, payload.Cols, payload.Rows); err != nil {
			writeServiceError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	case "close":
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if err := h.service.Close(sessionID); err != nil {
			writeServiceError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func decodeJSON(r *http.Request, dst interface{}, w http.ResponseWriter) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

func writeServiceError(w http.ResponseWriter, err error) {
	if errors.Is(err, session.ErrSessionNotFound) {
		writeError(w, http.StatusNotFound, err)
		return
	}
	writeError(w, http.StatusBadRequest, err)
}

func writeTerminalError(w http.ResponseWriter, err error) {
	if errors.Is(err, authz.ErrForbidden) || errors.Is(err, authn.ErrUnauthorized) {
		writeAuthzError(w, err)
		return
	}
	writeServiceError(w, err)
}
