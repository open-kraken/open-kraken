package importer

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	projectdatarepo "open-kraken/backend/go/internal/projectdata"
)

func TestEntrypointValidateRequiresDependencies(t *testing.T) {
	repo := projectdatarepo.NewRepository(t.TempDir())
	entry := NewEntrypoint(repo, nil, nil)
	if !errors.Is(entry.Validate(), ErrAliasStoreRequired) {
		t.Fatalf("expected alias store requirement, got %v", entry.Validate())
	}

	entry = NewEntrypoint(nil, fakeAliasStore{}, fakeRollbackStore{})
	if !errors.Is(entry.Validate(), ErrProjectDataRepoNeeded) {
		t.Fatalf("expected projectdata repo requirement, got %v", entry.Validate())
	}
}

func TestDiscoverChatSourceMissing(t *testing.T) {
	resolver := ChatSourceResolver{}
	result := resolver.Discover("ws-1", t.TempDir(), "")
	if result.Status != ChatSourceMissing {
		t.Fatalf("expected missing status, got %+v", result)
	}
	if result.Warning == nil || result.Warning.Code != "legacy_chat_missing" {
		t.Fatalf("expected missing warning, got %+v", result.Warning)
	}
}

func TestDiscoverChatSourceExplicitPathPreferred(t *testing.T) {
	baseDir := t.TempDir()
	explicit := filepath.Join(baseDir, "override", "chat.redb")
	if err := os.MkdirAll(filepath.Dir(explicit), 0o755); err != nil {
		t.Fatalf("mkdir explicit dir: %v", err)
	}
	if err := os.WriteFile(explicit, []byte("chat"), 0o644); err != nil {
		t.Fatalf("seed explicit chat: %v", err)
	}
	resolver := ChatSourceResolver{
		Open: func(path string) (io.ReadCloser, error) {
			if path != explicit {
				t.Fatalf("expected explicit path, got %s", path)
			}
			return io.NopCloser(strings.NewReader("chat")), nil
		},
		Probe: func(path string) error { return nil },
	}

	result := resolver.Discover("ws-1", "/ignored/base", explicit)
	if result.Status != ChatSourceReady || result.Path != explicit || !result.ReadOnly {
		t.Fatalf("unexpected explicit discovery: %+v", result)
	}
}

func TestDiscoverChatSourceClassifiesCorrupt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chat.redb")
	if err := os.WriteFile(path, []byte("bad"), 0o644); err != nil {
		t.Fatalf("seed corrupt chat: %v", err)
	}
	resolver := ChatSourceResolver{
		Open: func(path string) (io.ReadCloser, error) {
			return io.NopCloser(strings.NewReader("bad")), nil
		},
		Probe: func(path string) error { return ErrChatSourceCorrupt },
	}

	result := resolver.Discover("ws-1", t.TempDir(), path)
	if result.Status != ChatSourceCorrupt {
		t.Fatalf("expected corrupt status, got %+v", result)
	}
	if result.Warning == nil || result.Warning.Code != "legacy_chat_corrupt" {
		t.Fatalf("expected corrupt warning, got %+v", result.Warning)
	}
}

func TestDiscoverChatSourceClassifiesReadFailure(t *testing.T) {
	path := filepath.Join(t.TempDir(), "chat.redb")
	if err := os.WriteFile(path, []byte("chat"), 0o644); err != nil {
		t.Fatalf("seed chat file: %v", err)
	}
	resolver := ChatSourceResolver{
		Open: func(path string) (io.ReadCloser, error) {
			return nil, errors.New("permission denied")
		},
	}

	result := resolver.Discover("ws-1", t.TempDir(), path)
	if result.Status != ChatSourceReadFailed {
		t.Fatalf("expected read_failed status, got %+v", result)
	}
	if result.Warning == nil || result.Warning.Code != "legacy_chat_read_failed" {
		t.Fatalf("expected read failure warning, got %+v", result.Warning)
	}
}

