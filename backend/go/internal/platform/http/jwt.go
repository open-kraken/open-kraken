package http

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrTokenExpired  = errors.New("jwt: token expired")
	ErrTokenMalform  = errors.New("jwt: malformed token")
	ErrTokenInvalid  = errors.New("jwt: signature invalid")
	ErrTokenMissing  = errors.New("jwt: missing claims")
)

// JWTClaims represents the payload of a signed JWT used by open-kraken.
type JWTClaims struct {
	WorkspaceID string `json:"wid"`
	MemberID    string `json:"mid"`
	Role        string `json:"role"`
	IssuedAt    int64  `json:"iat"`
	ExpiresAt   int64  `json:"exp"`
}

// SignJWT creates an HS256-signed JWT from the given claims and secret.
func SignJWT(claims JWTClaims, secret []byte) (string, error) {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("jwt sign: %w", err)
	}
	payloadEncoded := base64.RawURLEncoding.EncodeToString(payload)
	signingInput := header + "." + payloadEncoded

	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signingInput))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return signingInput + "." + sig, nil
}

// VerifyJWT parses and verifies an HS256-signed JWT. Returns the decoded claims.
func VerifyJWT(token string, secret []byte) (JWTClaims, error) {
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 {
		return JWTClaims{}, ErrTokenMalform
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(signingInput))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(parts[2]), []byte(expectedSig)) {
		return JWTClaims{}, ErrTokenInvalid
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return JWTClaims{}, ErrTokenMalform
	}

	var claims JWTClaims
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return JWTClaims{}, ErrTokenMalform
	}

	if claims.MemberID == "" || claims.WorkspaceID == "" || claims.Role == "" {
		return JWTClaims{}, ErrTokenMissing
	}

	if claims.ExpiresAt > 0 && time.Now().Unix() > claims.ExpiresAt {
		return JWTClaims{}, ErrTokenExpired
	}

	return claims, nil
}
