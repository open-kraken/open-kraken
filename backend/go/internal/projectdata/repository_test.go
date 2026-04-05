package projectdata

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestWriteProjectDataToWorkspace(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 9, 0, 0, 0, time.UTC) }

	result, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "open-kraken",
		Attributes:  map[string]any{"theme": "signal"},
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("WriteProjectData: %v", err)
	}
	if result.Storage != StorageWorkspace {
		t.Fatalf("expected workspace storage, got %s", result.Storage)
	}
	if result.Warning != "" {
		t.Fatalf("expected no warning, got %q", result.Warning)
	}
	if result.Document.Meta.Version != 1 {
		t.Fatalf("expected version 1, got %d", result.Document.Meta.Version)
	}
	if result.Document.Meta.Storage != StorageWorkspace {
		t.Fatalf("expected persisted workspace meta, got %+v", result.Document.Meta)
	}

	readResult, err := repo.ReadProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	})
	if err != nil {
		t.Fatalf("ReadProjectData: %v", err)
	}
	if !readResult.Found || readResult.Document.ProjectName != "open-kraken" {
		t.Fatalf("unexpected read result: %+v", readResult)
	}
}

func TestWriteProjectDataFallsBackToAppAndRetriesWorkspaceLater(t *testing.T) {
	appRoot := t.TempDir()
	blockedWorkspaceRoot := filepath.Join(t.TempDir(), "workspace-blocked")
	goodWorkspaceRoot := filepath.Join(t.TempDir(), "workspace-good")
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 9, 30, 0, 0, time.UTC) }

	if err := osWriteFile(blockedWorkspaceRoot, []byte("not a directory")); err != nil {
		t.Fatalf("seed blocked workspace root: %v", err)
	}

	first, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: blockedWorkspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "Fallback",
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("fallback write: %v", err)
	}
	if first.Storage != StorageApp {
		t.Fatalf("expected app fallback, got %s", first.Storage)
	}
	if !strings.Contains(first.Warning, "workspace write failed") {
		t.Fatalf("expected workspace warning, got %q", first.Warning)
	}
	if first.Document.Meta.Warning == "" || first.Document.Meta.Storage != StorageApp {
		t.Fatalf("fallback metadata not persisted: %+v", first.Document.Meta)
	}

	second, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: goodWorkspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "Recovered",
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("workspace retry write: %v", err)
	}
	if second.Storage != StorageWorkspace {
		t.Fatalf("expected workspace storage after retry, got %s", second.Storage)
	}
	if second.Warning != "" {
		t.Fatalf("expected warning to clear after workspace recovery, got %q", second.Warning)
	}
	if second.Document.Meta.Version != 2 {
		t.Fatalf("expected version 2 after fallback then retry, got %d", second.Document.Meta.Version)
	}
	if second.Document.Meta.Warning != "" || second.Document.Meta.Storage != StorageWorkspace {
		t.Fatalf("workspace recovery metadata incorrect: %+v", second.Document.Meta)
	}
}

func TestReadProjectDataReturnsFallbackWarning(t *testing.T) {
	appRoot := t.TempDir()
	blockedWorkspaceRoot := filepath.Join(t.TempDir(), "workspace-blocked")
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 10, 0, 0, 0, time.UTC) }

	if err := osWriteFile(blockedWorkspaceRoot, []byte("not a directory")); err != nil {
		t.Fatalf("seed blocked workspace root: %v", err)
	}
	if _, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: blockedWorkspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "Fallback",
	}, WriteOptions{}); err != nil {
		t.Fatalf("seed fallback payload: %v", err)
	}

	read, err := repo.ReadProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: blockedWorkspaceRoot,
	})
	if err != nil {
		t.Fatalf("ReadProjectData: %v", err)
	}
	if read.Storage != StorageApp {
		t.Fatalf("expected app read, got %s", read.Storage)
	}
	if !strings.Contains(read.Warning, "workspace read failed") {
		t.Fatalf("expected read warning, got %q", read.Warning)
	}
}

