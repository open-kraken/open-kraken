package contracts

type ConversationType string

const (
	ConversationTypeChannel ConversationType = "channel"
	ConversationTypeDM      ConversationType = "dm"
)

type MessageStatus string

const (
	MessageStatusSending MessageStatus = "sending"
	MessageStatusSent    MessageStatus = "sent"
	MessageStatusFailed  MessageStatus = "failed"
)

type TerminalStatus string

const (
	TerminalStatusCreated    TerminalStatus = "created"
	TerminalStatusStarting   TerminalStatus = "starting"
	TerminalStatusConnecting TerminalStatus = "connecting"
	TerminalStatusOnline     TerminalStatus = "online"
	TerminalStatusWorking    TerminalStatus = "working"
	TerminalStatusOffline    TerminalStatus = "offline"
	TerminalStatusClosed     TerminalStatus = "closed"
	TerminalStatusFailed     TerminalStatus = "failed"
)

type EventName string

const (
	EventChatSnapshot     EventName = "chat.snapshot"
	EventChatDelta        EventName = "chat.delta"
	EventChatStatus       EventName = "chat.status"
	EventPresenceSnapshot EventName = "presence.snapshot"
	EventPresenceUpdated  EventName = "presence.updated"
	EventPresenceStatus   EventName = "presence.status"
	EventRoadmapSnapshot  EventName = "roadmap.snapshot"
	EventRoadmapUpdated   EventName = "roadmap.updated"
	EventTerminalAttach   EventName = "terminal.attach"
	EventTerminalSnapshot EventName = "terminal.snapshot"
	EventTerminalDelta    EventName = "terminal.delta"
	EventTerminalStatus   EventName = "terminal.status"
)

type WorkspaceDTO struct {
	ID       string          `json:"id"`
	Name     string          `json:"name"`
	RootPath string          `json:"rootPath"`
	ReadOnly bool            `json:"readOnly"`
	Warning  *WorkspaceAlert `json:"warning,omitempty"`
}

type WorkspaceAlert struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type MemberDTO struct {
	WorkspaceID    string `json:"workspaceId"`
	MemberID       string `json:"memberId"`
	DisplayName    string `json:"displayName"`
	Avatar         string `json:"avatar"`
	RoleType       string `json:"roleType"`
	ManualStatus   string `json:"manualStatus"`
	TerminalStatus string `json:"terminalStatus"`
}

type MembersSnapshotDTO struct {
	Members []MemberDTO `json:"members"`
}

type ConversationDTO struct {
	ID                 string           `json:"id"`
	Type               ConversationType `json:"type"`
	MemberIDs          []string         `json:"memberIds"`
	TargetID           *string          `json:"targetId,omitempty"`
	CustomName         *string          `json:"customName,omitempty"`
	Pinned             bool             `json:"pinned"`
	Muted              bool             `json:"muted"`
	LastMessageAt      *int64           `json:"lastMessageAt,omitempty"`
	LastMessagePreview *string          `json:"lastMessagePreview,omitempty"`
	IsDefault          *bool            `json:"isDefault,omitempty"`
	UnreadCount        *int             `json:"unreadCount,omitempty"`
}

type MessageContent struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type MessageAttachment struct {
	Type      string `json:"type"`
	Title     string `json:"title,omitempty"`
	RoadmapID string `json:"roadmapId,omitempty"`
	TaskID    string `json:"taskId,omitempty"`
}

type MessageDTO struct {
	ID         string             `json:"id"`
	SenderID   *string            `json:"senderId,omitempty"`
	Content    MessageContent     `json:"content"`
	CreatedAt  int64              `json:"createdAt"`
	IsAI       bool               `json:"isAi"`
	Status     MessageStatus      `json:"status"`
	Attachment *MessageAttachment `json:"attachment,omitempty"`
}

type RoadmapTaskDTO struct {
	ID         string  `json:"id"`
	Title      string  `json:"title"`
	Status     string  `json:"status"`
	AssigneeID *string `json:"assigneeId,omitempty"`
}

type RoadmapDocumentDTO struct {
	Objective string           `json:"objective"`
	Tasks     []RoadmapTaskDTO `json:"tasks"`
}

type ProjectDataDTO struct {
	WorkspaceID string             `json:"workspaceId"`
	ProjectID   string             `json:"projectId"`
	ProjectName string             `json:"projectName"`
	Roadmap     RoadmapDocumentDTO `json:"roadmap"`
}

type TerminalSnapshotBufferDTO struct {
	Data      string  `json:"data"`
	Rows      uint16  `json:"rows"`
	Cols      uint16  `json:"cols"`
	CursorRow uint16  `json:"cursorRow"`
	CursorCol uint16  `json:"cursorCol"`
	History   *string `json:"history,omitempty"`
}

type TerminalSnapshotDTO struct {
	TerminalID string                    `json:"terminalId"`
	Seq        uint64                    `json:"seq"`
	Buffer     TerminalSnapshotBufferDTO `json:"buffer"`
}

