package importer

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	projectdatarepo "open-kraken/backend/go/internal/projectdata"
)

var (
	ErrWorkspaceIDRequired     = errors.New("importer: workspace id is required")
	ErrWorkspacePathRequired   = errors.New("importer: legacy workspace path is required")
	ErrTargetWorkspaceRequired = errors.New("importer: target workspace path is required")
	ErrAliasStoreRequired      = errors.New("importer: alias store is required")
	ErrRollbackStoreRequired   = errors.New("importer: rollback store is required")
	ErrProjectDataRepoNeeded   = errors.New("importer: projectdata repository is required")
	ErrRollbackTokenInvalid    = errors.New("importer: rollback token is invalid")
	ErrChatSourceCorrupt       = errors.New("importer: chat source is corrupt")
	ErrNoProjectSource         = errors.New("importer: no legacy project source was found")
)

type ProjectDocumentSource string

const (
	ProjectDocumentSourceWorkspace ProjectDocumentSource = "workspace"
	ProjectDocumentSourceApp       ProjectDocumentSource = "app"
	ProjectDocumentSourceNone      ProjectDocumentSource = "none"
)

type ChatSourceStatus string

const (
	ChatSourceReady      ChatSourceStatus = "ready"
	ChatSourceMissing    ChatSourceStatus = "missing"
	ChatSourceCorrupt    ChatSourceStatus = "corrupt"
	ChatSourceReadFailed ChatSourceStatus = "read_failed"
)

type ImportStatus string

const (
	ImportStatusSuccess ImportStatus = "success"
	ImportStatusPartial ImportStatus = "partial"
	ImportStatusSkipped ImportStatus = "skipped"
	ImportStatusFailed  ImportStatus = "failed"
)

type WorkspaceImportSource struct {
	LegacyWorkspacePath    string                `json:"legacyWorkspacePath"`
	LegacyWorkspaceID      string                `json:"legacyWorkspaceId"`
	WorkspaceProjectSource ProjectDocumentSource `json:"workspaceProjectSource"`
	ChatSourcePath         string                `json:"chatSourcePath,omitempty"`
	SnapshotTakenAt        time.Time             `json:"snapshotTakenAt"`
	TrustSummary           string                `json:"trustSummary"`
}

type ConversationImportBatch struct {
	LegacyConversationID    string            `json:"legacyConversationId"`
	CanonicalConversationID string            `json:"canonicalConversationId"`
	Kind                    string            `json:"kind"`
	MemberAliases           map[string]string `json:"memberAliases,omitempty"`
	Messages                []string          `json:"messages,omitempty"`
	Settings                map[string]any    `json:"settings,omitempty"`
	Warnings                []ImportWarning   `json:"warnings,omitempty"`
}

type ProjectDataImportSnapshot struct {
	LegacyWorkspaceID    string                `json:"legacyWorkspaceId"`
	CanonicalWorkspaceID string                `json:"canonicalWorkspaceId"`
	ProjectData          map[string]any        `json:"projectData,omitempty"`
	Members              []map[string]any      `json:"members,omitempty"`
	GlobalRoadmap        map[string]any        `json:"globalRoadmap,omitempty"`
	Source               WorkspaceImportSource `json:"source"`
	Warnings             []ImportWarning       `json:"warnings,omitempty"`
}

type ImportWarning struct {
	Code       string `json:"code"`
	EntityType string `json:"entityType"`
	LegacyID   string `json:"legacyId,omitempty"`
	Message    string `json:"message"`
	Action     string `json:"action"`
}

type ImportFailure struct {
	Code       string `json:"code"`
	EntityType string `json:"entityType"`
	LegacyID   string `json:"legacyId,omitempty"`
	Message    string `json:"message"`
}

type ImportCounts struct {
	Workspaces    int `json:"workspaces"`
	Conversations int `json:"conversations"`
	Messages      int `json:"messages"`
	Members       int `json:"members"`
	RoadmapItems  int `json:"roadmapItems"`
}

