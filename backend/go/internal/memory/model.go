// Package memory provides a distributed key-value memory store with scope-based
// access control and optional TTL expiry.
package memory

import (
	"errors"
	"time"
)

var (
	// ErrNotFound is returned when a memory entry cannot be located.
	ErrNotFound = errors.New("memory: entry not found")
	// ErrInvalidScope is returned when Scope is not a known value.
	ErrInvalidScope = errors.New("memory: scope must be agent, team, or global")
	// ErrInvalidKey is returned when Key is blank.
	ErrInvalidKey = errors.New("memory: key is required")
)

// Scope classifies the visibility of a memory entry.
type Scope string

const (
	// ScopeAgent is visible only to a specific agent (identified by OwnerID).
	ScopeAgent Scope = "agent"
	// ScopeTeam is shared across all agents in a team.
	ScopeTeam Scope = "team"
	// ScopeGlobal is shared across all agents and teams.
	ScopeGlobal Scope = "global"
)

// MemoryEntry holds a single key-value record with optional TTL.
type MemoryEntry struct {
	ID    string
	Key   string
	Value string
	Scope Scope
	// OwnerID identifies the agent or team that owns this entry.
	OwnerID   string
	NodeID    string
	CreatedAt time.Time
	UpdatedAt time.Time
	// TTL is the duration after which the entry should be considered expired.
	// A zero value means the entry never expires.
	TTL time.Duration
}

// IsExpired reports whether the entry has exceeded its TTL relative to now.
// An entry with TTL == 0 never expires.
func (e MemoryEntry) IsExpired(now time.Time) bool {
	if e.TTL == 0 {
		return false
	}
	return now.After(e.UpdatedAt.Add(e.TTL))
}

// ValidateScope returns ErrInvalidScope when s is not a recognised value.
func ValidateScope(s Scope) error {
	switch s {
	case ScopeAgent, ScopeTeam, ScopeGlobal:
		return nil
	default:
		return ErrInvalidScope
	}
}