type TerminalSessionDTO struct {
	TerminalID   string              `json:"terminalId"`
	MemberID     string              `json:"memberId,omitempty"`
	WorkspaceID  string              `json:"workspaceId,omitempty"`
	TerminalType string              `json:"terminalType,omitempty"`
	Command      string              `json:"command,omitempty"`
	Status       TerminalStatus      `json:"status"`
	Seq          uint64              `json:"seq"`
	UnackedBytes uint64              `json:"unackedBytes"`
	KeepAlive    bool                `json:"keepAlive"`
	Metadata     map[string]string   `json:"metadata,omitempty"`
	CreatedAt    string              `json:"createdAt"`
	UpdatedAt    string              `json:"updatedAt"`
	Snapshot     TerminalSnapshotDTO `json:"snapshot"`
}

type ChatMessageCreatedEvent struct {
	Event            EventName  `json:"event"`
	WorkspaceID      string     `json:"workspaceId"`
	ConversationID   string     `json:"conversationId"`
	Message          MessageDTO `json:"message"`
	TotalUnreadCount int        `json:"totalUnreadCount"`
}

type FriendsSnapshotUpdatedEvent struct {
	Event       EventName   `json:"event"`
	WorkspaceID string      `json:"workspaceId"`
	Members     []MemberDTO `json:"members"`
}

type RoadmapUpdatedEvent struct {
	Event       EventName          `json:"event"`
	WorkspaceID string             `json:"workspaceId"`
	Roadmap     RoadmapDocumentDTO `json:"roadmap"`
}

type TerminalReadyEvent struct {
	Event       EventName           `json:"event"`
	WorkspaceID string              `json:"workspaceId"`
	Session     TerminalSessionDTO  `json:"session"`
	Snapshot    TerminalSnapshotDTO `json:"snapshot"`
}

type TerminalOutputDeltaEvent struct {
	Event       EventName `json:"event"`
	WorkspaceID string    `json:"workspaceId"`
	TerminalID  string    `json:"terminalId"`
	Data        string    `json:"data"`
	Seq         uint64    `json:"seq"`
}

type TerminalStatusChangedEvent struct {
	Event       EventName `json:"event"`
	WorkspaceID string    `json:"workspaceId"`
	TerminalID  string    `json:"terminalId"`
	MemberID    string    `json:"memberId,omitempty"`
	Status      string    `json:"status"`
}

// NodeDTO is the API representation of a registered node.
type NodeDTO struct {
	ID              string            `json:"id"`
	Hostname        string            `json:"hostname"`
	NodeType        string            `json:"nodeType"`
	Status          string            `json:"status"`
	Labels          map[string]string `json:"labels,omitempty"`
	RegisteredAt    string            `json:"registeredAt"`
	LastHeartbeatAt string            `json:"lastHeartbeatAt"`
}

// NodeStatusChangedEvent is broadcast when a node transitions between status values.
type NodeStatusChangedEvent struct {
	Event    EventName `json:"event"`
	NodeID   string    `json:"nodeId"`
	Hostname string    `json:"hostname"`
	Status   string    `json:"status"`
}

// SkillDTO is the API representation of a skill catalog entry.
type SkillDTO struct {
	Name           string `json:"name"`
	Description    string `json:"description,omitempty"`
	Path           string `json:"path,omitempty"`
	Category       string `json:"category,omitempty"`
	ContentSummary string `json:"contentSummary,omitempty"`
}

// MemberSkillsDTO lists all skills assigned to a member.
type MemberSkillsDTO struct {
	MemberID string     `json:"memberId"`
	Skills   []SkillDTO `json:"skills"`
}

// TokenEventDTO is the API request/response representation of a token usage event.
type TokenEventDTO struct {
	ID           string  `json:"id,omitempty"`
	MemberID     string  `json:"memberId"`
	NodeID       string  `json:"nodeId,omitempty"`
	Model        string  `json:"model"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	Cost         float64 `json:"cost"`
	Timestamp    string  `json:"timestamp,omitempty"`
}

// TokenStatsDTO is the aggregated token usage statistics response.
type TokenStatsDTO struct {
	Scope        string  `json:"scope"`
	InputTokens  int64   `json:"inputTokens"`
	OutputTokens int64   `json:"outputTokens"`
	TotalTokens  int64   `json:"totalTokens"`
	TotalCost    float64 `json:"totalCost"`
	EventCount   int64   `json:"eventCount"`
}

// RunDTO is the API representation of an AEL Run.
type RunDTO struct {
	ID          string  `json:"id"`
	TenantID    string  `json:"tenantId"`
	HiveID      string  `json:"hiveId"`
	State       string  `json:"state"`
	PolicySetID string  `json:"policySetId,omitempty"`
	TokenBudget int     `json:"tokenBudget"`
	TokensUsed  int     `json:"tokensUsed"`
	CostUSD     float64 `json:"costUsd"`
	Objective   string  `json:"objective,omitempty"`
	Version     int     `json:"version"`
	CreatedAt   string  `json:"createdAt"`
	UpdatedAt   string  `json:"updatedAt"`
	Flows       []FlowDTO `json:"flows,omitempty"`
}

// FlowDTO is the API representation of an AEL Flow.
type FlowDTO struct {
	ID           string `json:"id"`
	RunID        string `json:"runId"`
	TenantID     string `json:"tenantId"`
	AgentRole    string `json:"agentRole"`
	AssignedNode string `json:"assignedNode,omitempty"`
	State        string `json:"state"`
	Version      int    `json:"version"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
}

