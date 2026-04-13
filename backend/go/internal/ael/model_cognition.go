package ael

import "time"

// --- Skill Library (paper §5.4.5, L0-S) ---

type SkillDefinition struct {
	ID                string
	Name              string
	Version           int
	Description       string
	PromptTemplate    string
	ToolRequirements  []string
	AgentTypeAffinity []string
	WorkloadClassTags []string
	TenantID          string
	AuthoredBy        string
	PublishedAt       time.Time
	EmbeddingStatus   string
	QdrantID          *int64
}

// --- Process Template Library (paper §5.6.0, L0-P) ---

type ProcessTemplate struct {
	ID                  string
	Name                string
	Version             int
	TriggerDescription  string
	DAGTemplate         []byte // JSON
	ApplicableDomains   []string
	EstimatedStepsMin   int
	EstimatedStepsMax   int
	AuthoredBy          string
	PublishedAt         time.Time
	EmbeddingStatus     string
	QdrantID            *int64
}

// --- Shared Execution Memory (paper §5.7, L2/L3) ---

type SEMType string

const (
	SEMPitfall   SEMType = "pitfall"
	SEMWorkflow  SEMType = "workflow"
	SEMIteration SEMType = "iteration"
	SEMOpenIssue SEMType = "open_issue"
	SEMArtifact  SEMType = "artifact"
)

type SEMScope string

const (
	SEMScopeStep SEMScope = "step"
	SEMScopeFlow SEMScope = "flow"
	SEMScopeRun  SEMScope = "run"
	SEMScopeHive SEMScope = "hive"
)

type SEMRecord struct {
	ID              string
	Type            SEMType
	Scope           SEMScope
	HiveID          string
	RunID           string
	Key             string
	Content         []byte // JSON
	CreatedBy       string
	SourceStep      string
	Confidence      float64
	Version         int
	SupersededBy    string
	ResolvedAt      *time.Time
	EmbeddingStatus string
	QdrantID        *int64
	CreatedAt       time.Time
}
