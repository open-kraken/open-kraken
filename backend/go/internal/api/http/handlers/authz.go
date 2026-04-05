package handlers

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
)

const (
	headerActorID        = "X-Open-Kraken-Actor-Id"
	headerActorRole      = "X-Open-Kraken-Actor-Role"
	headerWorkspaceID    = "X-Open-Kraken-Workspace-Id"
	headerConversationID = "X-Open-Kraken-Conversation-Id"
	headerTargetMemberID = "X-Open-Kraken-Target-Member-Id"
	headerResourceOwner  = "X-Open-Kraken-Resource-Owner"
)

func authContextFromRequest(r *http.Request, action authz.Action) (authz.AuthContext, error) {
	principal, err := authn.ResolvePrincipal(r)
	if err != nil {
		return authz.AuthContext{}, err
	}
	workspaceID := requestWorkspaceID(r.URL)
	if workspaceID == "" {
		workspaceID = principal.WorkspaceID
	}
	return authz.AuthContext{
		Actor:          principal,
		WorkspaceID:    workspaceID,
		ConversationID: strings.TrimSpace(r.Header.Get(headerConversationID)),
		TargetMemberID: strings.TrimSpace(r.Header.Get(headerTargetMemberID)),
		ResourceOwner:  strings.TrimSpace(r.Header.Get(headerResourceOwner)),
		Action:         action,
	}, nil
}

func writeAuthzError(w http.ResponseWriter, err error) {
	if err == nil {
		return
	}
	if errors.Is(err, authn.ErrUnauthorized) {
		writeError(w, http.StatusUnauthorized, err)
		return
	}
	if errors.Is(err, authz.ErrForbidden) {
		writeError(w, http.StatusForbidden, err)
		return
	}
	writeError(w, http.StatusBadRequest, err)
}

func requestWorkspaceID(rawURL *url.URL) string {
	if rawURL == nil {
		return ""
	}
	if workspaceID := strings.TrimSpace(rawURL.Query().Get("workspaceId")); workspaceID != "" {
		return workspaceID
	}
	parts := strings.Split(strings.Trim(rawURL.Path, "/"), "/")
	for idx := 0; idx < len(parts)-1; idx++ {
		if parts[idx] == "workspaces" {
			return strings.TrimSpace(parts[idx+1])
		}
	}
	return ""
}