type ImportReport struct {
	WorkspaceID    string          `json:"workspaceId"`
	Status         ImportStatus    `json:"status"`
	ImportedCounts ImportCounts    `json:"importedCounts"`
	SkippedCounts  ImportCounts    `json:"skippedCounts"`
	Warnings       []ImportWarning `json:"warnings,omitempty"`
	Failures       []ImportFailure `json:"failures,omitempty"`
	RollbackToken  RollbackToken   `json:"rollbackToken"`
}

type RollbackToken struct {
	Value        string    `json:"value"`
	WorkspaceID  string    `json:"workspaceId"`
	AttemptID    string    `json:"attemptId"`
	SnapshotRoot string    `json:"snapshotRoot"`
	GeneratedAt  time.Time `json:"generatedAt"`
}

type AliasRecord struct {
	EntityType  string `json:"entityType"`
	LegacyID    string `json:"legacyId"`
	CanonicalID string `json:"canonicalId"`
}

type AliasSet struct {
	WorkspaceID string        `json:"workspaceId"`
	Records     []AliasRecord `json:"records"`
}

type SnapshotManifest struct {
	WorkspaceID         string                `json:"workspaceId"`
	LegacyWorkspacePath string                `json:"legacyWorkspacePath"`
	LegacyAppDataRoot   string                `json:"legacyAppDataRoot,omitempty"`
	LegacyChatBaseDir   string                `json:"legacyChatBaseDir,omitempty"`
	ResolvedChatPath    string                `json:"resolvedChatPath,omitempty"`
	TargetWorkspacePath string                `json:"targetWorkspacePath"`
	ProjectSource       ProjectDocumentSource `json:"projectSource"`
	CreatedAt           time.Time             `json:"createdAt"`
}

type AliasStore interface {
	PersistAliases(ctx context.Context, aliases AliasSet) error
}

type RollbackStore interface {
	StageRollback(ctx context.Context, token RollbackToken, manifest SnapshotManifest) error
	ConsumeRollback(ctx context.Context, token RollbackToken) error
}

type ReportStore interface {
	PersistReport(ctx context.Context, report ImportReport) error
}

type ImportRequest struct {
	WorkspaceID            string
	CanonicalWorkspaceID   string
	LegacyWorkspacePath    string
	LegacyAppDataRoot      string
	LegacyChatBaseDir      string
	ExplicitChatSourcePath string
	TargetWorkspacePath    string
	TrustSummary           string
}

type ChatSourceDiscovery struct {
	Status   ChatSourceStatus `json:"status"`
	Path     string           `json:"path,omitempty"`
	BaseDir  string           `json:"baseDir,omitempty"`
	ReadOnly bool             `json:"readOnly"`
	Warning  *ImportWarning   `json:"warning,omitempty"`
}

type ChatSourceResolver struct {
	Open  func(path string) (io.ReadCloser, error)
	Probe func(path string) error
}

type Entrypoint struct {
	ProjectDataRepo projectdatarepo.ProjectDataRepository
	AliasStore      AliasStore
	RollbackStore   RollbackStore
	ReportStore     ReportStore
	ChatResolver    ChatSourceResolver
	Now             func() time.Time
	NewAttemptID    func() string
}

type PreflightResult struct {
	Source           WorkspaceImportSource `json:"source"`
	ChatDiscovery    ChatSourceDiscovery   `json:"chatDiscovery"`
	SnapshotManifest SnapshotManifest      `json:"snapshotManifest"`
	RollbackToken    RollbackToken         `json:"rollbackToken"`
	ImportReport     ImportReport          `json:"importReport"`
}

func NewEntrypoint(repo projectdatarepo.ProjectDataRepository, aliasStore AliasStore, rollbackStore RollbackStore) Entrypoint {
	return Entrypoint{
		ProjectDataRepo: repo,
		AliasStore:      aliasStore,
		RollbackStore:   rollbackStore,
		ChatResolver: ChatSourceResolver{
			Open: func(path string) (io.ReadCloser, error) {
				return os.Open(path)
			},
			Probe: func(path string) error {
				info, err := os.Stat(path)
				if err != nil {
					return err
				}
				if info.Size() == 0 {
					return ErrChatSourceCorrupt
				}
				return nil
			},
		},
		Now: func() time.Time {
			return time.Now().UTC()
		},
		NewAttemptID: func() string {
			return fmt.Sprintf("import-%d", time.Now().UTC().UnixNano())
		},
	}
}

