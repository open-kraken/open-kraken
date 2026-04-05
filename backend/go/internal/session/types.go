package session

import (
	"errors"
	"time"
)

var ErrSessionNotFound = errors.New("session not found")

const (
	EventAttach   = "terminal.attach"
	EventSnapshot = "terminal.snapshot"
	EventDelta    = "terminal.delta"
	EventStatus   = "terminal.status"
	EventDispatch = "terminal.dispatch"
)

type Status string

const (
	StatusIdle     Status = "idle"
	StatusStarting Status = "starting"
	StatusAttached Status = "attached"
	StatusRunning  Status = "running"
	StatusExited   Status = "exited"
	StatusError    Status = "error"
)

type CreateRequest struct {
	SessionID    string            `json:"sessionId"`
	MemberID     string            `json:"memberId"`
	WorkspaceID  string            `json:"workspaceId"`
	Command      string            `json:"command"`
	CWD          string            `json:"cwd"`
	TerminalType string            `json:"terminalType"`
	KeepAlive    bool              `json:"keepAlive"`
	Cols         uint16            `json:"cols"`
	Rows         uint16            `json:"rows"`
	Metadata     map[string]string `json:"metadata"`
}

type AttachRequest struct {
	SessionID    string `json:"sessionId"`
	SubscriberID string `json:"subscriberId"`
	AfterSeq     uint64 `json:"afterSeq"`
}

type Cursor struct {
	Row uint16 `json:"row"`
	Col uint16 `json:"col"`
}

type ProcessExit struct {
	Code   *int32 `json:"code,omitempty"`
	Signal string `json:"signal,omitempty"`
}

type DispatchContext struct {
	ConversationID   string `json:"conversationId"`
	ConversationType string `json:"conversationType"`
	SenderID         string `json:"senderId"`
	SenderName       string `json:"senderName"`
	MessageID        string `json:"messageId"`
	ClientTraceID    string `json:"clientTraceId"`
	Timestamp        int64  `json:"timestamp"`
}

type SnapshotPayload struct {
	SessionID      string       `json:"sessionId"`
	SubscriberID   string       `json:"subscriberId"`
	Seq            uint64       `json:"seq"`
	Rows           uint16       `json:"rows"`
	Cols           uint16       `json:"cols"`
	Cursor         Cursor       `json:"cursor"`
	TerminalStatus Status       `json:"terminalStatus"`
	ProcessExit    *ProcessExit `json:"processExit,omitempty"`
	Buffer         string       `json:"buffer"`
}

type DeltaPayload struct {
	SessionID      string       `json:"sessionId"`
	SubscriberID   string       `json:"subscriberId,omitempty"`
	Seq            uint64       `json:"seq"`
	Data           string       `json:"data"`
	Cursor         Cursor       `json:"cursor"`
	TerminalStatus Status       `json:"terminalStatus"`
	ProcessExit    *ProcessExit `json:"processExit,omitempty"`
}

type StatusPayload struct {
	SessionID      string       `json:"sessionId"`
	SubscriberID   string       `json:"subscriberId,omitempty"`
	Seq            uint64       `json:"seq"`
	TerminalStatus Status       `json:"terminalStatus"`
	ProcessExit    *ProcessExit `json:"processExit,omitempty"`
}

type DispatchPayload struct {
	SessionID      string          `json:"sessionId"`
	Seq            uint64          `json:"seq"`
	Data           string          `json:"data"`
	TerminalStatus Status          `json:"terminalStatus"`
	Context        DispatchContext `json:"context"`
}

type AttachEnvelope struct {
	Snapshot SnapshotPayload `json:"snapshot"`
	Deltas   []DeltaPayload  `json:"deltas"`
	Status   StatusPayload   `json:"status"`
}

type SessionInfo struct {
	SessionID       string            `json:"sessionId"`
	MemberID        string            `json:"memberId,omitempty"`
	WorkspaceID     string            `json:"workspaceId,omitempty"`
	TerminalType    string            `json:"terminalType,omitempty"`
	Command         string            `json:"command,omitempty"`
	Status          Status            `json:"status"`
	Seq             uint64            `json:"seq"`
	SubscriberCount int               `json:"subscriberCount"`
	KeepAlive       bool              `json:"keepAlive"`
	Metadata        map[string]string `json:"metadata,omitempty"`
	CreatedAt       time.Time         `json:"createdAt"`
	UpdatedAt       time.Time         `json:"updatedAt"`
}

func ProcessState(status Status) string {
	switch status {
	case StatusIdle, StatusStarting:
		return "starting"
	case StatusAttached, StatusRunning:
		return "running"
	case StatusExited:
		return "exited"
	case StatusError:
		return "failed"
	default:
		return "running"
	}
}
