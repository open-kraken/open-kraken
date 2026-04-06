package handlers

import (
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
)

// KnownAccount is a pre-seeded account for development login.
type KnownAccount struct {
	MemberID    string    `json:"memberId"`
	WorkspaceID string    `json:"workspaceId"`
	DisplayName string    `json:"displayName"`
	Role        authz.Role `json:"role"`
	Password    string    `json:"-"`
	Avatar      string    `json:"avatar"`
}

// AuthHandler serves login and identity endpoints.
type AuthHandler struct {
	accounts []KnownAccount
}

// NewAuthHandler creates an AuthHandler with the given seed accounts.
func NewAuthHandler(accounts []KnownAccount) *AuthHandler {
	return &AuthHandler{accounts: accounts}
}

// HandleLogin handles POST /auth/login.
// Body: { "memberId": "…", "password": "…" }
// Returns: { "token": "Bearer …", "account": { … } }
func (h *AuthHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var body struct {
		MemberID string `json:"memberId"`
		Password string `json:"password"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}

	body.MemberID = strings.TrimSpace(body.MemberID)
	body.Password = strings.TrimSpace(body.Password)
	if body.MemberID == "" || body.Password == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"code":    "invalid_request",
			"message": "memberId and password are required",
		})
		return
	}

	var matched *KnownAccount
	for i := range h.accounts {
		if h.accounts[i].MemberID == body.MemberID && h.accounts[i].Password == body.Password {
			matched = &h.accounts[i]
			break
		}
	}
	if matched == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"code":    "invalid_credentials",
			"message": "Invalid member ID or password",
		})
		return
	}

	principal := authz.Principal{
		MemberID:    matched.MemberID,
		WorkspaceID: matched.WorkspaceID,
		Role:        matched.Role,
	}
	token, err := authn.NewDevelopmentBearerToken(principal)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"account": map[string]any{
			"memberId":    matched.MemberID,
			"workspaceId": matched.WorkspaceID,
			"displayName": matched.DisplayName,
			"role":        matched.Role,
			"avatar":      matched.Avatar,
		},
	})
}

// HandleMe handles GET /auth/me.
// Requires a valid Authorization header.
func (h *AuthHandler) HandleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	principal, err := authn.ResolvePrincipal(r)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]any{
			"code":    "unauthorized",
			"message": "Invalid or missing authorization",
		})
		return
	}

	// Find the matching account for display name / avatar
	var displayName, avatar string
	for _, a := range h.accounts {
		if a.MemberID == principal.MemberID && a.WorkspaceID == principal.WorkspaceID {
			displayName = a.DisplayName
			avatar = a.Avatar
			break
		}
	}
	if displayName == "" {
		displayName = principal.MemberID
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId":    principal.MemberID,
		"workspaceId": principal.WorkspaceID,
		"displayName": displayName,
		"role":        principal.Role,
		"avatar":      avatar,
	})
}
