package http

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"open-kraken/backend/go/internal/authn"
)

func TestWithAuthSkipsHealthz(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for /healthz, got %d", rec.Code)
	}
}

func TestWithAuthSkipsLoginWithoutToken(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for unauthenticated login POST, got %d body=%s", rec.Code, rec.Body.String())
	}
}

func TestWithAuthRejectsNoToken(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestWithAuthAcceptsValidJWT(t *testing.T) {
	secret := []byte("test-secret")
	handler := WithAuth(secret, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims, ok := PrincipalFromContext(r.Context())
		if !ok {
			t.Fatal("expected claims in context")
		}
		if claims.MemberID != "m-1" {
			t.Fatalf("expected m-1, got %s", claims.MemberID)
		}
		principal, err := authn.ResolvePrincipal(r)
		if err != nil {
			t.Fatalf("expected downstream authn principal: %v", err)
		}
		if principal.MemberID != "m-1" || principal.WorkspaceID != "ws-1" || principal.Role != "owner" {
			t.Fatalf("unexpected downstream principal: %+v", principal)
		}
		w.WriteHeader(http.StatusOK)
	}))

	token, err := SignJWT(JWTClaims{
		WorkspaceID: "ws-1",
		MemberID:    "m-1",
		Role:        "owner",
		IssuedAt:    time.Now().Unix(),
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	}, secret)
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestWithAuthNoOpWhenSecretEmpty(t *testing.T) {
	handler := WithAuth(nil, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 in dev mode, got %d", rec.Code)
	}
}

func TestWithAuthRejectsDevTokenWhenSecretConfigured(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	req.Header.Set("Authorization", "Bearer open-kraken-dev.some-encoded-payload")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for dev token with JWT auth enabled, got %d", rec.Code)
	}
}

func TestWithAuthRejectsInvalidSignedJWTBeforeLegacyFallback(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, err := authn.ResolvePrincipal(r); err == nil || !errors.Is(err, authn.ErrUnauthorized) {
			t.Fatalf("expected no downstream principal, got %v", err)
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	req.Header.Set("Authorization", "Bearer invalid.jwt.token")
	req.Header.Set("X-Open-Kraken-Actor-Id", "owner-1")
	req.Header.Set("X-Open-Kraken-Actor-Role", "owner")
	req.Header.Set("X-Open-Kraken-Workspace-Id", "ws-1")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 before legacy fallback, got %d", rec.Code)
	}
}
