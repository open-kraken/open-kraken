package projectdata

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

var ErrVersionConflict = errors.New("projectdata: version conflict")

type Repository struct {
	appDataRoot string
	locks       *lockSet
	now         func() time.Time
}

type lockSet struct {
	mu    sync.Mutex
	locks map[string]*sync.Mutex
}

func NewRepository(appDataRoot string) *Repository {
	return &Repository{
		appDataRoot: strings.TrimSpace(appDataRoot),
		locks:       newLockSet(),
		now: func() time.Time {
			return time.Now().UTC()
		},
	}
}

func newLockSet() *lockSet {
	return &lockSet{locks: map[string]*sync.Mutex{}}
}

func (s *lockSet) lock(key string) func() {
	s.mu.Lock()
	lock, ok := s.locks[key]
	if !ok {
		lock = &sync.Mutex{}
		s.locks[key] = lock
	}
	s.mu.Unlock()
	lock.Lock()
	return lock.Unlock
}

func (r *Repository) ReadProjectData(req ReadRequest) (ReadResult[ProjectDataDocument], error) {
	return readDocument[ProjectDataDocument](r, req, ScopeProject, "")
}

func (r *Repository) WriteProjectData(req ReadRequest, doc ProjectDataDocument, opts WriteOptions) (WriteResult[ProjectDataDocument], error) {
	doc.Attributes = cloneMap(doc.Attributes)
	return writeDocument(r, req, ScopeProject, "", doc, opts, func(next *ProjectDataDocument, meta Metadata) {
		next.Meta = meta
	})
}

func (r *Repository) ReadConversationRoadmap(req ReadRequest) (ReadResult[ConversationRoadmapDocument], error) {
	return readDocument[ConversationRoadmapDocument](r, req, ScopeConversation, req.ConversationID)
}

func (r *Repository) WriteConversationRoadmap(req ReadRequest, doc ConversationRoadmapDocument, opts WriteOptions) (WriteResult[ConversationRoadmapDocument], error) {
	doc.Tasks = normalizeTasks(doc.Tasks)
	return writeDocument(r, req, ScopeConversation, req.ConversationID, doc, opts, func(next *ConversationRoadmapDocument, meta Metadata) {
		next.Meta = meta
		next.Tasks = normalizeTasks(next.Tasks)
	})
}

func (r *Repository) ReadGlobalRoadmap(req ReadRequest) (ReadResult[GlobalRoadmapDocument], error) {
	return readDocument[GlobalRoadmapDocument](r, req, ScopeGlobal, "")
}

func (r *Repository) WriteGlobalRoadmap(req ReadRequest, doc GlobalRoadmapDocument, opts WriteOptions) (WriteResult[GlobalRoadmapDocument], error) {
	doc.Tasks = normalizeTasks(doc.Tasks)
	return writeDocument(r, req, ScopeGlobal, "", doc, opts, func(next *GlobalRoadmapDocument, meta Metadata) {
		next.Meta = meta
		next.Tasks = normalizeTasks(next.Tasks)
	})
}

func readDocument[T any](r *Repository, req ReadRequest, scope Scope, conversationID string) (ReadResult[T], error) {
	var zero T
	if err := validateRequest(req, scope, conversationID); err != nil {
		return ReadResult[T]{}, err
	}

	workspaceFile := workspacePath(req.WorkspacePath, scope, conversationID)
	appFile := appPath(r.appDataRoot, req.WorkspaceID, scope, conversationID)

	var warning string
	doc, found, err := readJSON[T](workspaceFile)
	if err == nil && found {
		doc = applyMetadataDefaults(doc, Metadata{
			WorkspaceID:    req.WorkspaceID,
			Scope:          scope,
			ConversationID: conversationID,
			Storage:        StorageWorkspace,
		})
		doc = normalizeByScope(scope, doc)
		return ReadResult[T]{Document: doc, Storage: StorageWorkspace, Found: true}, nil
	}
	if err != nil {
		warning = fmt.Sprintf("workspace read failed: %v", err)
	}

	doc, found, err = readJSON[T](appFile)
	if err != nil {
		if warning != "" {
			return ReadResult[T]{}, fmt.Errorf("%s; app read failed: %w", warning, err)
		}
		return ReadResult[T]{}, fmt.Errorf("app read failed: %w", err)
	}
	if !found {
		return ReadResult[T]{Document: zero, Storage: StorageNone, Warning: warning, Found: false}, nil
	}
	doc = applyMetadataDefaults(doc, Metadata{
		WorkspaceID:    req.WorkspaceID,
		Scope:          scope,
		ConversationID: conversationID,
		Storage:        StorageApp,
		Warning:        warning,
	})
	doc = normalizeByScope(scope, doc)
	return ReadResult[T]{Document: doc, Storage: StorageApp, Warning: warning, Found: true}, nil
}

