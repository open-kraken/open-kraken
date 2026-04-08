// Package skill manages the catalog of available skills and their assignment
// to workspace members.
package skill

import "errors"

var (
	// ErrNotFound is returned when a skill cannot be located by name.
	ErrNotFound = errors.New("skill: not found")
	// ErrBindingNotFound is returned when a member-skill binding does not exist.
	ErrBindingNotFound = errors.New("skill: binding not found")
)

// SkillEntry describes a single skill discovered from the skill root directory.
type SkillEntry struct {
	// Name is the canonical identifier, taken from frontmatter or derived from
	// the file stem when frontmatter is absent.
	Name string
	// Description is a short human-readable summary from frontmatter.
	Description string
	// Path is the absolute path to the skill markdown file.
	Path string
	// Category is derived from the parent directory relative to the skill root.
	Category string
	// ContentSummary holds the first 256 characters of the file body (after
	// frontmatter) for quick preview without loading the full file.
	ContentSummary string
}

// MemberSkillBinding records a skill assigned to a member.
type MemberSkillBinding struct {
	MemberID  string `json:"memberId"`
	SkillName string `json:"skillName"`
}

// ImportStrategy determines how conflicting bindings are resolved during import.
type ImportStrategy string

const (
	// ImportStrategyMerge adds new bindings without removing existing ones.
	ImportStrategyMerge ImportStrategy = "merge"
	// ImportStrategyReplace removes all existing bindings and replaces with import.
	ImportStrategyReplace ImportStrategy = "replace"
	// ImportStrategyValidate only validates the import without applying changes.
	ImportStrategyValidate ImportStrategy = "validate"
)

// ImportEntry represents a single member→skills mapping in an import payload.
type ImportEntry struct {
	MemberID   string   `json:"memberId"`
	SkillNames []string `json:"skillNames"`
}

// ImportConflict describes a conflict found during import.
type ImportConflict struct {
	MemberID  string `json:"memberId"`
	SkillName string `json:"skillName"`
	Reason    string `json:"reason"` // "unknown_skill", "already_bound"
}

// ImportResult summarizes the outcome of an import operation.
type ImportResult struct {
	Applied   int              `json:"applied"`
	Skipped   int              `json:"skipped"`
	Conflicts []ImportConflict `json:"conflicts"`
	DryRun    bool             `json:"dryRun"`
}
