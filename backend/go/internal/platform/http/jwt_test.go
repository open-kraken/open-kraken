package http

import (
	"testing"
	"time"
)

func TestSignAndVerifyJWT(t *testing.T) {
	secret := []byte("test-secret-key-for-hmac-256")
	claims := JWTClaims{
		WorkspaceID: "ws-1",
		MemberID:    "member-1",
		Role:        "owner",
		IssuedAt:    time.Now().Unix(),
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	}

	token, err := SignJWT(claims, secret)
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}
	if token == "" {
		t.Fatal("expected non-empty token")
	}

	got, err := VerifyJWT(token, secret)
	if err != nil {
		t.Fatalf("VerifyJWT: %v", err)
	}
	if got.WorkspaceID != claims.WorkspaceID {
		t.Errorf("WorkspaceID: got %q, want %q", got.WorkspaceID, claims.WorkspaceID)
	}
	if got.MemberID != claims.MemberID {
		t.Errorf("MemberID: got %q, want %q", got.MemberID, claims.MemberID)
	}
	if got.Role != claims.Role {
		t.Errorf("Role: got %q, want %q", got.Role, claims.Role)
	}
}

func TestVerifyJWTExpired(t *testing.T) {
	secret := []byte("test-secret")
	claims := JWTClaims{
		WorkspaceID: "ws-1",
		MemberID:    "m-1",
		Role:        "member",
		IssuedAt:    time.Now().Add(-2 * time.Hour).Unix(),
		ExpiresAt:   time.Now().Add(-1 * time.Hour).Unix(),
	}
	token, err := SignJWT(claims, secret)
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}
	_, err = VerifyJWT(token, secret)
	if err != ErrTokenExpired {
		t.Fatalf("expected ErrTokenExpired, got %v", err)
	}
}

func TestVerifyJWTWrongSecret(t *testing.T) {
	secret := []byte("correct-secret")
	claims := JWTClaims{
		WorkspaceID: "ws-1",
		MemberID:    "m-1",
		Role:        "owner",
		IssuedAt:    time.Now().Unix(),
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	}
	token, err := SignJWT(claims, secret)
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}
	_, err = VerifyJWT(token, []byte("wrong-secret"))
	if err != ErrTokenInvalid {
		t.Fatalf("expected ErrTokenInvalid, got %v", err)
	}
}

func TestVerifyJWTMalformed(t *testing.T) {
	_, err := VerifyJWT("not.a.valid.jwt", []byte("secret"))
	if err != ErrTokenInvalid && err != ErrTokenMalform {
		t.Fatalf("expected malform or invalid, got %v", err)
	}
}

func TestVerifyJWTMissingClaims(t *testing.T) {
	secret := []byte("test-secret")
	claims := JWTClaims{
		WorkspaceID: "",
		MemberID:    "m-1",
		Role:        "owner",
		IssuedAt:    time.Now().Unix(),
		ExpiresAt:   time.Now().Add(time.Hour).Unix(),
	}
	token, err := SignJWT(claims, secret)
	if err != nil {
		t.Fatalf("SignJWT: %v", err)
	}
	_, err = VerifyJWT(token, secret)
	if err != ErrTokenMissing {
		t.Fatalf("expected ErrTokenMissing, got %v", err)
	}
}