func writeDocument[T any](r *Repository, req ReadRequest, scope Scope, conversationID string, doc T, opts WriteOptions, setMeta func(*T, Metadata)) (WriteResult[T], error) {
	if err := validateRequest(req, scope, conversationID); err != nil {
		return WriteResult[T]{}, err
	}

	unlock := r.locks.lock(lockKey(req.WorkspaceID, scope, conversationID))
	defer unlock()

	current, _, found, err := r.readCurrent(req, scope, conversationID)
	if err != nil {
		return WriteResult[T]{}, err
	}
	currentVersion := int64(0)
	if found {
		currentVersion = metadataOf(current).Version
	}
	if opts.ExpectedVersion != nil && *opts.ExpectedVersion != currentVersion {
		return WriteResult[T]{}, fmt.Errorf("%w: expected version %d, got %d", ErrVersionConflict, *opts.ExpectedVersion, currentVersion)
	}

	meta := Metadata{
		WorkspaceID:    req.WorkspaceID,
		Scope:          scope,
		ConversationID: conversationID,
		Version:        currentVersion + 1,
		UpdatedAt:      r.now(),
		Storage:        StorageWorkspace,
	}
	next := doc
	setMeta(&next, meta)
	next = normalizeByScope(scope, next)

	workspaceFile := workspacePath(req.WorkspacePath, scope, conversationID)
	if err := writeJSON(workspaceFile, next); err == nil {
		return WriteResult[T]{Document: next, Storage: StorageWorkspace}, nil
	} else {
		warning := fmt.Sprintf("workspace write failed: %v", err)
		meta.Storage = StorageApp
		meta.Warning = warning
		setMeta(&next, meta)
		next = normalizeByScope(scope, next)
		appFile := appPath(r.appDataRoot, req.WorkspaceID, scope, conversationID)
		if appErr := writeJSON(appFile, next); appErr != nil {
			return WriteResult[T]{}, fmt.Errorf("%s; app write failed: %w", warning, appErr)
		}
		return WriteResult[T]{Document: next, Storage: StorageApp, Warning: warning}, nil
	}
}

func (r *Repository) readCurrent(req ReadRequest, scope Scope, conversationID string) (any, Storage, bool, error) {
	switch scope {
	case ScopeProject:
		result, err := r.ReadProjectData(req)
		if err != nil {
			return nil, StorageNone, false, err
		}
		return result.Document, result.Storage, result.Found, nil
	case ScopeConversation:
		result, err := r.ReadConversationRoadmap(req)
		if err != nil {
			return nil, StorageNone, false, err
		}
		return result.Document, result.Storage, result.Found, nil
	case ScopeGlobal:
		result, err := r.ReadGlobalRoadmap(req)
		if err != nil {
			return nil, StorageNone, false, err
		}
		return result.Document, result.Storage, result.Found, nil
	default:
		return nil, StorageNone, false, fmt.Errorf("unsupported scope: %s", scope)
	}
}

func validateRequest(req ReadRequest, scope Scope, conversationID string) error {
	if strings.TrimSpace(req.WorkspaceID) == "" {
		return errors.New("workspace id is empty")
	}
	if strings.TrimSpace(req.WorkspacePath) == "" {
		return errors.New("workspace path is empty")
	}
	if scope == ScopeConversation && strings.TrimSpace(conversationID) == "" {
		return errors.New("conversation id is empty")
	}
	return nil
}

func lockKey(workspaceID string, scope Scope, conversationID string) string {
	return strings.Join([]string{workspaceID, string(scope), conversationID}, ":")
}

