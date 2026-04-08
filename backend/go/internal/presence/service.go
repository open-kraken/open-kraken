// Package presence tracks member online status with realtime event broadcasting.
// It provides the foundation for the friends/contacts system (Phase 5).
package presence

import (
	"context"
	"sync"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Status represents a member's availability.
type Status string

const (
	StatusOnline  Status = "online"
	StatusWorking Status = "working"
	StatusDND     Status = "dnd"
	StatusOffline Status = "offline"
)

// MemberPresence holds the presence state for a single member.
type MemberPresence struct {
	MemberID       string
	WorkspaceID    string
	Status         Status
	ManualStatus   Status // user-set override
	TerminalStatus string // from terminal intelligence
	LastSeenAt     time.Time
	LastHeartbeat  time.Time
}

// EffectiveStatus returns the display status, preferring manual override.
func (p MemberPresence) EffectiveStatus() Status {
	if p.ManualStatus != "" {
		return p.ManualStatus
	}
	return p.Status
}

// Service tracks member presence in-memory and publishes realtime events.
type Service struct {
	mu       sync.RWMutex
	members  map[string]*MemberPresence // key: workspaceID:memberID
	hub      *realtime.Hub
	now      func() time.Time
	// heartbeatTimeout marks a member offline if no heartbeat received.
	heartbeatTimeout time.Duration
}

// NewService creates a presence Service.
func NewService(hub *realtime.Hub) *Service {
	return &Service{
		members:          make(map[string]*MemberPresence),
		hub:              hub,
		now:              time.Now,
		heartbeatTimeout: 60 * time.Second,
	}
}

// SetStatus sets a member's presence status and publishes an event.
func (s *Service) SetStatus(ctx context.Context, workspaceID, memberID string, status Status) {
	s.mu.Lock()
	key := presenceKey(workspaceID, memberID)
	p, ok := s.members[key]
	if !ok {
		p = &MemberPresence{
			MemberID:    memberID,
			WorkspaceID: workspaceID,
		}
		s.members[key] = p
	}
	now := s.now()
	p.ManualStatus = status
	p.LastSeenAt = now
	p.LastHeartbeat = now
	effective := p.EffectiveStatus()
	s.mu.Unlock()

	s.publishStatus(workspaceID, memberID, effective, p.TerminalStatus)
}

// Heartbeat records a heartbeat from a member, keeping them online.
func (s *Service) Heartbeat(ctx context.Context, workspaceID, memberID string) {
	s.mu.Lock()
	key := presenceKey(workspaceID, memberID)
	p, ok := s.members[key]
	if !ok {
		p = &MemberPresence{
			MemberID:    memberID,
			WorkspaceID: workspaceID,
			Status:      StatusOnline,
		}
		s.members[key] = p
	}
	now := s.now()
	p.LastHeartbeat = now
	p.LastSeenAt = now
	if p.Status == StatusOffline {
		p.Status = StatusOnline
	}
	s.mu.Unlock()
}

// UpdateTerminalStatus updates the terminal status for a member.
func (s *Service) UpdateTerminalStatus(ctx context.Context, workspaceID, memberID, terminalStatus string) {
	s.mu.Lock()
	key := presenceKey(workspaceID, memberID)
	p, ok := s.members[key]
	if !ok {
		p = &MemberPresence{
			MemberID:    memberID,
			WorkspaceID: workspaceID,
			Status:      StatusOnline,
		}
		s.members[key] = p
	}
	p.TerminalStatus = terminalStatus
	p.LastSeenAt = s.now()
	effective := p.EffectiveStatus()
	s.mu.Unlock()

	s.publishStatus(workspaceID, memberID, effective, terminalStatus)
}

// GetPresence returns the presence for a member.
func (s *Service) GetPresence(workspaceID, memberID string) (MemberPresence, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, ok := s.members[presenceKey(workspaceID, memberID)]
	if !ok {
		return MemberPresence{}, false
	}
	return *p, true
}

// ListOnline returns all members with active presence in a workspace.
func (s *Service) ListOnline(workspaceID string) []MemberPresence {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []MemberPresence
	for _, p := range s.members {
		if p.WorkspaceID == workspaceID && p.EffectiveStatus() != StatusOffline {
			out = append(out, *p)
		}
	}
	return out
}

// IsDND returns true if a member has set Do-Not-Disturb.
func (s *Service) IsDND(ctx context.Context, memberID string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.members {
		if p.MemberID == memberID && p.ManualStatus == StatusDND {
			return true
		}
	}
	return false
}

// Sweep checks for stale heartbeats and marks members offline.
// Should be called periodically (e.g., every 30s).
func (s *Service) Sweep(ctx context.Context) {
	s.mu.Lock()
	now := s.now()
	var offlineMembers []MemberPresence
	for _, p := range s.members {
		if p.EffectiveStatus() != StatusOffline &&
			!p.LastHeartbeat.IsZero() &&
			now.Sub(p.LastHeartbeat) > s.heartbeatTimeout {
			p.Status = StatusOffline
			offlineMembers = append(offlineMembers, *p)
		}
	}
	s.mu.Unlock()

	for _, p := range offlineMembers {
		s.publishStatus(p.WorkspaceID, p.MemberID, StatusOffline, p.TerminalStatus)
	}
}

// Start runs a periodic sweep loop. Blocks until ctx is cancelled.
func (s *Service) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.Sweep(ctx)
		}
	}
}

func (s *Service) publishStatus(workspaceID, memberID string, status Status, terminalStatus string) {
	if s.hub == nil {
		return
	}
	s.hub.Publish(realtime.Event{
		Name:        realtime.EventPresenceStatus,
		WorkspaceID: workspaceID,
		MemberID:    memberID,
		OccurredAt:  s.now(),
		Payload: realtime.PresenceStatusPayload{
			MemberID:       memberID,
			PresenceState:  string(status),
			TerminalStatus: terminalStatus,
		},
	})
}

// PublishSnapshot sends a full presence snapshot for all members in a workspace.
func (s *Service) PublishSnapshot(workspaceID string) {
	s.mu.RLock()
	var members []realtime.PresenceMember
	for _, p := range s.members {
		if p.WorkspaceID == workspaceID {
			members = append(members, realtime.PresenceMember{
				MemberID:       p.MemberID,
				PresenceState:  string(p.EffectiveStatus()),
				TerminalStatus: p.TerminalStatus,
				LastHeartbeat:  p.LastHeartbeat,
			})
		}
	}
	s.mu.RUnlock()

	if s.hub != nil {
		s.hub.Publish(realtime.Event{
			Name:        realtime.EventPresenceSnapshot,
			WorkspaceID: workspaceID,
			OccurredAt:  s.now(),
			Payload: realtime.PresenceSnapshotPayload{
				Members: members,
			},
		})
	}
}

func presenceKey(workspaceID, memberID string) string {
	return workspaceID + ":" + memberID
}
