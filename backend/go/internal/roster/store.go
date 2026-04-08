package roster

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var mu sync.Mutex

func filePath(workspaceRoot string) string {
	return filepath.Join(strings.TrimSpace(workspaceRoot), ".open-kraken", "roster.json")
}

// Read loads roster.json when present.
func Read(workspaceRoot string) (Document, bool, error) {
	if strings.TrimSpace(workspaceRoot) == "" {
		return Document{}, false, nil
	}
	mu.Lock()
	defer mu.Unlock()
	path := filePath(workspaceRoot)
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return Document{}, false, nil
		}
		return Document{}, false, err
	}
	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		return Document{}, false, err
	}
	return doc, true, nil
}

// Write persists the roster document (workspace-only storage label).
func Write(workspaceRoot string, doc Document) error {
	if strings.TrimSpace(workspaceRoot) == "" {
		return nil
	}
	mu.Lock()
	defer mu.Unlock()
	path := filePath(workspaceRoot)
	if doc.Meta.UpdatedAt.IsZero() {
		doc.Meta.UpdatedAt = time.Now().UTC()
	}
	if doc.Meta.Storage == "" {
		doc.Meta.Storage = "workspace"
	}
	if doc.Meta.Version < 1 {
		doc.Meta.Version = 1
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	out, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(out, '\n'), 0o644)
}
