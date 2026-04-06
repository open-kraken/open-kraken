package http

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
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

func TestWithAuthPassesDevTokenThrough(t *testing.T) {
	handler := WithAuth([]byte("secret"), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/nodes", nil)
	req.Header.Set("Authorization", "Bearer open-kraken-dev.some-encoded-payload")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 for dev token, got %d", rec.Code)
	}
}
