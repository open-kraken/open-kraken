package cws

import (
	"context"
	"sync"
)

// Catalog is the list of arms CWS is allowed to choose from for a given
// (regime, workload_class). Separating it from the persistent stats
// keeps two concerns distinct:
//
//   - "What CAN we route to" (Catalog) — depends on which providers /
//     agent types are installed at runtime.
//   - "How HAS each arm performed" (StatsRepo) — depends on history.
//
// The Selector joins the two at Pick time.
type Catalog interface {
	// Candidates returns the arms legal for this (regime, workload_class).
	// An empty return signals the caller that no provider is installed;
	// the Selector surfaces this as ErrNoCandidates.
	Candidates(ctx context.Context, regime Regime, workloadClass string) ([]Candidate, error)
}

// StaticCatalog holds a single immutable slice of every declared arm and
// filters it at lookup time. Suitable for dev and for first-generation
// deployments where the provider set changes only on redeploy.
type StaticCatalog struct {
	mu   sync.RWMutex
	arms []Candidate
}

// NewStaticCatalog constructs a StaticCatalog with the given arms. The
// slice is copied.
func NewStaticCatalog(arms ...Candidate) *StaticCatalog {
	out := make([]Candidate, len(arms))
	copy(out, arms)
	return &StaticCatalog{arms: out}
}

// Replace swaps the catalog contents atomically. Useful for reload hooks.
func (c *StaticCatalog) Replace(arms []Candidate) {
	copied := make([]Candidate, len(arms))
	copy(copied, arms)
	c.mu.Lock()
	c.arms = copied
	c.mu.Unlock()
}

// Candidates implements Catalog.
func (c *StaticCatalog) Candidates(ctx context.Context, regime Regime, workloadClass string) ([]Candidate, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]Candidate, 0)
	for _, a := range c.arms {
		if a.Regime != regime {
			continue
		}
		if a.WorkloadClass != "" && workloadClass != "" && a.WorkloadClass != workloadClass {
			continue
		}
		// Honour wildcard rows: catalog entries with empty WorkloadClass
		// match any request class (useful for dev where we register one
		// (agent_type, provider) tuple for all workloads).
		result := a
		if a.WorkloadClass == "" {
			result.WorkloadClass = workloadClass
		}
		out = append(out, result)
	}
	return out, nil
}
