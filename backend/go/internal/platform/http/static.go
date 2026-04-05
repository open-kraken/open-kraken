package http

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type StaticHandler struct {
	distDir string
}

func NewStaticHandler(distDir string) *StaticHandler {
	return &StaticHandler{distDir: strings.TrimSpace(distDir)}
}

func (h *StaticHandler) AvailabilityChecker() HealthChecker {
	return HealthChecker{
		Name:     "web-dist",
		Required: false,
		CheckFunc: func() error {
			_, err := h.indexPath()
			return err
		},
	}
}

func (h *StaticHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	assetPath, err := h.resolvePath(r.URL.Path)
	if err != nil {
		requestID := RequestIDFromContext(r.Context())
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":    "degraded",
			"service":   "open-kraken-backend",
			"requestId": requestID,
			"error":     "web_dist_unavailable",
			"detail":    err.Error(),
		})
		return
	}

	if strings.HasSuffix(r.URL.Path, "/") || filepath.Ext(r.URL.Path) == "" {
		http.ServeFile(w, r, assetPath)
		return
	}

	if _, statErr := os.Stat(assetPath); statErr != nil {
		indexPath, indexErr := h.indexPath()
		if indexErr != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{
				"status":    "degraded",
				"service":   "open-kraken-backend",
				"requestId": RequestIDFromContext(r.Context()),
				"error":     "web_dist_unavailable",
				"detail":    indexErr.Error(),
			})
			return
		}
		http.ServeFile(w, r, indexPath)
		return
	}
	http.ServeFile(w, r, assetPath)
}

func (h *StaticHandler) resolvePath(requestPath string) (string, error) {
	indexPath, err := h.indexPath()
	if err != nil {
		return "", err
	}
	if requestPath == "" || requestPath == "/" || strings.HasSuffix(requestPath, "/") || filepath.Ext(requestPath) == "" {
		return indexPath, nil
	}
	cleaned := filepath.Clean(strings.TrimPrefix(requestPath, "/"))
	return filepath.Join(h.distDir, cleaned), nil
}

func (h *StaticHandler) indexPath() (string, error) {
	if h.distDir == "" {
		return "", errors.New("OPEN_KRAKEN_WEB_DIST_DIR is not configured")
	}
	info, err := os.Stat(h.distDir)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return "", errors.New("OPEN_KRAKEN_WEB_DIST_DIR must be a directory")
	}
	indexPath := filepath.Join(h.distDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return "", err
	}
	return indexPath, nil
}