func TestImportWritesProjectDataRoadmapAndMetadata(t *testing.T) {
	legacyWorkspace := t.TempDir()
	targetWorkspace := t.TempDir()
	appRoot := t.TempDir()
	chatBaseDir := t.TempDir()
	repo := projectdatarepo.NewRepository(t.TempDir())
	entry := NewFileEntrypoint(repo, targetWorkspace)
	entry.Now = func() time.Time { return time.Date(2026, 4, 4, 9, 0, 0, 0, time.UTC) }
	entry.NewAttemptID = func() string { return "attempt-1" }
	entry.ChatResolver = ChatSourceResolver{
		Open:  func(path string) (io.ReadCloser, error) { return io.NopCloser(strings.NewReader("chat")), nil },
		Probe: func(path string) error { return nil },
	}

	seedLegacyWorkspace(t, legacyWorkspace, map[string]any{
		"projectId":   "legacy-project",
		"projectName": "Legacy open-kraken",
		"members": []map[string]any{
			{"memberId": "owner-1", "displayName": "Claire"},
			{"memberId": "assistant-1", "displayName": "Planner"},
		},
		"roadmap": map[string]any{
			"objective": "Migrate",
			"tasks": []map[string]any{
				{"id": "task-1", "title": "Import data", "status": "todo"},
			},
		},
	})
	seedChatFile(t, chatBaseDir, "ws-1", []byte("chat"))

	report, err := entry.Import(context.Background(), ImportRequest{
		WorkspaceID:         "ws-1",
		LegacyWorkspacePath: legacyWorkspace,
		LegacyAppDataRoot:   appRoot,
		LegacyChatBaseDir:   chatBaseDir,
		TargetWorkspacePath: targetWorkspace,
		TrustSummary:        "fixture snapshot",
	})
	if err != nil {
		t.Fatalf("Import: %v", err)
	}
	if report.Status != ImportStatusPartial {
		t.Fatalf("expected partial import due to chat decode pending, got %+v", report)
	}
	if report.ImportedCounts.Workspaces != 1 || report.ImportedCounts.Members != 2 || report.ImportedCounts.RoadmapItems != 1 {
		t.Fatalf("unexpected imported counts: %+v", report.ImportedCounts)
	}

	projectResult, err := repo.ReadProjectData(projectdatarepo.ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: targetWorkspace,
	})
	if err != nil {
		t.Fatalf("ReadProjectData: %v", err)
	}
	if !projectResult.Found || projectResult.Document.ProjectID != "legacy-project" {
		t.Fatalf("unexpected projectdata result: %+v", projectResult)
	}

	roadmapResult, err := repo.ReadGlobalRoadmap(projectdatarepo.ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: targetWorkspace,
	})
	if err != nil {
		t.Fatalf("ReadGlobalRoadmap: %v", err)
	}
	if !roadmapResult.Found || roadmapResult.Document.Objective != "Migrate" {
		t.Fatalf("unexpected roadmap result: %+v", roadmapResult)
	}

	var aliases AliasSet
	if ok, err := readJSON(filepath.Join(metadataRootPath(targetWorkspace), "aliases.json"), &aliases); err != nil || !ok {
		t.Fatalf("expected aliases metadata, ok=%v err=%v", ok, err)
	}
	if aliases.WorkspaceID != "ws-1" || len(aliases.Records) != 2 {
		t.Fatalf("unexpected aliases: %+v", aliases)
	}

	var persistedReport ImportReport
	if ok, err := readJSON(filepath.Join(metadataRootPath(targetWorkspace), "report.json"), &persistedReport); err != nil || !ok {
		t.Fatalf("expected report metadata, ok=%v err=%v", ok, err)
	}
	if persistedReport.RollbackToken.Value == "" {
		t.Fatalf("expected rollback token in persisted report")
	}
}

