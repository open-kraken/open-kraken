package node

import (
	"context"
	"fmt"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service manages the node registry lifecycle: registration, heartbeat, offline
// detection, and real-time event broadcast via the realtime Hub.
type Service struct {
	repo NodeRepository
	hub  *realtime.Hub
	// now is injectable for deterministic testing.
	now func() time.Time
}

// NewService creates a node Service backed by the given repository and hub.
func NewService(repo NodeRepository, hub *realtime.Hub) *Service {
	return &Service{
		repo: repo,
		hub:  hub,
		now:  time.Now,
	}
}

// Register persists a new node record and broadcasts a node.updated event.
// The node status is forced to online, and timestamps are set to now.
func (s *Service) Register(ctx context.Context, n Node) (Node, error) {
	if err := n.Validate(); err != nil {
		return Node{}, err
	}
	now := s.now()
	n.Status = NodeStatusOnline
	n.RegisteredAt = now
	n.LastHeartbeatAt = now
	if err := s.repo.Save(ctx, n); err != nil {
		return Node{}, fmt.Errorf("node register: %w", err)
	}
	s.publishUpdated(n)
	return n, nil
}

// Deregister removes a node and broadcasts a node.offline event.
func (s *Service) Deregister(ctx context.Context, id string) error {
	n, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return fmt.Errorf("node deregister: %w", err)
	}
	if err := s.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("node deregister: %w", err)
	}
	n.Status = NodeStatusOffline
	s.publishOffline(n)
	return nil
}

// Heartbeat records a liveness ping from the given node and broadcasts node.updated.
func (s *Service) Heartbeat(ctx context.Context, id string) (Node, error) {
	if err := s.repo.UpdateHeartbeat(ctx, id, s.now()); err != nil {
		return Node{}, fmt.Errorf("node heartbeat: %w", err)
	}
	n, err := s.repo.FindByID(ctx, id)
	if err != nil {
		return Node{}, fmt.Errorf("node heartbeat: %w", err)
	}
	s.publishUpdated(n)
	return n, nil
}

// GetByID returns the node with the given id.
func (s *Service) GetByID(ctx context.Context, id string) (Node, error) {
	return s.repo.FindByID(ctx, id)
}

// List returns all registered nodes.
func (s *Service) List(ctx context.Context) ([]Node, error) {
	return s.repo.List(ctx)
}

// AssignAgent labels a node with an agent ID and broadcasts node.updated.
// In production this would update a dedicated assignment record; here the
// agent ID is stored as a label for simplicity.
func (s *Service) AssignAgent(ctx context.Context, nodeID, agentID string) (Node, error) {
	n, err := s.repo.FindByID(ctx, nodeID)
	if err != nil {
		return Node{}, fmt.Errorf("node assign agent: %w", err)
	}
	if n.Labels == nil {
		n.Labels = make(map[string]string)
	}
	n.Labels["agent_id"] = agentID
	if err := s.repo.Save(ctx, n); err != nil {
		return Node{}, fmt.Errorf("node assign agent: %w", err)
	}
	s.publishUpdated(n)
	return n, nil
}

// RemoveAgent removes the agent assignment for the given agentID from a node.
// Returns ErrNotFound when the node does not exist.
func (s *Service) RemoveAgent(ctx context.Context, nodeID, agentID string) (Node, error) {
	n, err := s.repo.FindByID(ctx, nodeID)
	if err != nil {
		return Node{}, fmt.Errorf("node remove agent: %w", err)
	}
	// Remove any label whose value matches agentID to keep the store consistent.
	for k, v := range n.Labels {
		if v == agentID {
			delete(n.Labels, k)
		}
	}
	if err := s.repo.Save(ctx, n); err != nil {
		return Node{}, fmt.Errorf("node remove agent: %w", err)
	}
	s.publishUpdated(n)
	return n, nil
}

// PublishSnapshot broadcasts a node.snapshot event with all current node IDs.
func (s *Service) PublishSnapshot(ctx context.Context) {
	nodes, err := s.repo.List(ctx)
	if err != nil {
		return
	}
	ids := make([]string, 0, len(nodes))
	for _, n := range nodes {
		ids = append(ids, n.ID)
	}
	s.hub.Publish(realtime.Event{
		Name:    realtime.EventNodeSnapshot,
		Payload: realtime.NodeSnapshotPayload{NodeIDs: ids},
	})
}

// Start runs the background heartbeat scanner, publishing node.offline events
// for nodes that have not sent a heartbeat within HeartbeatTimeout (90 s).
// The scanner runs every 30 s and stops when ctx is cancelled.
// Call this in a goroutine: go svc.Start(ctx).
func (s *Service) Start(ctx context.Context) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.scanOfflineNodes(ctx)
		}
	}
}

// scanOfflineNodes marks nodes whose last heartbeat exceeded HeartbeatTimeout
// as offline and broadcasts node.offline events. Errors are silently ignored
// (best-effort; the scanner will retry on the next tick).
func (s *Service) scanOfflineNodes(ctx context.Context) {
	nodes, err := s.repo.List(ctx)
	if err != nil {
		return
	}
	now := s.now()
	for _, n := range nodes {
		if n.Status == NodeStatusOnline && n.IsHeartbeatExpired(now) {
			_ = s.repo.UpdateStatus(ctx, n.ID, NodeStatusOffline)
			n.Status = NodeStatusOffline
			s.publishOffline(n)
		}
	}
}

func (s *Service) publishUpdated(n Node) {
	s.hub.Publish(realtime.Event{
		Name:        realtime.EventNodeUpdated,
		WorkspaceID: n.WorkspaceID,
		Payload: realtime.NodeUpdatedPayload{
			NodeID:      n.ID,
			Status:      string(n.Status),
			Hostname:    n.Hostname,
			WorkspaceID: n.WorkspaceID,
		},
	})
}

func (s *Service) publishOffline(n Node) {
	s.hub.Publish(realtime.Event{
		Name:        realtime.EventNodeOffline,
		WorkspaceID: n.WorkspaceID,
		Payload: realtime.NodeOfflinePayload{
			NodeID:      n.ID,
			Hostname:    n.Hostname,
			WorkspaceID: n.WorkspaceID,
		},
	})
}

// SetNowForTesting replaces the internal clock with a fixed time.
// For use in tests only; not safe for concurrent production use.
func (s *Service) SetNowForTesting(t time.Time) {
	s.now = func() time.Time { return t }
}

// ScanNowForTesting triggers an immediate offline sweep without waiting for
// the background ticker. For use in tests only.
func (s *Service) ScanNowForTesting(ctx context.Context) {
	s.scanOfflineNodes(ctx)
}
