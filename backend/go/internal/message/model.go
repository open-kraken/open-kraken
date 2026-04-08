// Package message provides persistent chat message storage, a multi-stage
// processing pipeline, and a reliable outbox for terminal dispatch delivery.
package message

import (
	"errors"
	"time"
)

// Errors returned by validation and repository operations.
var (
	ErrNotFound           = errors.New("message: not found")
	ErrInvalidID          = errors.New("message: id is required")
	ErrInvalidWorkspace   = errors.New("message: workspaceId is required")
	ErrInvalidConversation = errors.New("message: conversationId is required")
	ErrInvalidSender      = errors.New("message: senderId is required")
	ErrInvalidContent     = errors.New("message: content text is required")
	ErrInvalidContentType = errors.New("message: content type must be text, system, or terminal")
	ErrInvalidStatus      = errors.New("message: status is invalid")
)

// Status represents the delivery state of a message.
type Status string

const (
	StatusSending   Status = "sending"
	StatusQueued    Status = "queued"
	StatusSent      Status = "sent"
	StatusDelivered Status = "delivered"
	StatusFailed    Status = "failed"
)

// ContentType classifies the message payload.
type ContentType string

const (
	ContentTypeText     ContentType = "text"
	ContentTypeSystem   ContentType = "system"
	ContentTypeTerminal ContentType = "terminal"
)

// TerminalSource identifies where terminal output originated.
type TerminalSource string

const (
	TerminalSourcePTY    TerminalSource = "pty"
	TerminalSourceChat   TerminalSource = "chat"
	TerminalSourceSystem TerminalSource = "system"
	TerminalSourceAI     TerminalSource = "ai"
)

// TerminalMeta holds metadata for terminal-originated messages.
type TerminalMeta struct {
	TerminalID string         `json:"terminalId,omitempty"`
	Source     TerminalSource `json:"source,omitempty"`
	Command    string         `json:"command,omitempty"`
	LineCount  int            `json:"lineCount,omitempty"`
	CursorRow  int            `json:"cursorRow,omitempty"`
	CursorCol  int            `json:"cursorCol,omitempty"`
}

// Message is the core domain entity for a chat message.
type Message struct {
	ID             string
	WorkspaceID    string
	ConversationID string
	SenderID       string
	ContentType    ContentType
	ContentText    string
	Status         Status
	IsAI           bool
	SpanID         string
	Seq            uint64
	Terminal       *TerminalMeta
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Validate checks required fields.
func (m Message) Validate() error {
	if m.ID == "" {
		return ErrInvalidID
	}
	if m.WorkspaceID == "" {
		return ErrInvalidWorkspace
	}
	if m.ConversationID == "" {
		return ErrInvalidConversation
	}
	if m.SenderID == "" {
		return ErrInvalidSender
	}
	switch m.ContentType {
	case ContentTypeText, ContentTypeSystem, ContentTypeTerminal:
	default:
		return ErrInvalidContentType
	}
	if m.ContentText == "" {
		return ErrInvalidContent
	}
	switch m.Status {
	case StatusSending, StatusQueued, StatusSent, StatusDelivered, StatusFailed:
	default:
		return ErrInvalidStatus
	}
	return nil
}

// Preview returns a truncated content string suitable for conversation lists.
func (m Message) Preview(maxLen int) string {
	if len(m.ContentText) <= maxLen {
		return m.ContentText
	}
	return m.ContentText[:maxLen]
}

// Query specifies filter criteria for listing messages.
type Query struct {
	WorkspaceID    string
	ConversationID string
	SenderID       string
	BeforeID       string // cursor-based pagination: messages before this ID
	Limit          int
}

// UnreadMark tracks the last-read position per member per conversation.
type UnreadMark struct {
	WorkspaceID    string
	ConversationID string
	MemberID       string
	LastReadID     string
	LastReadAt     time.Time
}
