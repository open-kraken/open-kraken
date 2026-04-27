package node

import (
	"context"
	"fmt"
	"sort"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// Service manages the node registry lifecycle: registration, heartbeat, offline
// detection, and real-time event broadcast via the realtime Hub.
type Service struct {
	repo          NodeRepository
	hub           *realtime.Hub
	onAgentPlaced func(agentID string, n Node)
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

// SetAgentPlacementObserver registers a callback invoked whenever an agent is
// placed or moved to a node. It lets the AgentInstance layer keep placement
// context current without making node depend on runtime/instance.
func (s *Service) SetAgentPlacementObserver(fn func(agentID string, n Node)) {
	s.onAgentPlaced = fn
}

// Register persists a new node record and broadcasts a node.updated event.
// The node status is forced to online, and timestamps are set to now.
// Returns ErrHostnameConflict if another node with the same hostname exists.
func (s *Service) Register(ctx context.Context, n Node) (Node, error) {
	if err := n.Validate(); err != nil {
		return Node{}, err
	}

	// Hostname uniqueness check: reject if another node ID holds this hostname.
	existing, err := s.repo.List(ctx)
	if err != nil {
		return Node{}, fmt.Errorf("node register: %w", err)
	}
	for _, e := range existing {
		if e.Hostname == n.Hostname && e.ID != n.ID {
			return Node{}, ErrHostnameConflict
		}
	}

	now := s.now()
	n.Status = NodeStatusOnline
	n.RegisteredAt = now
	n.LastHeartbeatAt = now
	if n.Agents == nil {
		n.Agents = []string{}
	}
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

// AssignAgent assigns an agent to a node and broadcasts node.updated.
// Returns ErrMaxAgentsReached if the node is at capacity.
// The assignment is idempotent: re-assigning the same agent is a no-op.
func (s *Service) AssignAgent(ctx context.Context, nodeID, agentID string) (Node, error) {
	if agentID == "" {
		return Node{}, ErrInvalidAgentID
	}
	n, err := s.repo.FindByID(ctx, nodeID)
	if err != nil {
		return Node{}, fmt.Errorf("node assign agent: %w", err)
	}

	// Idempotent: already assigned.
	if n.HasAgent(agentID) {
		return n, nil
	}

	existing, err := s.repo.List(ctx)
	if err != nil {
		return Node{}, fmt.Errorf("node assign agent: %w", err)
	}
	for _, other := range existing {
		if other.ID != nodeID && other.HasAgent(agentID) {
			return Node{}, ErrAgentAlreadyAssigned
		}
	}

	// Enforce capacity.
	if !n.CanAcceptAgent() {
		return Node{}, ErrMaxAgentsReached
	}

	n.Agents = append(n.Agents, agentID)
	// Also keep the legacy label for backwards compat.
	if n.Labels == nil {
		n.Labels = make(map[string]string)
	}
	n.Labels["agent_id"] = agentID

	if err := s.repo.Save(ctx, n); err != nil {
		return Node{}, fmt.Errorf("node assign agent: %w", err)
	}
	s.publishUpdated(n)
	s.publishAgentPlaced(agentID, n)
	return n, nil
}

// AutoAssignAgent places an agent on the least-loaded online node that has
// capacity. If the agent is already placed, the current node is returned.
func (s *Service) AutoAssignAgent(ctx context.Context, agentID string) (Node, error) {
	if agentID == "" {
		return Node{}, ErrInvalidAgentID
	}
	nodes, err := s.repo.List(ctx)
	if err != nil {
		return Node{}, fmt.Errorf("node auto assign agent: %w", err)
	}
	for _, n := range nodes {
		if n.HasAgent(agentID) {
			return n, nil
		}
	}
	target, ok := selectPlacementTarget(nodes, "")
	if !ok {
		return Node{}, ErrNoAvailableNode
	}
	return s.AssignAgent(ctx, target.ID, agentID)
}

// RemoveAgent removes the agent assignment for the given agentID from a node.
// Returns ErrNotFound when the node does not exist.
func (s *Service) RemoveAgent(ctx context.Context, nodeID, agentID string) (Node, error) {
	if agentID == "" {
		return Node{}, ErrInvalidAgentID
	}
	n, err := s.repo.FindByID(ctx, nodeID)
	if err != nil {
		return Node{}, fmt.Errorf("node remove agent: %w", err)
	}
	if !n.HasAgent(agentID) {
		return Node{}, ErrNotFound
	}
	// Remove from agents list.
	filtered := make([]string, 0, len(n.Agents))
	for _, id := range n.Agents {
		if id != agentID {
			filtered = append(filtered, id)
		}
	}
	n.Agents = filtered
	// Remove any label whose value matches agentID to keep the store consistent.
	for k, v := range n.Labels {
		if v == agentID {
			delete(n.Labels, k)
		}
	}
	if len(n.Agents) > 0 {
		if n.Labels == nil {
			n.Labels = make(map[string]string)
		}
		n.Labels["agent_id"] = n.Agents[len(n.Agents)-1]
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
			n.Status = NodeStatusOffline
			s.migrateAgentsFromOfflineNode(ctx, n)
		}
	}
}

func (s *Service) migrateAgentsFromOfflineNode(ctx context.Context, source Node) {
	agents := append([]string(nil), source.Agents...)
	source.Agents = []string{}
	if source.Labels != nil {
		delete(source.Labels, "agent_id")
	}

	nodes, err := s.repo.List(ctx)
	if err != nil {
		source.Agents = agents
		_ = s.repo.Save(ctx, source)
		s.publishOffline(source)
		return
	}
	for i := range nodes {
		if nodes[i].ID == source.ID {
			nodes[i] = source
			break
		}
	}

	unplaced := make([]string, 0)
	for _, agentID := range agents {
		target, ok := selectPlacementTarget(nodes, source.ID)
		if !ok {
			unplaced = append(unplaced, agentID)
			continue
		}
		for i := range nodes {
			if nodes[i].ID != target.ID {
				continue
			}
			nodes[i].Agents = append(nodes[i].Agents, agentID)
			if nodes[i].Labels == nil {
				nodes[i].Labels = make(map[string]string)
			}
			nodes[i].Labels["agent_id"] = agentID
			_ = s.repo.Save(ctx, nodes[i])
			s.publishUpdated(nodes[i])
			s.publishAgentPlaced(agentID, nodes[i])
			break
		}
	}

	source.Agents = unplaced
	if len(unplaced) > 0 {
		if source.Labels == nil {
			source.Labels = make(map[string]string)
		}
		source.Labels["agent_id"] = unplaced[len(unplaced)-1]
	}
	_ = s.repo.Save(ctx, source)
	s.publishOffline(source)
}

func selectPlacementTarget(nodes []Node, excludeNodeID string) (Node, bool) {
	candidates := make([]Node, 0, len(nodes))
	for _, n := range nodes {
		if n.ID == excludeNodeID || n.Status != NodeStatusOnline || !n.CanAcceptAgent() {
			continue
		}
		candidates = append(candidates, n)
	}
	if len(candidates) == 0 {
		return Node{}, false
	}
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].AgentCount() == candidates[j].AgentCount() {
			return candidates[i].ID < candidates[j].ID
		}
		return candidates[i].AgentCount() < candidates[j].AgentCount()
	})
	return candidates[0], true
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

func (s *Service) publishAgentPlaced(agentID string, n Node) {
	if s.onAgentPlaced != nil {
		s.onAgentPlaced(agentID, n)
	}
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
