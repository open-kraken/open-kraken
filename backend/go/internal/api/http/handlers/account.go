package handlers

import (
	"errors"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/account"
	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
)

type AccountHandler struct {
	svc *account.Service
}

func NewAccountHandler(svc *account.Service) *AccountHandler {
	return &AccountHandler{svc: svc}
}

func (h *AccountHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if !h.enforceOwner(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		items, err := h.svc.List()
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		var body struct {
			MemberID    string     `json:"memberId"`
			WorkspaceID string     `json:"workspaceId"`
			DisplayName string     `json:"displayName"`
			Role        authz.Role `json:"role"`
			Avatar      string     `json:"avatar"`
			Password    string     `json:"password"`
		}
		if !decodeJSON(r, &body, w) {
			return
		}
		created, err := h.svc.Create(account.SeedAccount{
			MemberID:    body.MemberID,
			WorkspaceID: body.WorkspaceID,
			DisplayName: body.DisplayName,
			Role:        body.Role,
			Avatar:      body.Avatar,
			Password:    body.Password,
		})
		if err != nil {
			status := http.StatusBadRequest
			if !errors.Is(err, account.ErrInvalid) {
				status = http.StatusInternalServerError
			}
			writeError(w, status, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"account": created})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *AccountHandler) HandleByID(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	if !h.enforceOwner(w, r) {
		return
	}
	memberID := strings.Trim(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if slash := strings.LastIndex(memberID, "/"); slash >= 0 {
		memberID = memberID[slash+1:]
	}
	if memberID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"message": "memberId is required"})
		return
	}
	switch r.Method {
	case http.MethodPut:
		var body struct {
			DisplayName string     `json:"displayName"`
			Role        authz.Role `json:"role"`
			Avatar      string     `json:"avatar"`
			Password    string     `json:"password"`
		}
		if !decodeJSON(r, &body, w) {
			return
		}
		updated, err := h.svc.Update(memberID, account.SeedAccount{
			DisplayName: body.DisplayName,
			Role:        body.Role,
			Avatar:      body.Avatar,
			Password:    body.Password,
		})
		if err != nil {
			status := http.StatusInternalServerError
			if errors.Is(err, account.ErrNotFound) {
				status = http.StatusNotFound
			}
			writeError(w, status, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"account": updated})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (h *AccountHandler) enforceOwner(w http.ResponseWriter, r *http.Request) bool {
	principal, err := authn.ResolvePrincipal(r)
	if err != nil {
		writeAuthzError(w, err)
		return false
	}
	if principal.Role != authz.RoleOwner {
		writeAuthzError(w, authz.ErrForbidden)
		return false
	}
	return true
}
