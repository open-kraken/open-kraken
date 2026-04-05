package message

import (
	"errors"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/domain/conversation"
	"open-kraken/backend/go/internal/domain/member"
)

var (
	ErrInvalidID                 = errors.New("message id is required")
	ErrInvalidWorkspace          = errors.New("message workspaceId is required")
	ErrInvalidConversation       = errors.New("message conversationId is required")
	ErrInvalidSender             = errors.New("message senderMemberId is required")
	ErrInvalidBody               = errors.New("message body is required")
	ErrInvalidStatus             = errors.New("message status is invalid")
	ErrInvalidCreatedAt          = errors.New("message createdAt is required")
	ErrInvalidUpdatedAt          = errors.New("message updatedAt must be >= createdAt")
	ErrInvalidVersion            = errors.New("message version must be >= 1")
	ErrConversationWorkspaceLink = errors.New("message conversation must belong to the same workspace")
	ErrSenderWorkspaceLink       = errors.New("message sender must belong to the same workspace")
	ErrSenderConversationLink    = errors.New("message sender must belong to the conversation")
)

type Status string

const (
	StatusSending Status = Status(contracts.MessageStatusSending)
	StatusSent    Status = Status(contracts.MessageStatusSent)
	StatusFailed  Status = Status(contracts.MessageStatusFailed)
)

type Message struct {
	ID             string
	WorkspaceID    string
	ConversationID string
	SenderMemberID string
	Body           string
	Status         Status
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Version        uint64
}

func (m Message) Validate() error {
	if strings.TrimSpace(m.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(m.WorkspaceID) == "" {
		return ErrInvalidWorkspace
	}
	if strings.TrimSpace(m.ConversationID) == "" {
		return ErrInvalidConversation
	}
	if strings.TrimSpace(m.SenderMemberID) == "" {
		return ErrInvalidSender
	}
	if strings.TrimSpace(m.Body) == "" {
		return ErrInvalidBody
	}
	if m.Status != StatusSending && m.Status != StatusSent && m.Status != StatusFailed {
		return ErrInvalidStatus
	}
	if m.CreatedAt.IsZero() {
		return ErrInvalidCreatedAt
	}
	if m.UpdatedAt.IsZero() || m.UpdatedAt.Before(m.CreatedAt) {
		return ErrInvalidUpdatedAt
	}
	if m.Version < 1 {
		return ErrInvalidVersion
	}
	return nil
}

func (m Message) ContractStatus() contracts.MessageStatus {
	return contracts.MessageStatus(m.Status)
}

func (m Message) ValidateReferences(conv conversation.Conversation, sender member.Member) error {
	if err := m.Validate(); err != nil {
		return err
	}
	if err := conv.Validate(); err != nil {
		return err
	}
	if err := sender.Validate(); err != nil {
		return err
	}
	if conv.WorkspaceID != m.WorkspaceID || conv.ID != m.ConversationID {
		return ErrConversationWorkspaceLink
	}
	if sender.WorkspaceID != m.WorkspaceID || sender.ID != m.SenderMemberID {
		return ErrSenderWorkspaceLink
	}
	if !conv.IncludesMember(sender.ID) {
		return ErrSenderConversationLink
	}
	return nil
}
