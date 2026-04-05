// Package tokentrack records and aggregates LLM token usage events across
// members, nodes, and time periods.
package tokentrack

import "time"

// TokenEvent records a single LLM inference call with token counts and cost.
type TokenEvent struct {
	ID           string
	MemberID     string
	NodeID       string
	Model        string
	InputTokens  int64
	OutputTokens int64
	// Cost is denominated in USD, 8 decimal places precision.
	Cost      float64
	Timestamp time.Time
}

// TokenStats is the aggregated view of token consumption for a given query scope.
type TokenStats struct {
	// Scope describes what the stats cover (e.g. "member:m1", "node:n1", "team").
	Scope        string
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
	TotalCost    float64
	EventCount   int64
}

// StatsQuery parameterises the aggregation request.
type StatsQuery struct {
	// At least one of MemberID, NodeID, or Team must be set.
	MemberID string
	NodeID   string
	// Team aggregates across all members/nodes when true.
	Team bool
	// Since and Until define an optional time window (inclusive).
	Since *time.Time
	Until *time.Time
}
