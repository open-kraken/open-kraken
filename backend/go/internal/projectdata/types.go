package projectdata

import "time"

type Storage string

const (
	StorageNone      Storage = "none"
	StorageWorkspace Storage = "workspace"
	StorageApp       Storage = "app"
)

type Scope string

const (
	ScopeProject      Scope = "project"
	ScopeConversation Scope = "conversation"
	ScopeGlobal       Scope = "global"
)

type Metadata struct {
	WorkspaceID    string    `json:"workspaceId"`
	Scope          Scope     `json:"scope"`
	ConversationID string    `json:"conversationId,omitempty"`
	Version        int64     `json:"version"`
	UpdatedAt      time.Time `json:"updatedAt"`
	Storage        Storage   `json:"storage"`
	Warning        string    `json:"warning,omitempty"`
}

type ProjectDataDocument struct {
	Meta        Metadata       `json:"meta"`
	ProjectID   string         `json:"projectId"`
	ProjectName string         `json:"projectName"`
	Attributes  map[string]any `json:"attributes,omitempty"`
}

type RoadmapTask struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Status string `json:"status"`
	Pinned bool   `json:"pinned"`
	Order  int    `json:"order"`
}

type ConversationRoadmapDocument struct {
	Meta      Metadata      `json:"meta"`
	Objective string        `json:"objective"`
	Tasks     []RoadmapTask `json:"tasks"`
}

type GlobalRoadmapDocument struct {
	Meta      Metadata      `json:"meta"`
	Objective string        `json:"objective"`
	Tasks     []RoadmapTask `json:"tasks"`
}

type ReadRequest struct {
	WorkspaceID    string
	WorkspacePath  string
	ConversationID string
}

// WriteOptions only protects writes that converge into the same backend process.
// It does not make file-backed projectdata mutations safe across multiple writer processes.
type WriteOptions struct {
	ExpectedVersion *int64
}

type ReadResult[T any] struct {
	Document T
	Storage  Storage
	Warning  string
	Found    bool
}

type WriteResult[T any] struct {
	Document T
	Storage  Storage
	Warning  string
}

// ProjectDataRepository assumes a single writer process per workspace persistence target.
// Callers that need multi-process mutation must first promote one of the documented
// replacement strategies instead of treating ExpectedVersion as a cross-process lock.
type ProjectDataRepository interface {
	ReadProjectData(req ReadRequest) (ReadResult[ProjectDataDocument], error)
	WriteProjectData(req ReadRequest, doc ProjectDataDocument, opts WriteOptions) (WriteResult[ProjectDataDocument], error)
	ReadConversationRoadmap(req ReadRequest) (ReadResult[ConversationRoadmapDocument], error)
	WriteConversationRoadmap(req ReadRequest, doc ConversationRoadmapDocument, opts WriteOptions) (WriteResult[ConversationRoadmapDocument], error)
	ReadGlobalRoadmap(req ReadRequest) (ReadResult[GlobalRoadmapDocument], error)
	WriteGlobalRoadmap(req ReadRequest, doc GlobalRoadmapDocument, opts WriteOptions) (WriteResult[GlobalRoadmapDocument], error)
}
