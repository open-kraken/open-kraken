package authn

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/authz"
)

const developmentBearerPrefix = "open-kraken-dev."

var ErrUnauthorized = errors.New("authn: unauthorized")

type DevelopmentClaims struct {
	WorkspaceID string     `json:"workspaceId"`
	MemberID    string     `json:"memberId"`
	Role        authz.Role `json:"role"`
}

func ResolvePrincipal(r *http.Request) (authz.Principal, error) {
	if principal, ok, err := principalFromAuthorization(r.Header.Get("Authorization")); err != nil {
		return authz.Principal{}, err
	} else if ok {
		return principal, nil
	}

	return principalFromLegacyHeaders(r)
}

func NewDevelopmentBearerToken(principal authz.Principal) (string, error) {
	payload, err := json.Marshal(DevelopmentClaims{
		WorkspaceID: principal.WorkspaceID,
		MemberID:    principal.MemberID,
		Role:        principal.Role,
	})
	if err != nil {
		return "", err
	}
	return "Bearer " + developmentBearerPrefix + base64.RawURLEncoding.EncodeToString(payload), nil
}

func principalFromAuthorization(value string) (authz.Principal, bool, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return authz.Principal{}, false, nil
	}
	if !strings.HasPrefix(value, "Bearer ") {
		return authz.Principal{}, true, fmt.Errorf("%w: unsupported authorization scheme", ErrUnauthorized)
	}

	token := strings.TrimSpace(strings.TrimPrefix(value, "Bearer "))
	if !strings.HasPrefix(token, developmentBearerPrefix) {
		return authz.Principal{}, true, fmt.Errorf("%w: unsupported bearer token", ErrUnauthorized)
	}
	encoded := strings.TrimPrefix(token, developmentBearerPrefix)
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return authz.Principal{}, true, fmt.Errorf("%w: malformed bearer token", ErrUnauthorized)
	}

	var claims DevelopmentClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return authz.Principal{}, true, fmt.Errorf("%w: invalid bearer claims", ErrUnauthorized)
	}
	if strings.TrimSpace(claims.MemberID) == "" || strings.TrimSpace(claims.WorkspaceID) == "" || !isValidRole(claims.Role) {
		return authz.Principal{}, true, fmt.Errorf("%w: incomplete bearer claims", ErrUnauthorized)
	}

	return authz.Principal{
		MemberID:    claims.MemberID,
		WorkspaceID: claims.WorkspaceID,
		Role:        claims.Role,
	}, true, nil
}

func principalFromLegacyHeaders(r *http.Request) (authz.Principal, error) {
	workspaceID := strings.TrimSpace(r.Header.Get("X-Open-Kraken-Workspace-Id"))
	memberID := strings.TrimSpace(r.Header.Get("X-Open-Kraken-Actor-Id"))
	role := authz.Role(strings.TrimSpace(r.Header.Get("X-Open-Kraken-Actor-Role")))
	if workspaceID == "" && memberID == "" && role == "" {
		return authz.Principal{}, fmt.Errorf("%w: missing bearer token", ErrUnauthorized)
	}
	if workspaceID == "" || memberID == "" || !isValidRole(role) {
		return authz.Principal{}, fmt.Errorf("%w: incomplete legacy auth headers", ErrUnauthorized)
	}
	return authz.Principal{
		MemberID:    memberID,
		WorkspaceID: workspaceID,
		Role:        role,
	}, nil
}

func isValidRole(role authz.Role) bool {
	switch role {
	case authz.RoleOwner, authz.RoleSupervisor, authz.RoleAssistant, authz.RoleMember:
		return true
	default:
		return false
	}
}