func NewFileEntrypoint(repo projectdatarepo.ProjectDataRepository, targetWorkspacePath string) Entrypoint {
	metadataRoot := metadataRootPath(targetWorkspacePath)
	entry := NewEntrypoint(repo, FileAliasStore{Root: metadataRoot}, FileRollbackStore{Root: metadataRoot})
	entry.ReportStore = FileReportStore{Root: metadataRoot}
	return entry
}

func (e Entrypoint) Preflight(ctx context.Context, req ImportRequest) (PreflightResult, error) {
	if err := e.Validate(); err != nil {
		return PreflightResult{}, err
	}
	if strings.TrimSpace(req.WorkspaceID) == "" {
		return PreflightResult{}, ErrWorkspaceIDRequired
	}
	if strings.TrimSpace(req.LegacyWorkspacePath) == "" {
		return PreflightResult{}, ErrWorkspacePathRequired
	}
	if strings.TrimSpace(req.TargetWorkspacePath) == "" {
		return PreflightResult{}, ErrTargetWorkspaceRequired
	}
	now := e.now()
	attemptID := e.newAttemptID()
	projectSource := resolveProjectDocumentSource(req)
	chat := e.ChatResolver.Discover(req.WorkspaceID, req.LegacyChatBaseDir, req.ExplicitChatSourcePath)
	source := WorkspaceImportSource{
		LegacyWorkspacePath:    req.LegacyWorkspacePath,
		LegacyWorkspaceID:      req.WorkspaceID,
		WorkspaceProjectSource: projectSource,
		ChatSourcePath:         chat.Path,
		SnapshotTakenAt:        now,
		TrustSummary:           strings.TrimSpace(req.TrustSummary),
	}
	manifest := SnapshotManifest{
		WorkspaceID:         req.WorkspaceID,
		LegacyWorkspacePath: req.LegacyWorkspacePath,
		LegacyAppDataRoot:   strings.TrimSpace(req.LegacyAppDataRoot),
		LegacyChatBaseDir:   strings.TrimSpace(req.LegacyChatBaseDir),
		ResolvedChatPath:    chat.Path,
		TargetWorkspacePath: req.TargetWorkspacePath,
		ProjectSource:       projectSource,
		CreatedAt:           now,
	}
	token := RollbackToken{
		Value:        buildRollbackToken(req.WorkspaceID, attemptID, now),
		WorkspaceID:  canonicalWorkspaceID(req),
		AttemptID:    attemptID,
		SnapshotRoot: req.LegacyWorkspacePath,
		GeneratedAt:  now,
	}
	if err := validateRollbackToken(token); err != nil {
		return PreflightResult{}, err
	}
	if err := e.RollbackStore.StageRollback(ctx, token, manifest); err != nil {
		return PreflightResult{}, err
	}
	report := ImportReport{
		WorkspaceID:   canonicalWorkspaceID(req),
		Status:        statusFromChatDiscovery(chat.Status),
		Warnings:      warningsFromChatDiscovery(chat),
		RollbackToken: token,
	}
	return PreflightResult{
		Source:           source,
		ChatDiscovery:    chat,
		SnapshotManifest: manifest,
		RollbackToken:    token,
		ImportReport:     report,
	}, nil
}