func TestImportRollsBackOnChatFailureAfterWrites(t *testing.T) {
	legacyWorkspace := t.TempDir()
	targetWorkspace := t.TempDir()
	chatBaseDir := t.TempDir()
	repo := projectdatarepo.NewRepository(t.TempDir())
	entry := NewFileEntrypoint(repo, targetWorkspace)
	entry.Now = func() time.Time { return time.Date(2026, 4, 4, 9, 30, 0, 0, time.UTC) }
	entry.NewAttemptID = func() string { return "attempt-2" }
	entry.ChatResolver = ChatSourceResolver{
		Open:  func(path string) (io.ReadCloser, error) { return io.NopCloser(strings.NewReader("bad")), nil },
		Probe: func(path string) error { return ErrChatSourceCorrupt },
	}

	seedLegacyWorkspace(t, legacyWorkspace, map[string]any{
		"projectId":   "legacy-project",
		"projectName": "Legacy open-kraken",
		"roadmap": map[string]any{
			"objective": "Migrate",
			"tasks": []map[string]any{
				{"id": "task-1", "title": "Import data", "status": "todo"},
			},
		},
	})
	seedChatFile(t, chatBaseDir, "ws-1", []byte("bad"))

	_, err := repo.WriteProjectData(projectdatarepo.ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: targetWorkspace,
	}, projectdatarepo.ProjectDataDocument{
		ProjectID:   "existing-project",
		ProjectName: "Existing",
	}, projectdatarepo.WriteOptions{})
	if err != nil {
		t.Fatalf("seed projectdata: %v", err)
	}

	report, err := entry.Import(context.Background(), ImportRequest{
		WorkspaceID:         "ws-1",
		LegacyWorkspacePath: legacyWorkspace,
		LegacyChatBaseDir:   chatBaseDir,
		TargetWorkspacePath: targetWorkspace,
	})
	if err == nil {
		t.Fatalf("expected import failure")
	}
	if report.Status != ImportStatusFailed {
		t.Fatalf("expected failed report, got %+v", report)
	}

	projectResult, err := repo.ReadProjectData(projectdatarepo.ReadRequest{
		WorkspaceID:   "ws-1",
		WorkspacePath: targetWorkspace,
	})
	if err != nil {
		t.Fatalf("ReadProjectData: %v", err)
	}
	if projectResult.Document.ProjectID != "existing-project" {
		t.Fatalf("expected rollback to restore original projectdata, got %+v", projectResult.Document)
	}
}

func TestConsumeRollbackRequiresValidToken(t *testing.T) {
	repo := projectdatarepo.NewRepository(t.TempDir())
	entry := NewFileEntrypoint(repo, t.TempDir())

	err := entry.ConsumeRollback(context.Background(), RollbackToken{})
	if !errors.Is(err, ErrRollbackTokenInvalid) {
		t.Fatalf("expected invalid token error, got %v", err)
	}
}

func seedLegacyWorkspace(t *testing.T, workspaceRoot string, payload map[string]any) {
	t.Helper()
	path := filepath.Join(workspaceRoot, ".golutra", "workspace.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir workspace root: %v", err)
	}
	if err := writeJSON(path, payload); err != nil {
		t.Fatalf("write workspace json: %v", err)
	}
}

func seedChatFile(t *testing.T, baseDir, workspaceID string, data []byte) {
	t.Helper()
	path := filepath.Join(baseDir, workspaceID, "chat.redb")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir chat dir: %v", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write chat file: %v", err)
	}
}

type fakeAliasStore struct{}

func (fakeAliasStore) PersistAliases(context.Context, AliasSet) error { return nil }

type fakeRollbackStore struct{}

func (fakeRollbackStore) StageRollback(context.Context, RollbackToken, SnapshotManifest) error {
	return nil
}
func (fakeRollbackStore) ConsumeRollback(context.Context, RollbackToken) error { return nil }
