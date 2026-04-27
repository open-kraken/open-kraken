package realtime

import (
	"fmt"
	"strings"
	"time"
)

const (
	EventChatSnapshot      = "chat.snapshot"
	EventChatDelta         = "chat.delta"
	EventChatStatus        = "chat.status"
	EventChatUpdated       = "chat.updated"
	EventTerminalAttach    = "terminal.attach"
	EventTerminalSnapshot  = "terminal.snapshot"
	EventTerminalDelta     = "terminal.delta"
	EventTerminalStatus    = "terminal.status"
	EventPresenceSnapshot  = "presence.snapshot"
	EventPresenceDelta     = "presence.delta"
	EventPresenceStatus    = "presence.status"
	EventPresenceHeartbeat = "presence.updated"
	EventRoadmapSnapshot   = "roadmap.snapshot"
	EventRoadmapDelta      = "roadmap.delta"
	EventRoadmapStatus     = "roadmap.status"
	EventRoadmapUpdated    = "roadmap.updated"

	// Node registry events.
	EventNodeSnapshot = "node.snapshot"
	EventNodeUpdated  = "node.updated"
	EventNodeOffline  = "node.offline"

	// Token tracking events.
	EventTokenStatsUpdated = "token.stats_updated"
)

type Event struct {
	Cursor      string    `json:"cursor"`
	Name        string    `json:"name"`
	WorkspaceID string    `json:"workspaceId"`
	ChannelID   string    `json:"channelId,omitempty"`
	MemberID    string    `json:"memberId,omitempty"`
	TerminalID  string    `json:"terminalId,omitempty"`
	OccurredAt  time.Time `json:"occurredAt"`
	Payload     any       `json:"payload"`
}

type ChatSnapshotPayload struct {
	ConversationID string   `json:"conversationId"`
	MessageIDs     []string `json:"messageIds"`
}

type ChatDeltaPayload struct {
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
	SenderID       string `json:"senderId,omitempty"`
	Sequence       uint64 `json:"sequence"`
	Body           string `json:"body"`
}

type ChatStatusPayload struct {
	ConversationID string `json:"conversationId"`
	MessageID      string `json:"messageId"`
	Status         string `json:"status"`
}

type ChatUpdatedPayload struct {
	ConversationID string `json:"conversationId"`
	Reason         string `json:"reason"`
}

type TerminalAttachPayload struct {
	TerminalID      string `json:"terminalId"`
	ConnectionState string `json:"connectionState"`
	ProcessState    string `json:"processState"`
}

type TerminalSnapshotPayload struct {
	TerminalID      string `json:"terminalId"`
	ConnectionState string `json:"connectionState"`
	ProcessState    string `json:"processState"`
	Rows            int    `json:"rows"`
	Cols            int    `json:"cols"`
	Buffer          string `json:"buffer"`
}

type TerminalDeltaPayload struct {
	TerminalID string `json:"terminalId"`
	Sequence   uint64 `json:"sequence"`
	Data       string `json:"data"`
}

type TerminalStatusPayload struct {
	TerminalID      string `json:"terminalId"`
	ConnectionState string `json:"connectionState"`
	ProcessState    string `json:"processState"`
	Reason          string `json:"reason,omitempty"`
}

type PresenceSnapshotPayload struct {
	Members []PresenceMember `json:"members"`
}

type PresenceMember struct {
	MemberID       string    `json:"memberId"`
	PresenceState  string    `json:"presenceState"`
	TerminalStatus string    `json:"terminalStatus"`
	LastHeartbeat  time.Time `json:"lastHeartbeat"`
}

type PresenceDeltaPayload struct {
	Member PresenceMember `json:"member"`
}

type PresenceStatusPayload struct {
	MemberID       string `json:"memberId"`
	PresenceState  string `json:"presenceState"`
	TerminalStatus string `json:"terminalStatus"`
}

type PresenceHeartbeatPayload struct {
	MemberID      string    `json:"memberId"`
	PresenceState string    `json:"presenceState"`
	SentAt        time.Time `json:"sentAt"`
}

type RoadmapSnapshotPayload struct {
	WorkspaceID string   `json:"workspaceId"`
	ItemIDs     []string `json:"itemIds"`
	Version     uint64   `json:"version"`
}

type RoadmapDeltaPayload struct {
	WorkspaceID string `json:"workspaceId"`
	ItemID      string `json:"itemId"`
	Operation   string `json:"operation"`
	Version     uint64 `json:"version"`
}

type RoadmapStatusPayload struct {
	WorkspaceID string `json:"workspaceId"`
	State       string `json:"state"`
}

type RoadmapUpdatedPayload struct {
	WorkspaceID string `json:"workspaceId"`
	Version     uint64 `json:"version"`
	Reason      string `json:"reason"`
}

// NodeSnapshotPayload carries all current node IDs for initial sync.
type NodeSnapshotPayload struct {
	NodeIDs []string `json:"nodeIds"`
}

// NodeUpdatedPayload is broadcast when a node's state changes (register, heartbeat).
type NodeUpdatedPayload struct {
	NodeID      string `json:"nodeId"`
	Status      string `json:"status"`
	Hostname    string `json:"hostname"`
	WorkspaceID string `json:"workspaceId,omitempty"`
}

// NodeOfflinePayload is broadcast when a node goes offline (deregister or timeout).
type NodeOfflinePayload struct {
	NodeID      string `json:"nodeId"`
	Hostname    string `json:"hostname"`
	WorkspaceID string `json:"workspaceId,omitempty"`
}

// TokenStatsUpdatedPayload signals that token statistics have changed.
type TokenStatsUpdatedPayload struct {
	MemberID string `json:"memberId,omitempty"`
	NodeID   string `json:"nodeId,omitempty"`
}

func NewCursor(seq uint64) string {
	return fmt.Sprintf("rt_%020d", seq)
}

func ParseCursor(cursor string) (uint64, error) {
	if cursor == "" {
		return 0, nil
	}
	if !strings.HasPrefix(cursor, "rt_") {
		return 0, fmt.Errorf("cursor must start with rt_: %s", cursor)
	}
	var seq uint64
	if _, err := fmt.Sscanf(cursor, "rt_%d", &seq); err != nil {
		return 0, fmt.Errorf("parse cursor %q: %w", cursor, err)
	}
	return seq, nil
}
