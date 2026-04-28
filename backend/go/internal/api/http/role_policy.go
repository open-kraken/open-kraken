package http

import (
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/account"
	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
)

func withRolePolicy(next http.Handler, apiBasePath string, accounts *account.Service) http.Handler {
	if accounts == nil {
		return next
	}
	apiBase := "/" + strings.Trim(strings.TrimSpace(apiBasePath), "/")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimRight(r.URL.Path, "/")
		if path == "" {
			path = "/"
		}
		if !hasPathPrefix(path, apiBase) && !hasPathPrefix(path, "/api/v2") {
			next.ServeHTTP(w, r)
			return
		}
		if strings.HasSuffix(path, "/auth/login") {
			next.ServeHTTP(w, r)
			return
		}
		principal, err := authn.ResolvePrincipal(r)
		if err != nil {
			writeRolePolicyError(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		role := principal.Role
		if stored, err := accounts.Get(principal.MemberID); err == nil && stored.WorkspaceID == principal.WorkspaceID {
			role = stored.Role
		}
		suffix := strings.TrimPrefix(path, apiBase)
		if hasPathPrefix(path, "/api/v2") {
			suffix = "/v2" + strings.TrimPrefix(path, "/api/v2")
		}
		if !roleCanAccessAPI(role, r.Method, suffix) {
			writeRolePolicyError(w, http.StatusForbidden, "forbidden")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func roleCanAccessAPI(role authz.Role, method, suffix string) bool {
	suffix = "/" + strings.Trim(suffix, "/")
	if suffix == "/" {
		return true
	}
	if role == authz.RoleOwner || role == authz.RoleSupervisor {
		return true
	}
	if strings.HasPrefix(suffix, "/auth/me") {
		return true
	}
	if strings.HasPrefix(suffix, "/v2") {
		return role == authz.RoleOwner || role == authz.RoleSupervisor || role == authz.RoleAssistant
	}
	if strings.HasPrefix(suffix, "/approvals") {
		return method == http.MethodGet
	}
	if role == authz.RoleAssistant {
		return assistantCanAccessAPI(method, suffix)
	}
	if role == authz.RoleMember {
		return memberCanAccessAPI(method, suffix)
	}
	return false
}

func assistantCanAccessAPI(method, suffix string) bool {
	if memberCanAccessAPI(method, suffix) {
		return true
	}
	if strings.HasPrefix(suffix, "/queue") {
		return true
	}
	if method == http.MethodGet && (strings.HasPrefix(suffix, "/ledger/") ||
		strings.HasPrefix(suffix, "/tokens/") ||
		strings.HasPrefix(suffix, "/agents/status") ||
		strings.HasPrefix(suffix, "/nodes") ||
		strings.HasPrefix(suffix, "/skills")) {
		return true
	}
	if strings.HasPrefix(suffix, "/workspaces/") &&
		(strings.Contains(suffix, "/roadmap") || strings.Contains(suffix, "/project-data")) {
		return true
	}
	if strings.HasPrefix(suffix, "/members/") && method == http.MethodGet {
		return true
	}
	if strings.HasPrefix(suffix, "/skills/import") {
		return false
	}
	return false
}

func memberCanAccessAPI(method, suffix string) bool {
	if strings.HasPrefix(suffix, "/workspaces/") {
		if strings.Contains(suffix, "/members") ||
			strings.Contains(suffix, "/teams") {
			return method == http.MethodGet
		}
		if strings.Contains(suffix, "/chat") ||
			strings.Contains(suffix, "/conversations") {
			return method == http.MethodGet || method == http.MethodPost
		}
		if strings.Contains(suffix, "/roadmap") || strings.Contains(suffix, "/project-data") {
			return method == http.MethodGet
		}
	}
	if strings.HasPrefix(suffix, "/terminal/") {
		return !strings.Contains(suffix, "/dispatch")
	}
	if strings.HasPrefix(suffix, "/messages") ||
		strings.HasPrefix(suffix, "/presence/") ||
		(method == http.MethodGet && strings.HasPrefix(suffix, "/providers")) ||
		strings.HasPrefix(suffix, "/settings") {
		return true
	}
	return false
}

func hasPathPrefix(path, prefix string) bool {
	prefix = "/" + strings.Trim(prefix, "/")
	return path == prefix || strings.HasPrefix(path, prefix+"/")
}

func writeRolePolicyError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(`{"message":"` + message + `"}`))
}
