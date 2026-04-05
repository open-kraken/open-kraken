package skill

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
)

// BindingRepository persists member-skill binding records.
type BindingRepository interface {
	// Bind records a skill assignment for a member (idempotent).
	Bind(ctx context.Context, memberID, skillName string) error
	// Unbind removes a skill assignment for a member.
	Unbind(ctx context.Context, memberID, skillName string) error
	// ListByMember returns all skill names assigned to a member.
	ListByMember(ctx context.Context, memberID string) ([]string, error)
}

// jsonBindingStore is a JSON-file-backed BindingRepository.
// Bindings are stored as a map of memberID → []skillName.
type jsonBindingStore struct {
	mu      sync.RWMutex
	dataDir string
}

// NewJSONBindingRepository creates a BindingRepository backed by a JSON file
// in dataDir. The directory is created on first write.
func NewJSONBindingRepository(dataDir string) BindingRepository {
	return &jsonBindingStore{dataDir: dataDir}
}

func (s *jsonBindingStore) Bind(_ context.Context, memberID, skillName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	skills := all[memberID]
	for _, existing := range skills {
		if existing == skillName {
			return nil // idempotent
		}
	}
	all[memberID] = append(skills, skillName)
	return s.saveLocked(all)
}

func (s *jsonBindingStore) Unbind(_ context.Context, memberID, skillName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	skills := all[memberID]
	updated := skills[:0]
	found := false
	for _, existing := range skills {
		if existing == skillName {
			found = true
			continue
		}
		updated = append(updated, existing)
	}
	if !found {
		return ErrBindingNotFound
	}
	if len(updated) == 0 {
		delete(all, memberID)
	} else {
		all[memberID] = updated
	}
	return s.saveLocked(all)
}

func (s *jsonBindingStore) ListByMember(_ context.Context, memberID string) ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	skills := all[memberID]
	if skills == nil {
		return []string{}, nil
	}
	// Return a copy to prevent external mutation.
	out := make([]string, len(skills))
	copy(out, skills)
	return out, nil
}

func (s *jsonBindingStore) filePath() string {
	return filepath.Join(s.dataDir, "member-skills.json")
}

func (s *jsonBindingStore) loadLocked() (map[string][]string, error) {
	data, err := os.ReadFile(s.filePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return make(map[string][]string), nil
		}
		return nil, err
	}
	var bindings map[string][]string
	if err := json.Unmarshal(data, &bindings); err != nil {
		return nil, err
	}
	if bindings == nil {
		bindings = make(map[string][]string)
	}
	return bindings, nil
}

func (s *jsonBindingStore) saveLocked(bindings map[string][]string) error {
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(bindings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath(), append(data, '\n'), 0o644)
}
