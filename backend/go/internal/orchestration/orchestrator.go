// Package orchestration coordinates cross-service workflows: message dispatch
// to terminals, member invite sequences, and terminal lifecycle management.
package orchestration

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/dispatch"
	"open-kraken/backend/go/internal/terminal/provider"
	"open-kraken/backend/go/internal/terminal/semantic"
)

// Orchestrator coordinates message dispatch and terminal lifecycle.
type Orchestrator struct {
	msgSvc           *message.Service
	termSvc          *terminal.Service
	providerRegistry *provider.Registry
	hub              *realtime.Hub
}

// New creates an Orchestrator.
func New(
	msgSvc *message.Service,
	termSvc *terminal.Service,
	providerRegistry *provider.Registry,
	hub *realtime.Hub,
) *Orchestrator {
	return &Orchestrator{
		msgSvc:           msgSvc,
		termSvc:          termSvc,
		providerRegistry: providerRegistry,
		hub:              hub,
	}
}

// DispatchChatToTerminal routes a chat message to the target member's terminal
// session. This is the core chat→terminal dispatch path used by the outbox worker.
func (o *Orchestrator) DispatchChatToTerminal(ctx context.Context, task message.OutboxTask) error {
	// Find the member's terminal session.
	sessionID, ok := o.termSvc.ResolveMemberSession(task.WorkspaceID, task.TargetMemberID)
	if !ok {
		return fmt.Errorf("no active session for member %s", task.TargetMemberID)
	}

	// Parse the dispatch payload.
	var payload struct {
		Text           string `json:"text"`
		ConversationID string `json:"conversationId"`
		SenderID       string `json:"senderId"`
		SenderName     string `json:"senderName"`
	}
	if err := json.Unmarshal([]byte(task.Payload), &payload); err != nil {
		return fmt.Errorf("parse dispatch payload: %w", err)
	}

	// Enqueue in the dispatch queue (respects inflight and dedup).
	actor, actorOk := o.termSvc.GetActor(sessionID)
	if actorOk && actor.HasIntelligence() {
		entry := dispatch.Entry{
			Data:           payload.Text,
			MessageID:      task.MessageID,
			ConversationID: payload.ConversationID,
			SenderID:       payload.SenderID,
			SenderName:     payload.SenderName,
		}
		if !actor.EnqueueDispatch(entry) {
			return fmt.Errorf("dispatch queue full or duplicate for session %s", sessionID)
		}
		// Trigger drain attempt.
		actor.DrainDispatch()
		return nil
	}

	// Fallback: direct write if no intelligence.
	return o.termSvc.Dispatch(sessionID, payload.Text, session.DispatchContext{
		ConversationID: payload.ConversationID,
		SenderID:       payload.SenderID,
		SenderName:     payload.SenderName,
		MessageID:      task.MessageID,
	})
}

// InviteMember creates a terminal session for a new member and executes
// the provider's post-ready sequence.
func (o *Orchestrator) InviteMember(
	ctx context.Context,
	memberID, workspaceID, terminalType, customCommand, cwd string,
	messageSink semantic.MessageSink,
) (session.SessionInfo, error) {
	info, err := o.termSvc.CreateSessionForMember(
		ctx, memberID, workspaceID, terminalType, customCommand, cwd,
		o.providerRegistry, messageSink,
	)
	if err != nil {
		return info, fmt.Errorf("invite member: %w", err)
	}

	log.Printf("orchestration: invited member %s with terminal type %s (session %s)",
		memberID, terminalType, info.SessionID)

	return info, nil
}

