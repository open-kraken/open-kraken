package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	defaultHTTPAddr    = "127.0.0.1:8080"
	defaultAPIBasePath = "/api/v1"
	defaultWSPath      = "/ws"
	defaultDataRoot    = "./.open-kraken-data"
	defaultLogLevel    = "info"
	defaultWebDistDir  = "./web/dist"
)

type Config struct {
	ServiceName   string
	HTTPAddr      string
	APIBasePath   string
	WSPath        string
	AppDataRoot   string
	WorkspaceRoot string
	// SkillRoot is the directory that the skill loader scans for .md skill files.
	SkillRoot  string
	LogLevel   string
	WebDistDir string
	// WSAllowAnyOrigin disables WebSocket Origin validation (development only).
	WSAllowAnyOrigin bool
	// WSAllowedOrigins lists extra permitted Origin values (full URL, e.g. http://localhost:5173).
	WSAllowedOrigins []string
	// JWTSecret is the HMAC-SHA256 signing key for JWT authentication.
	// When empty, JWT auth middleware is disabled (development mode).
	JWTSecret string
	// RateLimitRPS is the per-IP rate limit in requests per second. 0 disables.
	RateLimitRPS int
}

func Load() (Config, error) {
	cfg := Config{
		ServiceName:   "open-kraken-backend",
		HTTPAddr:      firstNonEmpty(os.Getenv("OPEN_KRAKEN_HTTP_ADDR"), os.Getenv("OPEN_KRAKEN_ADDR"), defaultHTTPAddr),
		APIBasePath:   normalizePath(firstNonEmpty(os.Getenv("OPEN_KRAKEN_API_BASE_PATH"), defaultAPIBasePath)),
		WSPath:        normalizePath(firstNonEmpty(os.Getenv("OPEN_KRAKEN_WS_PATH"), defaultWSPath)),
		AppDataRoot:   firstNonEmpty(os.Getenv("OPEN_KRAKEN_APP_DATA_ROOT"), defaultDataRoot),
		WorkspaceRoot: firstNonEmpty(os.Getenv("OPEN_KRAKEN_WORKSPACE_ROOT"), "."),
		LogLevel:      strings.ToLower(firstNonEmpty(os.Getenv("OPEN_KRAKEN_LOG_LEVEL"), defaultLogLevel)),
		WebDistDir:    firstNonEmpty(os.Getenv("OPEN_KRAKEN_WEB_DIST_DIR"), defaultWebDistDir),
	}
	cfg.WSAllowAnyOrigin = parseBoolEnv("OPEN_KRAKEN_WS_ALLOW_ANY_ORIGIN")
	cfg.WSAllowedOrigins = splitComma(os.Getenv("OPEN_KRAKEN_WS_ALLOWED_ORIGINS"))
	cfg.JWTSecret = os.Getenv("OPEN_KRAKEN_JWT_SECRET")
	cfg.RateLimitRPS = parseIntEnv("OPEN_KRAKEN_RATE_LIMIT_RPS", 0)

	if cfg.APIBasePath == cfg.WSPath {
		return Config{}, fmt.Errorf("OPEN_KRAKEN_API_BASE_PATH and OPEN_KRAKEN_WS_PATH must be distinct")
	}
	if err := os.MkdirAll(cfg.AppDataRoot, 0o755); err != nil {
		return Config{}, fmt.Errorf("create OPEN_KRAKEN_APP_DATA_ROOT %q: %w", cfg.AppDataRoot, err)
	}
	absDataRoot, err := filepath.Abs(cfg.AppDataRoot)
	if err != nil {
		return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_APP_DATA_ROOT %q: %w", cfg.AppDataRoot, err)
	}
	cfg.AppDataRoot = absDataRoot

	if skillRoot := strings.TrimSpace(os.Getenv("OPEN_KRAKEN_SKILL_ROOT")); skillRoot != "" {
		absSkillRoot, err := filepath.Abs(skillRoot)
		if err != nil {
			return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_SKILL_ROOT %q: %w", skillRoot, err)
		}
		cfg.SkillRoot = absSkillRoot
	} else {
		cfg.SkillRoot = filepath.Join(cfg.AppDataRoot, "skills")
	}

	absWorkspaceRoot, err := filepath.Abs(cfg.WorkspaceRoot)
	if err != nil {
		return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_WORKSPACE_ROOT %q: %w", cfg.WorkspaceRoot, err)
	}
	cfg.WorkspaceRoot = absWorkspaceRoot

	if cfg.WebDistDir != "" {
		absWebDistDir, err := filepath.Abs(cfg.WebDistDir)
		if err != nil {
			return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_WEB_DIST_DIR %q: %w", cfg.WebDistDir, err)
		}
		cfg.WebDistDir = absWebDistDir
	}

	return cfg, nil
}

func parseBoolEnv(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes"
}

func parseIntEnv(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil {
		return fallback
	}
	return n
}

func splitComma(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizePath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "/" {
		return "/"
	}
	return "/" + strings.Trim(strings.TrimSpace(trimmed), "/")
}