func workspacePath(workspaceRoot string, scope Scope, conversationID string) string {
	base := filepath.Join(strings.TrimSpace(workspaceRoot), ".open-kraken")
	switch scope {
	case ScopeProject:
		return filepath.Join(base, "project-data.json")
	case ScopeGlobal:
		return filepath.Join(base, "roadmaps", "global.json")
	case ScopeConversation:
		return filepath.Join(base, "roadmaps", "conversations", conversationID+".json")
	default:
		return filepath.Join(base, "unknown.json")
	}
}

func appPath(appRoot, workspaceID string, scope Scope, conversationID string) string {
	base := filepath.Join(strings.TrimSpace(appRoot), "workspaces", workspaceID)
	switch scope {
	case ScopeProject:
		return filepath.Join(base, "project-data.json")
	case ScopeGlobal:
		return filepath.Join(base, "roadmaps", "global.json")
	case ScopeConversation:
		return filepath.Join(base, "roadmaps", "conversations", conversationID+".json")
	default:
		return filepath.Join(base, "unknown.json")
	}
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

func readJSON[T any](path string) (T, bool, error) {
	var doc T
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return doc, false, nil
		}
		return doc, false, err
	}
	if err := json.Unmarshal(data, &doc); err != nil {
		return doc, false, err
	}
	return doc, true, nil
}

func metadataOf(doc any) Metadata {
	switch value := doc.(type) {
	case ProjectDataDocument:
		return value.Meta
	case ConversationRoadmapDocument:
		return value.Meta
	case GlobalRoadmapDocument:
		return value.Meta
	default:
		return Metadata{}
	}
}

func applyMetadataDefaults[T any](doc T, defaults Metadata) T {
	switch value := any(doc).(type) {
	case ProjectDataDocument:
		if value.Meta.WorkspaceID == "" {
			value.Meta.WorkspaceID = defaults.WorkspaceID
		}
		if value.Meta.Scope == "" {
			value.Meta.Scope = defaults.Scope
		}
		if value.Meta.Storage == "" {
			value.Meta.Storage = defaults.Storage
		}
		if value.Meta.Warning == "" {
			value.Meta.Warning = defaults.Warning
		}
		return any(value).(T)
	case ConversationRoadmapDocument:
		if value.Meta.WorkspaceID == "" {
			value.Meta.WorkspaceID = defaults.WorkspaceID
		}
		if value.Meta.Scope == "" {
			value.Meta.Scope = defaults.Scope
		}
		if value.Meta.ConversationID == "" {
			value.Meta.ConversationID = defaults.ConversationID
		}
		if value.Meta.Storage == "" {
			value.Meta.Storage = defaults.Storage
		}
		if value.Meta.Warning == "" {
			value.Meta.Warning = defaults.Warning
		}
		return any(value).(T)
	case GlobalRoadmapDocument:
		if value.Meta.WorkspaceID == "" {
			value.Meta.WorkspaceID = defaults.WorkspaceID
		}
		if value.Meta.Scope == "" {
			value.Meta.Scope = defaults.Scope
		}
		if value.Meta.Storage == "" {
			value.Meta.Storage = defaults.Storage
		}
		if value.Meta.Warning == "" {
			value.Meta.Warning = defaults.Warning
		}
		return any(value).(T)
	default:
		return doc
	}
}

func normalizeByScope[T any](scope Scope, doc T) T {
	switch value := any(doc).(type) {
	case ConversationRoadmapDocument:
		value.Tasks = normalizeTasks(value.Tasks)
		return any(value).(T)
	case GlobalRoadmapDocument:
		value.Tasks = normalizeTasks(value.Tasks)
		return any(value).(T)
	default:
		return doc
	}
}

func normalizeTasks(tasks []RoadmapTask) []RoadmapTask {
	out := append([]RoadmapTask(nil), tasks...)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Pinned != out[j].Pinned {
			return out[i].Pinned && !out[j].Pinned
		}
		if out[i].Order != out[j].Order {
			return out[i].Order < out[j].Order
		}
		return out[i].ID < out[j].ID
	})
	return out
}

func cloneMap(in map[string]any) map[string]any {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]any, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
