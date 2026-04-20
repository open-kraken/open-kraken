package llmexec

import (
	"context"
	"errors"
)

// SkillBinding is the minimum SkillDefinition information llmexec
// needs at dispatch time. Kept narrow on purpose — the full AEL
// SkillDefinition carries metadata (versions, tool manifest, embedding
// status) the executor has no use for, and importing it here would
// couple llmexec to ael in both directions.
type SkillBinding struct {
	ID             string
	Name           string
	PromptTemplate string
}

// SkillBinder resolves the skill that applies to a runtime agent
// context. Implementations must return `(nil, nil)` or an error
// wrapping ErrNoSkill when no skill matches; the executor treats both
// as "no skill wired" and proceeds with the raw Step input.
type SkillBinder interface {
	FindSkillForAgent(ctx context.Context, agentType, workloadClass, tenantID string) (*SkillBinding, error)
}

// SkillBinderFunc is a convenience adapter so callers can supply a
// plain function where a SkillBinder is expected. Main useful in the
// wiring layer (cmd/server) where the adapter around ael.Service lives.
type SkillBinderFunc func(ctx context.Context, agentType, workloadClass, tenantID string) (*SkillBinding, error)

// FindSkillForAgent implements SkillBinder.
func (f SkillBinderFunc) FindSkillForAgent(ctx context.Context, agentType, workloadClass, tenantID string) (*SkillBinding, error) {
	return f(ctx, agentType, workloadClass, tenantID)
}

// ErrNoSkill is the sentinel a SkillBinder returns when no row matches.
// Callers may also wrap their own domain-specific not-found error —
// llmexec treats any error from FindSkillForAgent as "skip skill
// injection" so a flaky binder never blocks execution.
var ErrNoSkill = errors.New("llmexec: no skill bound")
