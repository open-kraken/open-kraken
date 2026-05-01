package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/account"
	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
	plathttp "open-kraken/backend/go/internal/platform/http"
)

// KnownAccount is a pre-seeded account for development login.
type KnownAccount struct {
	MemberID    string     `json:"memberId"`
	WorkspaceID string     `json:"workspaceId"`
	DisplayName string     `json:"displayName"`
	Role        authz.Role `json:"role"`
	Password    string     `json:"-"`
	Avatar      string     `json:"avatar"`
}

// AuthHandler serves login and identity endpoints.
type AuthHandler struct {
	accounts  []KnownAccount
	svc       *account.Service
	jwtSecret []byte
}

// NewAuthHandler creates an AuthHandler with the given seed accounts.
func NewAuthHandler(accounts []KnownAccount) *AuthHandler {
	return &AuthHandler{accounts: accounts}
}

func NewAuthHandlerWithService(svc *account.Service, fallback []KnownAccount) *AuthHandler {
	return &AuthHandler{svc: svc, accounts: fallback}
}

func NewAuthHandlerWithServiceAndJWT(svc *account.Service, fallback []KnownAccount, jwtSecret string) *AuthHandler {
	return &AuthHandler{svc: svc, accounts: fallback, jwtSecret: []byte(strings.TrimSpace(jwtSecret))}
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
		writeError(w, http.StatusBadRequest, errors.New("memberId and password are required"))
		return
	}

	var matched account.PublicAccount
	if h.svc != nil {
		stored, ok, err := h.svc.Authenticate(body.MemberID, body.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, err)
			return
		}
		if ok {
			matched = account.PublicAccount{
				MemberID:    stored.MemberID,
				WorkspaceID: stored.WorkspaceID,
				DisplayName: stored.DisplayName,
				Role:        stored.Role,
				Avatar:      stored.Avatar,
			}
		}
	} else {
		for i := range h.accounts {
			if h.accounts[i].MemberID == body.MemberID && h.accounts[i].Password == body.Password {
				matched = account.PublicAccount{
					MemberID:    h.accounts[i].MemberID,
					WorkspaceID: h.accounts[i].WorkspaceID,
					DisplayName: h.accounts[i].DisplayName,
					Role:        h.accounts[i].Role,
					Avatar:      h.accounts[i].Avatar,
				}
				break
			}
		}
	}
	if matched.MemberID == "" {
		writeError(w, http.StatusUnauthorized, errors.New("invalid member ID or password"))
		return
	}

	token, err := h.issueBearerToken(authz.Principal{
		MemberID:    matched.MemberID,
		WorkspaceID: matched.WorkspaceID,
		Role:        matched.Role,
	})
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

func (h *AuthHandler) issueBearerToken(principal authz.Principal) (string, error) {
	if len(h.jwtSecret) == 0 {
		return authn.NewDevelopmentBearerToken(principal)
	}
	now := time.Now()
	token, err := plathttp.SignJWT(plathttp.JWTClaims{
		WorkspaceID: principal.WorkspaceID,
		MemberID:    principal.MemberID,
		Role:        string(principal.Role),
		IssuedAt:    now.Unix(),
		ExpiresAt:   now.Add(12 * time.Hour).Unix(),
	}, h.jwtSecret)
	if err != nil {
		return "", err
	}
	return "Bearer " + token, nil
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
		writeError(w, http.StatusUnauthorized, errors.New("invalid or missing authorization"))
		return
	}

	role := principal.Role
	var displayName, avatar string
	if h.svc != nil {
		if account, err := h.svc.Get(principal.MemberID); err == nil && account.WorkspaceID == principal.WorkspaceID {
			displayName = account.DisplayName
			avatar = account.Avatar
			role = account.Role
		}
	} else {
		for _, a := range h.accounts {
			if a.MemberID == principal.MemberID && a.WorkspaceID == principal.WorkspaceID {
				displayName = a.DisplayName
				avatar = a.Avatar
				break
			}
		}
	}
	if displayName == "" {
		displayName = principal.MemberID
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId":    principal.MemberID,
		"workspaceId": principal.WorkspaceID,
		"displayName": displayName,
		"role":        role,
		"avatar":      avatar,
	})
}
