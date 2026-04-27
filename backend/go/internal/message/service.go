package message

import (
	"context"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service provides message CRUD, pipeline processing, and realtime event
// publishing. It follows the same patterns as ledger.Service and memory.Service.
type Service struct {
	repo     Repository
	hub      *realtime.Hub
	pipeline *Pipeline
	now      func() time.Time
	idGen    func() string
	seqGen   func() uint64
}

// NewService creates a message Service.
func NewService(repo Repository, hub *realtime.Hub) *Service {
	s := &Service{
		repo:   repo,
		hub:    hub,
		now:    time.Now,
		idGen:  defaultMsgIDGen,
		seqGen: defaultSeqGen,
	}
	// Pipeline with no member resolver or DND check (injected later via SetMemberResolver / SetDNDCheck).
	s.pipeline = NewPipeline(repo, nil, nil)
	return s
}

// SetMemberResolver injects the function that resolves conversation members.
func (s *Service) SetMemberResolver(fn func(ctx context.Context, wsID, convID string) ([]string, error)) {
	s.pipeline.memberResolver = fn
}

// SetDNDCheck injects the DND checker used by the policy stage.
func (s *Service) SetDNDCheck(fn func(ctx context.Context, memberID string) bool) {
	s.pipeline.isDND = fn
}

// Send processes a message through the pipeline, persists it, and publishes
// a realtime event. Returns the persisted message.
func (s *Service) Send(ctx context.Context, m Message) (Message, error) {
	if m.ID == "" {
		m.ID = s.idGen()
	}
	m.Seq = s.seqGen()

	result, err := s.pipeline.Process(ctx, m)
	if err != nil {
		return Message{}, fmt.Errorf("message send: %w", err)
	}

	s.publishChatDelta(result.Message)
	return result.Message, nil
}

// SendTerminal processes a terminal-originated message.
func (s *Service) SendTerminal(ctx context.Context, m Message) (Message, error) {
	if m.ContentType == "" {
		m.ContentType = ContentTypeTerminal
	}
	return s.Send(ctx, m)
}

// Get retrieves a single message.
func (s *Service) Get(ctx context.Context, id string) (Message, error) {
	m, err := s.repo.Get(ctx, id)
	if err != nil {
		return Message{}, fmt.Errorf("message get: %w", err)
	}
	return m, nil
}

// List returns messages matching the query.
func (s *Service) List(ctx context.Context, q Query) ([]Message, error) {
	msgs, err := s.repo.List(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("message list: %w", err)
	}
	return msgs, nil
}

// UpdateStatus changes the status of a message and publishes a status event.
func (s *Service) UpdateStatus(ctx context.Context, id string, status Status) error {
	if err := s.repo.UpdateStatus(ctx, id, status); err != nil {
		return fmt.Errorf("message update status: %w", err)
	}
	m, err := s.repo.Get(ctx, id)
	if err == nil {
		s.publishChatStatus(m)
	}
	return nil
}

// MarkRead records the read position and returns the updated unread count.
func (s *Service) MarkRead(ctx context.Context, mark UnreadMark) (int, error) {
	if mark.LastReadAt.IsZero() {
		mark.LastReadAt = s.now()
	}
	if err := s.repo.MarkRead(ctx, mark); err != nil {
		return 0, fmt.Errorf("message mark read: %w", err)
	}
	count, err := s.repo.UnreadCount(ctx, mark.WorkspaceID, mark.ConversationID, mark.MemberID)
	if err != nil {
		return 0, fmt.Errorf("message unread count: %w", err)
	}
	return count, nil
}

// UnreadCount returns the unread message count for a member in a conversation.
func (s *Service) UnreadCount(ctx context.Context, workspaceID, conversationID, memberID string) (int, error) {
	return s.repo.UnreadCount(ctx, workspaceID, conversationID, memberID)
}

// publishChatDelta sends a chat.delta realtime event.
func (s *Service) publishChatDelta(m Message) {
	if s.hub == nil {
		return
	}
	s.hub.Publish(realtime.Event{
		Name:        realtime.EventChatDelta,
		WorkspaceID: m.WorkspaceID,
		ChannelID:   m.ConversationID,
		MemberID:    m.SenderID,
		OccurredAt:  m.CreatedAt,
		Payload: realtime.ChatDeltaPayload{
			ConversationID: m.ConversationID,
			MessageID:      m.ID,
			SenderID:       m.SenderID,
			Sequence:       m.Seq,
			Body:           m.ContentText,
		},
	})
}

// publishChatStatus sends a chat.status realtime event.
func (s *Service) publishChatStatus(m Message) {
	if s.hub == nil {
		return
	}
	s.hub.Publish(realtime.Event{
		Name:        realtime.EventChatStatus,
		WorkspaceID: m.WorkspaceID,
		ChannelID:   m.ConversationID,
		OccurredAt:  s.now(),
		Payload: realtime.ChatStatusPayload{
			ConversationID: m.ConversationID,
			MessageID:      m.ID,
			Status:         string(m.Status),
		},
	})
}

var (
	msgCounter uint64
	seqCounter uint64
)

func defaultMsgIDGen() string {
	msgCounter++
	return fmt.Sprintf("msg_%d_%d", time.Now().UnixNano(), msgCounter)
}

func defaultSeqGen() uint64 {
	seqCounter++
	return seqCounter
}
