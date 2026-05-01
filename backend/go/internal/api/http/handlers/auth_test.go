package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/authz"
	plathttp "open-kraken/backend/go/internal/platform/http"
)

func TestAuthHandlerLoginIssuesSignedJWTWhenSecretConfigured(t *testing.T) {
	h := NewAuthHandlerWithServiceAndJWT(nil, []KnownAccount{{
		MemberID:    "owner-1",
		WorkspaceID: "ws-1",
		DisplayName: "Owner",
		Role:        authz.RoleOwner,
		Password:    "secret",
	}}, "jwt-secret")

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(`{"memberId":"owner-1","password":"secret"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.HandleLogin(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	token := strings.TrimPrefix(body.Token, "Bearer ")
	if strings.HasPrefix(token, "open-kraken-dev.") {
		t.Fatalf("expected signed JWT, got development token")
	}
	claims, err := plathttp.VerifyJWT(token, []byte("jwt-secret"))
	if err != nil {
		t.Fatalf("verify login token: %v", err)
	}
	if claims.MemberID != "owner-1" || claims.WorkspaceID != "ws-1" || claims.Role != string(authz.RoleOwner) {
		t.Fatalf("unexpected claims: %+v", claims)
	}
}