func (e Entrypoint) Import(ctx context.Context, req ImportRequest) (ImportReport, error) {
	preflight, err := e.Preflight(ctx, req)
	if err != nil {
		return ImportReport{}, err
	}
	report := preflight.ImportReport

	projectDoc, sourceWarnings, err := loadLegacyProjectDocument(req, preflight.Source.WorkspaceProjectSource)
	if err != nil {
		report.Status = ImportStatusFailed
		report.Failures = append(report.Failures, ImportFailure{
			Code:       "legacy_project_unavailable",
			EntityType: "workspace.json",
			LegacyID:   req.WorkspaceID,
			Message:    err.Error(),
		})
		_ = e.persistReport(ctx, report)
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, err
	}
	report.Warnings = append(report.Warnings, sourceWarnings...)

	snapshot, aliases := buildImportSnapshot(req, preflight.Source, projectDoc, report.Warnings)
	if err := e.AliasStore.PersistAliases(ctx, aliases); err != nil {
		report.Status = ImportStatusFailed
		report.Failures = append(report.Failures, ImportFailure{
			Code:       "alias_persist_failed",
			EntityType: "alias_metadata",
			LegacyID:   req.WorkspaceID,
			Message:    err.Error(),
		})
		_ = e.persistReport(ctx, report)
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, err
	}

	projectResult, err := e.ProjectDataRepo.WriteProjectData(projectdatarepo.ReadRequest{
		WorkspaceID:   canonicalWorkspaceID(req),
		WorkspacePath: req.TargetWorkspacePath,
	}, buildProjectDataDocument(snapshot), projectdatarepo.WriteOptions{})
	if err != nil {
		report.Status = ImportStatusFailed
		report.Failures = append(report.Failures, ImportFailure{
			Code:       "projectdata_write_failed",
			EntityType: "project_data",
			LegacyID:   req.WorkspaceID,
			Message:    err.Error(),
		})
		_ = e.persistReport(ctx, report)
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, err
	}
	if projectResult.Warning != "" {
		report.Warnings = append(report.Warnings, ImportWarning{
			Code:       "projectdata_write_warning",
			EntityType: "project_data",
			LegacyID:   req.WorkspaceID,
			Message:    projectResult.Warning,
			Action:     "review repository fallback state before promoting the import",
		})
	}
	roadmapResult, err := e.ProjectDataRepo.WriteGlobalRoadmap(projectdatarepo.ReadRequest{
		WorkspaceID:   canonicalWorkspaceID(req),
		WorkspacePath: req.TargetWorkspacePath,
	}, buildGlobalRoadmapDocument(snapshot), projectdatarepo.WriteOptions{})
	if err != nil {
		report.Status = ImportStatusFailed
		report.Failures = append(report.Failures, ImportFailure{
			Code:       "roadmap_write_failed",
			EntityType: "roadmap",
			LegacyID:   req.WorkspaceID,
			Message:    err.Error(),
		})
		_ = e.persistReport(ctx, report)
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, err
	}
	if roadmapResult.Warning != "" {
		report.Warnings = append(report.Warnings, ImportWarning{
			Code:       "roadmap_write_warning",
			EntityType: "roadmap",
			LegacyID:   req.WorkspaceID,
			Message:    roadmapResult.Warning,
			Action:     "review repository fallback state before promoting the import",
		})
	}

	report.ImportedCounts = ImportCounts{
		Workspaces:   1,
		Members:      len(snapshot.Members),
		RoadmapItems: len(snapshot.GlobalRoadmap["tasks"].([]map[string]any)),
	}

	switch preflight.ChatDiscovery.Status {
	case ChatSourceMissing:
		report.Status = ImportStatusPartial
		report.SkippedCounts.Conversations = 1
	case ChatSourceReady:
		report.Status = ImportStatusPartial
		report.SkippedCounts.Conversations = 1
		report.Warnings = append(report.Warnings, ImportWarning{
			Code:       "legacy_chat_decode_pending",
			EntityType: "chat.redb",
			LegacyID:   req.WorkspaceID,
			Message:    "chat.redb was discovered but conversation decoding is not implemented yet",
			Action:     "treat project data and roadmap import as staged while chat decoding is completed",
		})
	case ChatSourceCorrupt, ChatSourceReadFailed:
		report.Status = ImportStatusFailed
		report.Failures = append(report.Failures, ImportFailure{
			Code:       string(preflight.ChatDiscovery.Status),
			EntityType: "chat.redb",
			LegacyID:   req.WorkspaceID,
			Message:    preflight.ChatDiscovery.Warning.Message,
		})
		_ = e.persistReport(ctx, report)
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, errors.New("chat import precondition failed")
	default:
		report.Status = ImportStatusPartial
	}

	if err := e.persistReport(ctx, report); err != nil {
		_ = e.ConsumeRollback(ctx, preflight.RollbackToken)
		return report, err
	}
	return report, nil
}

