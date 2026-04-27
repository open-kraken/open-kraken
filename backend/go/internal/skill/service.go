package skill

import (
	"context"
	"fmt"
	"strings"
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
	entries, err := s.catalog()
	if err != nil {
		return nil, fmt.Errorf("skill list: %w", err)
	}
	return entries, nil
}

func (s *Service) catalog() ([]SkillEntry, error) {
	entries, err := s.loader.Load()
	if err != nil {
		return nil, err
	}
	if len(entries) == 0 {
		return builtinCatalog(), nil
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

// ReplaceMemberSkills sets the full binding list for a member (replaces any previous list).
func (s *Service) ReplaceMemberSkills(ctx context.Context, memberID string, skillNames []string) error {
	if memberID == "" {
		return fmt.Errorf("skill replace: memberID is required")
	}

	catalog, err := s.catalog()
	if err != nil {
		return fmt.Errorf("skill replace: load catalog: %w", err)
	}
	catalogSet := make(map[string]bool, len(catalog))
	for _, entry := range catalog {
		catalogSet[entry.Name] = true
	}

	seen := make(map[string]bool, len(skillNames))
	validSkills := make([]string, 0, len(skillNames))
	for _, name := range skillNames {
		name = strings.TrimSpace(name)
		if name == "" || seen[name] {
			continue
		}
		if !catalogSet[name] {
			return fmt.Errorf("skill replace: unknown skill %q", name)
		}
		seen[name] = true
		validSkills = append(validSkills, name)
	}

	if err := s.binding.SetSkills(ctx, memberID, validSkills); err != nil {
		return fmt.Errorf("skill replace: %w", err)
	}
	return nil
}

// ImportSkills imports member-skill bindings with the given strategy.
// Unknown skills (not in catalog) are reported as conflicts.
func (s *Service) ImportSkills(ctx context.Context, entries []ImportEntry, strategy ImportStrategy) (ImportResult, error) {
	// Build catalog index.
	catalog, err := s.catalog()
	if err != nil {
		return ImportResult{}, fmt.Errorf("skill import: load catalog: %w", err)
	}
	catalogSet := make(map[string]bool, len(catalog))
	for _, e := range catalog {
		catalogSet[e.Name] = true
	}

	result := ImportResult{DryRun: strategy == ImportStrategyValidate}
	var conflicts []ImportConflict

	for _, entry := range entries {
		if entry.MemberID == "" {
			continue
		}

		// Validate all skills against catalog.
		validSkills := make([]string, 0, len(entry.SkillNames))
		for _, name := range entry.SkillNames {
			if !catalogSet[name] {
				conflicts = append(conflicts, ImportConflict{
					MemberID:  entry.MemberID,
					SkillName: name,
					Reason:    "unknown_skill",
				})
				result.Skipped++
				continue
			}
			validSkills = append(validSkills, name)
		}

		if strategy == ImportStrategyValidate {
			result.Applied += len(validSkills)
			continue
		}

		switch strategy {
		case ImportStrategyReplace:
			if err := s.binding.SetSkills(ctx, entry.MemberID, validSkills); err != nil {
				return result, fmt.Errorf("skill import replace: %w", err)
			}
			result.Applied += len(validSkills)

		case ImportStrategyMerge:
			existing, _ := s.binding.ListByMember(ctx, entry.MemberID)
			existingSet := make(map[string]bool, len(existing))
			for _, name := range existing {
				existingSet[name] = true
			}
			for _, name := range validSkills {
				if existingSet[name] {
					conflicts = append(conflicts, ImportConflict{
						MemberID:  entry.MemberID,
						SkillName: name,
						Reason:    "already_bound",
					})
					result.Skipped++
					continue
				}
				if err := s.binding.Bind(ctx, entry.MemberID, name); err != nil {
					return result, fmt.Errorf("skill import merge bind: %w", err)
				}
				result.Applied++
			}
		}
	}

	result.Conflicts = conflicts
	if result.Conflicts == nil {
		result.Conflicts = []ImportConflict{}
	}
	return result, nil
}

// ListMemberSkills returns all skills assigned to a member, enriched with
// the catalog metadata when available.
func (s *Service) ListMemberSkills(ctx context.Context, memberID string) ([]SkillEntry, error) {
	names, err := s.binding.ListByMember(ctx, memberID)
	if err != nil {
		return nil, fmt.Errorf("skill list member: %w", err)
	}

	// Build index of catalog entries for O(1) lookup.
	all, err := s.catalog()
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
