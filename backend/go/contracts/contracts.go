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