func (e Entrypoint) ConsumeRollback(ctx context.Context, token RollbackToken) error {
	if err := validateRollbackToken(token); err != nil {
		return err
	}
	return e.RollbackStore.ConsumeRollback(ctx, token)
}

func (e Entrypoint) Validate() error {
	switch {
	case e.ProjectDataRepo == nil:
		return ErrProjectDataRepoNeeded
	case e.AliasStore == nil:
		return ErrAliasStoreRequired
	case e.RollbackStore == nil:
		return ErrRollbackStoreRequired
	default:
		return nil
	}
}

func (r ChatSourceResolver) Discover(workspaceID, baseDir, explicitPath string) ChatSourceDiscovery {
	path, base := discoverChatPath(workspaceID, baseDir, explicitPath)
	if path == "" {
		return missingChatDiscovery(workspaceID, base, "")
	}
	if !exists(path) {
		return missingChatDiscovery(workspaceID, base, path)
	}
	open := r.Open
	if open == nil {
		open = func(path string) (io.ReadCloser, error) { return os.Open(path) }
	}
	handle, err := open(path)
	if err != nil {
		return ChatSourceDiscovery{
			Status:  ChatSourceReadFailed,
			Path:    path,
			BaseDir: base,
			Warning: &ImportWarning{
				Code:       "legacy_chat_read_failed",
				EntityType: "chat.redb",
				LegacyID:   workspaceID,
				Message:    err.Error(),
				Action:     "stop chat import and classify result as failed or partial",
			},
		}
	}
	_ = handle.Close()
	probe := r.Probe
	if probe == nil {
		probe = func(path string) error { return nil }
	}
	if err := probe(path); err != nil {
		status := ChatSourceCorrupt
		code := "legacy_chat_corrupt"
		if !errors.Is(err, ErrChatSourceCorrupt) {
			status = ChatSourceReadFailed
			code = "legacy_chat_read_failed"
		}
		return ChatSourceDiscovery{
			Status:  status,
			Path:    path,
			BaseDir: base,
			Warning: &ImportWarning{
				Code:       code,
				EntityType: "chat.redb",
				LegacyID:   workspaceID,
				Message:    err.Error(),
				Action:     "do not mutate legacy chat source; classify import before continuing",
			},
		}
	}
	return ChatSourceDiscovery{
		Status:   ChatSourceReady,
		Path:     path,
		BaseDir:  base,
		ReadOnly: true,
	}
}

type FileAliasStore struct {
	Root string
}

func (s FileAliasStore) PersistAliases(_ context.Context, aliases AliasSet) error {
	if strings.TrimSpace(s.Root) == "" {
		return errors.New("alias store root is empty")
	}
	return writeJSON(filepath.Join(s.Root, "aliases.json"), aliases)
}

type FileReportStore struct {
	Root string
}

func (s FileReportStore) PersistReport(_ context.Context, report ImportReport) error {
	if strings.TrimSpace(s.Root) == "" {
		return errors.New("report store root is empty")
	}
	return writeJSON(filepath.Join(s.Root, "report.json"), report)
}

type FileRollbackStore struct {
	Root string
}

type rollbackState struct {
	Token               RollbackToken    `json:"token"`
	Manifest            SnapshotManifest `json:"manifest"`
	ProjectDataExists   bool             `json:"projectDataExists"`
	GlobalRoadmapExists bool             `json:"globalRoadmapExists"`
}

