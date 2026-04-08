package message

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// PipelineResult carries the message through each stage and accumulates
// decisions made along the way.
type PipelineResult struct {
	Message   Message
	Targets   []string // member IDs that should receive the message
	Dropped   bool     // true if policy/throttle decided to suppress
	DropReason string
}

// Pipeline processes an inbound message through ordered stages:
//
//	Normalize → Plan → Policy → Throttle → Deliver
type Pipeline struct {
	repo Repository
	now  func() time.Time
	// memberResolver returns member IDs in a conversation (injected).
	memberResolver func(ctx context.Context, workspaceID, conversationID string) ([]string, error)
	// isDND returns true if the target member has set Do-Not-Disturb.
	isDND func(ctx context.Context, memberID string) bool
}

// NewPipeline creates a Pipeline with the given dependencies.
func NewPipeline(repo Repository, memberResolver func(ctx context.Context, wsID, convID string) ([]string, error), isDND func(ctx context.Context, memberID string) bool) *Pipeline {
	return &Pipeline{
		repo:           repo,
		now:            time.Now,
		memberResolver: memberResolver,
		isDND:          isDND,
	}
}

// Process runs all pipeline stages and returns the result.
func (p *Pipeline) Process(ctx context.Context, m Message) (PipelineResult, error) {
	r := PipelineResult{Message: m}

	// Stage 1: Normalize
	p.normalize(&r)

	// Stage 2: Plan — resolve delivery targets
	if err := p.plan(ctx, &r); err != nil {
		return r, fmt.Errorf("pipeline plan: %w", err)
	}

	// Stage 3: Policy — DND & mention checks
	p.policy(ctx, &r)
	if r.Dropped {
		return r, nil
	}

	// Stage 4: Throttle — rate limiting (placeholder, always allows)
	p.throttle(&r)
	if r.Dropped {
		return r, nil
	}

	// Stage 5: Deliver — persist to repository
	if err := p.deliver(ctx, &r); err != nil {
		return r, fmt.Errorf("pipeline deliver: %w", err)
	}

	return r, nil
}

// normalize trims whitespace, enforces defaults, and sets timestamps.
func (p *Pipeline) normalize(r *PipelineResult) {
	m := &r.Message
	m.ContentText = strings.TrimSpace(m.ContentText)
	if m.ContentType == "" {
		m.ContentType = ContentTypeText
	}
	if m.Status == "" {
		m.Status = StatusSending
	}
	now := p.now()
	if m.CreatedAt.IsZero() {
		m.CreatedAt = now
	}
	m.UpdatedAt = now
}

// plan resolves which members should receive the message.
func (p *Pipeline) plan(ctx context.Context, r *PipelineResult) error {
	if p.memberResolver == nil {
		return nil
	}
	members, err := p.memberResolver(ctx, r.Message.WorkspaceID, r.Message.ConversationID)
	if err != nil {
		return err
	}
	// Exclude the sender from the target list.
	targets := make([]string, 0, len(members))
	for _, mid := range members {
		if mid != r.Message.SenderID {
			targets = append(targets, mid)
		}
	}
	r.Targets = targets
	return nil
}

// policy checks DND status and mention scope.
func (p *Pipeline) policy(ctx context.Context, r *PipelineResult) {
	if p.isDND == nil {
		return
	}
	// Filter out DND targets (they won't get terminal dispatch).
	filtered := make([]string, 0, len(r.Targets))
	for _, mid := range r.Targets {
		if !p.isDND(ctx, mid) {
			filtered = append(filtered, mid)
		}
	}
	r.Targets = filtered
	// Message is still persisted even if all targets are DND.
}

// throttle applies rate limiting. Currently a pass-through.
func (p *Pipeline) throttle(r *PipelineResult) {
	// Future: per-conversation/per-member rate limiting.
	// For now, all messages pass through.
}

// deliver persists the message. If there are delivery targets the message is
// queued for outbox dispatch; otherwise it is marked sent immediately.
func (p *Pipeline) deliver(ctx context.Context, r *PipelineResult) error {
	if len(r.Targets) > 0 {
		r.Message.Status = StatusQueued
	} else {
		r.Message.Status = StatusSent
	}
	r.Message.UpdatedAt = p.now()
	if err := p.repo.Append(ctx, r.Message); err != nil {
		r.Message.Status = StatusFailed
		return err
	}
	return nil
}