func TestWriteProjectDataIncrementsVersion(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 11, 0, 0, 0, time.UTC) }

	first, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "v1",
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("first write: %v", err)
	}
	expectedVersion := first.Document.Meta.Version

	second, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "v2",
	}, WriteOptions{ExpectedVersion: &expectedVersion})
	if err != nil {
		t.Fatalf("second write: %v", err)
	}
	if second.Document.Meta.Version != 2 {
		t.Fatalf("expected version 2, got %d", second.Document.Meta.Version)
	}
}

func TestWriteProjectDataRejectsVersionConflict(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 11, 30, 0, 0, time.UTC) }

	if _, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "v1",
	}, WriteOptions{}); err != nil {
		t.Fatalf("seed write: %v", err)
	}

	staleVersion := int64(0)
	_, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "stale",
	}, WriteOptions{ExpectedVersion: &staleVersion})
	if !errors.Is(err, ErrVersionConflict) {
		t.Fatalf("expected ErrVersionConflict, got %v", err)
	}
}

func TestWriteConversationRoadmapNormalizesTaskOrder(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 12, 0, 0, 0, time.UTC) }

	result, err := repo.WriteConversationRoadmap(ReadRequest{
		WorkspaceID:    "ws-1",
		WorkspacePath:  workspaceRoot,
		ConversationID: "conv-1",
	}, ConversationRoadmapDocument{
		Objective: "Ship migration",
		Tasks: []RoadmapTask{
			{ID: "task-3", Title: "third", Status: "todo", Pinned: false, Order: 2},
			{ID: "task-1", Title: "first", Status: "doing", Pinned: true, Order: 9},
			{ID: "task-2", Title: "second", Status: "done", Pinned: true, Order: 1},
		},
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("WriteConversationRoadmap: %v", err)
	}

	got := result.Document.Tasks
	if len(got) != 3 {
		t.Fatalf("expected 3 tasks, got %d", len(got))
	}
	if got[0].ID != "task-2" || got[1].ID != "task-1" || got[2].ID != "task-3" {
		t.Fatalf("unexpected canonical order: %+v", got)
	}
}

func TestConcurrentWritesSerializeByVersion(t *testing.T) {
	workspaceRoot := t.TempDir()
	appRoot := t.TempDir()
	repo := NewRepository(appRoot)
	repo.now = func() time.Time { return time.Date(2026, 4, 3, 12, 30, 0, 0, time.UTC) }

	first, err := repo.WriteProjectData(ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: workspaceRoot,
	}, ProjectDataDocument{
		ProjectID:   "proj-1",
		ProjectName: "base",
	}, WriteOptions{})
	if err != nil {
		t.Fatalf("seed write: %v", err)
	}

	expectedVersion := first.Document.Meta.Version
	var wg sync.WaitGroup
	wg.Add(2)
	errs := make(chan error, 2)
	for _, name := range []string{"left", "right"} {
		name := name
		go func() {
			defer wg.Done()
			_, writeErr := repo.WriteProjectData(ReadRequest{
				WorkspaceID:   "ws-1",
				WorkspacePath: workspaceRoot,
			}, ProjectDataDocument{
				ProjectID:   "proj-1",
				ProjectName: name,
			}, WriteOptions{ExpectedVersion: &expectedVersion})
			errs <- writeErr
		}()
	}
	wg.Wait()
	close(errs)

	var conflicts, successes int
	for err := range errs {
		if err == nil {
			successes++
			continue
		}
		if errors.Is(err, ErrVersionConflict) {
			conflicts++
			continue
		}
		t.Fatalf("unexpected concurrent write error: %v", err)
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected one success and one conflict, got successes=%d conflicts=%d", successes, conflicts)
	}
}

func osWriteFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0o644)
}