func (s FileRollbackStore) StageRollback(_ context.Context, token RollbackToken, manifest SnapshotManifest) error {
	if strings.TrimSpace(s.Root) == "" {
		return errors.New("rollback store root is empty")
	}
	dir := filepath.Join(s.Root, "rollback", token.AttemptID)
	state := rollbackState{Token: token, Manifest: manifest}

	projectPath := filepath.Join(manifest.TargetWorkspacePath, ".open-kraken", "project-data.json")
	if exists(projectPath) {
		state.ProjectDataExists = true
		if err := copyFile(projectPath, filepath.Join(dir, "project-data.json")); err != nil {
			return err
		}
	}
	roadmapPath := filepath.Join(manifest.TargetWorkspacePath, ".open-kraken", "roadmaps", "global.json")
	if exists(roadmapPath) {
		state.GlobalRoadmapExists = true
		if err := copyFile(roadmapPath, filepath.Join(dir, "global-roadmap.json")); err != nil {
			return err
		}
	}
	return writeJSON(filepath.Join(dir, "state.json"), state)
}

func (s FileRollbackStore) ConsumeRollback(_ context.Context, token RollbackToken) error {
	dir := filepath.Join(s.Root, "rollback", token.AttemptID)
	var state rollbackState
	ok, err := readJSON(filepath.Join(dir, "state.json"), &state)
	if err != nil {
		return err
	}
	if !ok {
		return nil
	}

	projectPath := filepath.Join(state.Manifest.TargetWorkspacePath, ".open-kraken", "project-data.json")
	if state.ProjectDataExists {
		if err := copyFile(filepath.Join(dir, "project-data.json"), projectPath); err != nil {
			return err
		}
	} else {
		_ = os.Remove(projectPath)
	}

	roadmapPath := filepath.Join(state.Manifest.TargetWorkspacePath, ".open-kraken", "roadmaps", "global.json")
	if state.GlobalRoadmapExists {
		if err := copyFile(filepath.Join(dir, "global-roadmap.json"), roadmapPath); err != nil {
			return err
		}
	} else {
		_ = os.Remove(roadmapPath)
	}
	return nil
}

func discoverChatPath(workspaceID, baseDir, explicitPath string) (string, string) {
	if trimmed := strings.TrimSpace(explicitPath); trimmed != "" {
		return trimmed, filepath.Dir(trimmed)
	}
	trimmedBase := strings.TrimSpace(baseDir)
	if trimmedBase == "" || strings.TrimSpace(workspaceID) == "" {
		return "", trimmedBase
	}
	return filepath.Join(trimmedBase, workspaceID, "chat.redb"), trimmedBase
}

func resolveProjectDocumentSource(req ImportRequest) ProjectDocumentSource {
	workspaceDoc := filepath.Join(strings.TrimSpace(req.LegacyWorkspacePath), ".golutra", "workspace.json")
	if exists(workspaceDoc) {
		return ProjectDocumentSourceWorkspace
	}
	if strings.TrimSpace(req.LegacyAppDataRoot) != "" && strings.TrimSpace(req.WorkspaceID) != "" {
		appDoc := filepath.Join(strings.TrimSpace(req.LegacyAppDataRoot), req.WorkspaceID, "project.json")
		if exists(appDoc) {
			return ProjectDocumentSourceApp
		}
	}
	return ProjectDocumentSourceNone
}

func statusFromChatDiscovery(status ChatSourceStatus) ImportStatus {
	switch status {
	case ChatSourceReady, ChatSourceMissing:
		return ImportStatusPartial
	case ChatSourceCorrupt, ChatSourceReadFailed:
		return ImportStatusFailed
	default:
		return ImportStatusFailed
	}
}

func warningsFromChatDiscovery(chat ChatSourceDiscovery) []ImportWarning {
	if chat.Warning == nil {
		return nil
	}
	return []ImportWarning{*chat.Warning}
}

func buildRollbackToken(workspaceID, attemptID string, now time.Time) string {
	return fmt.Sprintf("%s:%s:%d", workspaceID, attemptID, now.UTC().Unix())
}

