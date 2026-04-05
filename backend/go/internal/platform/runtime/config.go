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
	LogLevel      string
	WebDistDir    string
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