// StepDTO is the API representation of an AEL Step.
type StepDTO struct {
	ID            string       `json:"id"`
	FlowID        string       `json:"flowId"`
	RunID         string       `json:"runId"`
	TenantID      string       `json:"tenantId"`
	State         string       `json:"state"`
	Regime        string       `json:"regime"`
	WorkloadClass string       `json:"workloadClass"`
	AgentType     string       `json:"agentType,omitempty"`
	Provider      string       `json:"provider,omitempty"`
	TokensUsed    int          `json:"tokensUsed"`
	CostUSD       float64      `json:"costUsd"`
	DurationMS    int          `json:"durationMs"`
	FailureReason string       `json:"failureReason,omitempty"`
	Version       int          `json:"version"`
	CreatedAt     string       `json:"createdAt"`
	UpdatedAt     string       `json:"updatedAt"`
	SideEffects   []SideEffectDTO `json:"sideEffects,omitempty"`
}

// SideEffectDTO is the API representation of an AEL SideEffect.
type SideEffectDTO struct {
	ID               string `json:"id"`
	StepID           string `json:"stepId"`
	RunID            string `json:"runId"`
	TenantID         string `json:"tenantId"`
	Seq              int    `json:"seq"`
	TargetSystem     string `json:"targetSystem"`
	OperationType    string `json:"operationType"`
	IdempotencyClass string `json:"idempotencyClass"`
	IdempotencyKey   string `json:"idempotencyKey,omitempty"`
	State            string `json:"state"`
	PolicyOutcome    string `json:"policyOutcome,omitempty"`
	ExecutedAt       string `json:"executedAt,omitempty"`
	CreatedAt        string `json:"createdAt"`
}

// MemoryEntryDTO is the API representation of a distributed memory entry.
type MemoryEntryDTO struct {
	ID        string `json:"id,omitempty"`
	Key       string `json:"key"`
	Value     string `json:"value"`
	Scope     string `json:"scope"`
	OwnerID   string `json:"ownerId,omitempty"`
	NodeID    string `json:"nodeId,omitempty"`
	CreatedAt string `json:"createdAt,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
	// TTLSeconds is 0 when the entry does not expire.
	TTLSeconds int64 `json:"ttlSeconds,omitempty"`
}

// SkillDefinitionDTO is the API representation of a Skill Library entry (paper §5.4.5).
type SkillDefinitionDTO struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	Version           int      `json:"version"`
	Description       string   `json:"description,omitempty"`
	PromptTemplate    string   `json:"promptTemplate,omitempty"`
	ToolRequirements  []string `json:"toolRequirements,omitempty"`
	AgentTypeAffinity []string `json:"agentTypeAffinity,omitempty"`
	WorkloadClassTags []string `json:"workloadClassTags,omitempty"`
	TenantID          string   `json:"tenantId,omitempty"`
	AuthoredBy        string   `json:"authoredBy,omitempty"`
	PublishedAt       string   `json:"publishedAt"`
	EmbeddingStatus   string   `json:"embeddingStatus"`
}

// ProcessTemplateDTO is the API representation of a Process Template Library entry (paper §5.6.0).
type ProcessTemplateDTO struct {
	ID                 string   `json:"id"`
	Name               string   `json:"name"`
	Version            int      `json:"version"`
	TriggerDescription string   `json:"triggerDescription,omitempty"`
	DAGTemplate        string   `json:"dagTemplate,omitempty"` // raw JSON string
	ApplicableDomains  []string `json:"applicableDomains,omitempty"`
	EstimatedStepsMin  int      `json:"estimatedStepsMin"`
	EstimatedStepsMax  int      `json:"estimatedStepsMax"`
	AuthoredBy         string   `json:"authoredBy,omitempty"`
	PublishedAt        string   `json:"publishedAt"`
	EmbeddingStatus    string   `json:"embeddingStatus"`
}

// SEMRecordDTO is the API representation of a Shared Execution Memory record (paper §5.7).
type SEMRecordDTO struct {
	ID              string  `json:"id"`
	Type            string  `json:"type"`
	Scope           string  `json:"scope"`
	HiveID          string  `json:"hiveId"`
	RunID           string  `json:"runId,omitempty"`
	Key             string  `json:"key,omitempty"`
	Content         string  `json:"content,omitempty"` // raw JSON string
	CreatedBy       string  `json:"createdBy,omitempty"`
	SourceStep      string  `json:"sourceStep,omitempty"`
	Confidence      float64 `json:"confidence"`
	Version         int     `json:"version"`
	SupersededBy    string  `json:"supersededBy,omitempty"`
	ResolvedAt      string  `json:"resolvedAt,omitempty"`
	EmbeddingStatus string  `json:"embeddingStatus"`
	CreatedAt       string  `json:"createdAt"`
}
