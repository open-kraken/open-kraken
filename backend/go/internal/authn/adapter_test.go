package authn

import (
	"net/http/httptest"
	"testing"

	"open-kraken/backend/go/internal/authz"
)

func TestResolvePrincipalFromDevelopmentBearer(t *testing.T) {
	token, err := NewDevelopmentBearerToken(authz.Principal{
		MemberID:    "owner-1",
		WorkspaceID: "ws-1",
		Role:        authz.RoleOwner,
	})
	if err != nil {
		t.Fatalf("NewDevelopmentBearerToken: %v", err)
	}

	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("Authorization", token)

	principal, err := ResolvePrincipal(req)
	if err != nil {
		t.Fatalf("ResolvePrincipal: %v", err)
	}
	if principal.MemberID != "owner-1" || principal.WorkspaceID != "ws-1" || principal.Role != authz.RoleOwner {
		t.Fatalf("unexpected principal: %+v", principal)
	}
}

func TestResolvePrincipalFallsBackToLegacyHeaders(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Open-Kraken-Actor-Id", "assistant-1")
	req.Header.Set("X-Open-Kraken-Actor-Role", "assistant")
	req.Header.Set("X-Open-Kraken-Workspace-Id", "ws-1")

	principal, err := ResolvePrincipal(req)
	if err != nil {
		t.Fatalf("ResolvePrincipal: %v", err)
	}
	if principal.Role != authz.RoleAssistant {
		t.Fatalf("expected assistant role, got %+v", principal)
	}
}

func TestResolvePrincipalRejectsMissingAuthentication(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	if _, err := ResolvePrincipal(req); err == nil {
		t.Fatal("expected unauthorized error")
	}
}