func validateRollbackToken(token RollbackToken) error {
	if strings.TrimSpace(token.Value) == "" || strings.TrimSpace(token.WorkspaceID) == "" || strings.TrimSpace(token.AttemptID) == "" {
		return ErrRollbackTokenInvalid
	}
	if token.GeneratedAt.IsZero() {
		return ErrRollbackTokenInvalid
	}
	return nil
}

func exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func (e Entrypoint) now() time.Time {
	if e.Now != nil {
		return e.Now().UTC()
	}
	return time.Now().UTC()
}

func (e Entrypoint) newAttemptID() string {
	if e.NewAttemptID != nil {
		return e.NewAttemptID()
	}
	return fmt.Sprintf("import-%d", time.Now().UTC().UnixNano())
}

func canonicalWorkspaceID(req ImportRequest) string {
	if trimmed := strings.TrimSpace(req.CanonicalWorkspaceID); trimmed != "" {
		return trimmed
	}
	return strings.TrimSpace(req.WorkspaceID)
}

func missingChatDiscovery(workspaceID, base, path string) ChatSourceDiscovery {
	return ChatSourceDiscovery{
		Status:  ChatSourceMissing,
		Path:    path,
		BaseDir: base,
		Warning: &ImportWarning{
			Code:       "legacy_chat_missing",
			EntityType: "chat.redb",
			LegacyID:   workspaceID,
			Message:    "legacy chat.redb was not found for the workspace",
			Action:     "classify import as partial or skipped according to policy",
		},
	}
}

func loadLegacyProjectDocument(req ImportRequest, source ProjectDocumentSource) (map[string]any, []ImportWarning, error) {
	var path string
	switch source {
	case ProjectDocumentSourceWorkspace:
		path = filepath.Join(strings.TrimSpace(req.LegacyWorkspacePath), ".golutra", "workspace.json")
	case ProjectDocumentSourceApp:
		path = filepath.Join(strings.TrimSpace(req.LegacyAppDataRoot), req.WorkspaceID, "project.json")
	default:
		return nil, nil, ErrNoProjectSource
	}
	var doc map[string]any
	ok, err := readJSON(path, &doc)
	if err != nil {
		return nil, nil, err
	}
	if !ok {
		return nil, nil, ErrNoProjectSource
	}
	var warnings []ImportWarning
	if source == ProjectDocumentSourceApp {
		warnings = append(warnings, ImportWarning{
			Code:       "legacy_project_app_fallback",
			EntityType: "workspace.json",
			LegacyID:   req.WorkspaceID,
			Message:    "workspace project document unavailable; importer used app fallback project.json",
			Action:     "review the imported workspace before promoting it",
		})
	}
	return doc, warnings, nil
}

func buildImportSnapshot(req ImportRequest, source WorkspaceImportSource, projectDoc map[string]any, warnings []ImportWarning) (ProjectDataImportSnapshot, AliasSet) {
	workspaceID := canonicalWorkspaceID(req)
	projectData := map[string]any{
		"legacyWorkspaceId": req.WorkspaceID,
		"projectId":         stringValue(projectDoc["projectId"], workspaceID),
		"projectName":       stringValue(projectDoc["projectName"], workspaceID),
	}
	members := normalizeMembers(projectDoc["members"])
	roadmap := normalizeLegacyRoadmap(projectDoc["roadmap"])
	aliases := AliasSet{WorkspaceID: workspaceID}
	if req.WorkspaceID != workspaceID {
		aliases.Records = append(aliases.Records, AliasRecord{EntityType: "workspace", LegacyID: req.WorkspaceID, CanonicalID: workspaceID})
	}
	for _, member := range members {
		legacyID := stringValue(member["memberId"], "")
		if legacyID == "" {
			continue
		}
		aliases.Records = append(aliases.Records, AliasRecord{EntityType: "member", LegacyID: legacyID, CanonicalID: legacyID})
	}
	return ProjectDataImportSnapshot{
		LegacyWorkspaceID:    req.WorkspaceID,
		CanonicalWorkspaceID: workspaceID,
		ProjectData:          projectData,
		Members:              members,
		GlobalRoadmap:        roadmap,
		Source:               source,
		Warnings:             warnings,
	}, aliases
}

