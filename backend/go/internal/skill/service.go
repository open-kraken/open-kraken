package skill

import (
	"context"
	"fmt"
)

// Service provides skill catalog operations and member-skill binding management.
type Service struct {
	loader  *Loader
	binding BindingRepository
}

// NewService creates a skill Service that loads skills from loader and persists
// bindings using the given BindingRepository.
func NewService(loader *Loader, binding BindingRepository) *Service {
	return &Service{loader: loader, binding: binding}
}

// ListSkills returns all skills discovered in the skill root directory.
func (s *Service) ListSkills() ([]SkillEntry, error) {
	entries, err := s.loader.Load()
	if err != nil {
		return nil, fmt.Errorf("skill list: %w", err)
	}
	return entries, nil
}

// BindSkill assigns a skill to a member. The operation is idempotent.
func (s *Service) BindSkill(ctx context.Context, memberID, skillName string) error {
	if memberID == "" {
		return fmt.Errorf("skill bind: memberID is required")
	}
	if skillName == "" {
		return fmt.Errorf("skill bind: skillName is required")
	}
	if err := s.binding.Bind(ctx, memberID, skillName); err != nil {
		return fmt.Errorf("skill bind: %w", err)
	}
	return nil
}

// UnbindSkill removes a skill from a member. Returns ErrBindingNotFound if
// the assignment does not exist.
func (s *Service) UnbindSkill(ctx context.Context, memberID, skillName string) error {
	if err := s.binding.Unbind(ctx, memberID, skillName); err != nil {
		return fmt.Errorf("skill unbind: %w", err)
	}
	return nil
}

// ListMemberSkills returns all skills assigned to a member, enriched with
// the catalog metadata when available.
func (s *Service) ListMemberSkills(ctx context.Context, memberID string) ([]SkillEntry, error) {
	names, err := s.binding.ListByMember(ctx, memberID)
	if err != nil {
		return nil, fmt.Errorf("skill list member: %w", err)
	}

	// Build index of catalog entries for O(1) lookup.
	all, err := s.loader.Load()
	if err != nil {
		// Return names-only entries when the catalog is unavailable.
		entries := make([]SkillEntry, 0, len(names))
		for _, name := range names {
			entries = append(entries, SkillEntry{Name: name})
		}
		return entries, nil
	}
	catalog := make(map[string]SkillEntry, len(all))
	for _, e := range all {
		catalog[e.Name] = e
	}

	entries := make([]SkillEntry, 0, len(names))
	for _, name := range names {
		if entry, ok := catalog[name]; ok {
			entries = append(entries, entry)
		} else {
			entries = append(entries, SkillEntry{Name: name})
		}
	}
	return entries, nil
}
