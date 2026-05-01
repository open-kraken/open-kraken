package http

import (
	"context"
	"net/http"
	"strings"

	"open-kraken/backend/go/internal/authn"
	"open-kraken/backend/go/internal/authz"
)

const developmentBearerPrefix = "open-kraken-dev."

type principalKey struct{}

// PrincipalFromContext retrieves the authenticated JWTClaims from the request context.
func PrincipalFromContext(ctx context.Context) (JWTClaims, bool) {
	claims, ok := ctx.Value(principalKey{}).(JWTClaims)
	return claims, ok
}

// WithAuth returns middleware that validates JWT bearer tokens on API routes.
// When jwtSecret is empty, the middleware is a no-op (development mode).
// Unauthenticated requests to protected routes receive 401.
func WithAuth(jwtSecret []byte, next http.Handler) http.Handler {
	if len(jwtSecret) == 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health checks and static assets.
		if r.URL.Path == "/healthz" || r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		if !isProtectedPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		auth := r.Header.Get("Authorization")
		if auth == "" {
			writeAuthError(w, "missing authorization header")
			return
		}
		if !strings.HasPrefix(auth, "Bearer ") {
			writeAuthError(w, "unsupported authorization scheme")
			return
		}
		token := strings.TrimPrefix(auth, "Bearer ")

		if strings.HasPrefix(token, developmentBearerPrefix) {
			writeAuthError(w, "development bearer tokens are disabled when JWT auth is configured")
			return
		}

		claims, err := VerifyJWT(token, jwtSecret)
		if err != nil {
			writeAuthError(w, err.Error())
			return
		}

		principal := authz.Principal{
			WorkspaceID: claims.WorkspaceID,
			MemberID:    claims.MemberID,
			Role:        authz.Role(claims.Role),
		}
		internalBearer, err := authn.NewDevelopmentBearerToken(principal)
		if err != nil {
			writeAuthError(w, "invalid token claims")
			return
		}

		ctx := context.WithValue(r.Context(), principalKey{}, claims)
		nextReq := r.WithContext(ctx)
		nextReq.Header = r.Header.Clone()
		nextReq.Header.Set("Authorization", internalBearer)
		next.ServeHTTP(w, nextReq)
	})
}

// isPublicAPIPath matches routes that must work without a prior bearer token
// (e.g. POST /auth/login). API base path may vary; we match by suffix.
func isPublicAPIPath(path string) bool {
	p := strings.TrimSuffix(path, "/")
	return strings.HasSuffix(p, "/auth/login")
}

func isProtectedPath(path string) bool {
	if isPublicAPIPath(path) {
		return false
	}
	return strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/ws") || strings.HasPrefix(path, "/realtime")
}

func writeAuthError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"` + msg + `"}`))
}