func buildProjectDataDocument(snapshot ProjectDataImportSnapshot) projectdatarepo.ProjectDataDocument {
	attributes := map[string]any{
		"legacyWorkspaceId": snapshot.LegacyWorkspaceID,
		"members":           snapshot.Members,
		"importSource": map[string]any{
			"projectSource":  string(snapshot.Source.WorkspaceProjectSource),
			"chatSourcePath": snapshot.Source.ChatSourcePath,
		},
	}
	return projectdatarepo.ProjectDataDocument{
		ProjectID:   stringValue(snapshot.ProjectData["projectId"], snapshot.CanonicalWorkspaceID),
		ProjectName: stringValue(snapshot.ProjectData["projectName"], snapshot.CanonicalWorkspaceID),
		Attributes:  attributes,
	}
}

func buildGlobalRoadmapDocument(snapshot ProjectDataImportSnapshot) projectdatarepo.GlobalRoadmapDocument {
	tasksRaw := snapshot.GlobalRoadmap["tasks"].([]map[string]any)
	tasks := make([]projectdatarepo.RoadmapTask, 0, len(tasksRaw))
	for _, task := range tasksRaw {
		tasks = append(tasks, projectdatarepo.RoadmapTask{
			ID:     stringValue(task["id"], ""),
			Title:  stringValue(task["title"], ""),
			Status: stringValue(task["status"], "todo"),
			Pinned: boolValue(task["pinned"]),
			Order:  intValue(task["order"]),
		})
	}
	return projectdatarepo.GlobalRoadmapDocument{
		Objective: stringValue(snapshot.GlobalRoadmap["objective"], ""),
		Tasks:     tasks,
	}
}

func normalizeMembers(raw any) []map[string]any {
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(items))
	for _, item := range items {
		member, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, member)
	}
	return out
}

func normalizeLegacyRoadmap(raw any) map[string]any {
	roadmap, ok := raw.(map[string]any)
	if !ok {
		return map[string]any{"objective": "", "tasks": []map[string]any{}}
	}
	tasksRaw, _ := roadmap["tasks"].([]any)
	tasks := make([]map[string]any, 0, len(tasksRaw))
	for index, item := range tasksRaw {
		task, ok := item.(map[string]any)
		if !ok {
			continue
		}
		tasks = append(tasks, map[string]any{
			"id":     stringValue(task["id"], fmt.Sprintf("roadmap-%d", index+1)),
			"title":  stringValue(task["title"], ""),
			"status": stringValue(task["status"], "todo"),
			"pinned": boolValue(task["pinned"]),
			"order":  intValueWithDefault(task["order"], index),
		})
	}
	return map[string]any{
		"objective": stringValue(roadmap["objective"], ""),
		"tasks":     tasks,
	}
}

func metadataRootPath(workspacePath string) string {
	return filepath.Join(strings.TrimSpace(workspacePath), ".open-kraken", "imports")
}

func (e Entrypoint) persistReport(ctx context.Context, report ImportReport) error {
	if e.ReportStore == nil {
		return nil
	}
	return e.ReportStore.PersistReport(ctx, report)
}

func readJSON(path string, into any) (bool, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal(data, into); err != nil {
		return false, err
	}
	return true, nil
}

func writeJSON(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append(data, '\n'), 0o644)
}

func copyFile(src, dst string) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dst), 0o755); err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0o644)
}

func stringValue(raw any, fallback string) string {
	value, ok := raw.(string)
	if !ok || strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}

func boolValue(raw any) bool {
	value, _ := raw.(bool)
	return value
}

func intValue(raw any) int {
	return intValueWithDefault(raw, 0)
}

func intValueWithDefault(raw any, fallback int) int {
	switch value := raw.(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	default:
		return fallback
	}
}
