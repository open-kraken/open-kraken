package node

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"open-kraken/backend/go/internal/realtime"
)

// inMemoryRepo is a thread-safe in-memory NodeRepository for tests.
type inMemoryRepo struct {
	mu    sync.RWMutex
	nodes map[string]Node
}

func newInMemoryRepo() *inMemoryRepo {
	return &inMemoryRepo{nodes: make(map[string]Node)}
}

func (r *inMemoryRepo) Save(_ context.Context, n Node) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.nodes[n.ID] = n
	return nil
}

func (r *inMemoryRepo) FindByID(_ context.Context, id string) (Node, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	n, ok := r.nodes[id]
	if !ok {
		return Node{}, ErrNotFound
	}
	return n, nil
}

func (r *inMemoryRepo) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.nodes[id]; !ok {
		return ErrNotFound
	}
	delete(r.nodes, id)
	return nil
}

func (r *inMemoryRepo) List(_ context.Context) ([]Node, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]Node, 0, len(r.nodes))
	for _, n := range r.nodes {
		out = append(out, n)
	}
	return out, nil
}

func (r *inMemoryRepo) UpdateStatus(_ context.Context, id string, status NodeStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	n, ok := r.nodes[id]
	if !ok {
		return ErrNotFound
	}
	n.Status = status
	r.nodes[id] = n
	return nil
}

func (r *inMemoryRepo) UpdateHeartbeat(_ context.Context, id string, at time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	n, ok := r.nodes[id]
	if !ok {
		return ErrNotFound
	}
	n.LastHeartbeatAt = at
	n.Status = NodeStatusOnline
	r.nodes[id] = n
	return nil
}

func newTestService(repo NodeRepository) *Service {
	hub := realtime.NewHub(32)
	return NewService(repo, hub)
}

func TestServiceRegister(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-1", Hostname: "host-1", NodeType: NodeTypeBareMetal}
	got, err := svc.Register(ctx, n)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Status != NodeStatusOnline {
		t.Errorf("expected status online, got %s", got.Status)
	}
	if got.RegisteredAt.IsZero() {
		t.Error("expected RegisteredAt to be set")
	}

	// Verify it's persisted.
	stored, err := repo.FindByID(ctx, "node-1")
	if err != nil {
		t.Fatalf("find after register: %v", err)
	}
	if stored.Hostname != "host-1" {
		t.Errorf("expected hostname host-1, got %s", stored.Hostname)
	}
}

func TestJSONRepositoryPersistsWorkspaceID(t *testing.T) {
	ctx := context.Background()
	repo := NewJSONRepository(t.TempDir())

	original := Node{
		ID:          "node-ws",
		Hostname:    "host-ws",
		NodeType:    NodeTypeK8sPod,
		Status:      NodeStatusOnline,
		WorkspaceID: "ws-custom",
	}
	if err := repo.Save(ctx, original); err != nil {
		t.Fatalf("save: %v", err)
	}
	got, err := repo.FindByID(ctx, original.ID)
	if err != nil {
		t.Fatalf("find: %v", err)
	}
	if got.WorkspaceID != "ws-custom" {
		t.Fatalf("expected workspace ID to round-trip, got %q", got.WorkspaceID)
	}
}

func TestServiceRegisterValidation(t *testing.T) {
	tests := []struct {
		name    string
		node    Node
		wantErr error
	}{
		{
			name:    "missing id",
			node:    Node{Hostname: "h", NodeType: NodeTypeK8sPod},
			wantErr: ErrInvalidID,
		},
		{
			name:    "missing hostname",
			node:    Node{ID: "n1", NodeType: NodeTypeK8sPod},
			wantErr: ErrInvalidHostname,
		},
		{
			name:    "invalid type",
			node:    Node{ID: "n1", Hostname: "h", NodeType: "unknown"},
			wantErr: ErrInvalidType,
		},
	}
	svc := newTestService(newInMemoryRepo())
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := svc.Register(context.Background(), tc.node)
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("expected %v, got %v", tc.wantErr, err)
			}
		})
	}
}

func TestServiceDeregister(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-2", Hostname: "host-2", NodeType: NodeTypeK8sPod}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}

	if err := svc.Deregister(ctx, "node-2"); err != nil {
		t.Fatalf("deregister: %v", err)
	}

	if _, err := repo.FindByID(ctx, "node-2"); !errors.Is(err, ErrNotFound) {
		t.Error("expected ErrNotFound after deregister")
	}
}

func TestServiceDeregisterNotFound(t *testing.T) {
	svc := newTestService(newInMemoryRepo())
	err := svc.Deregister(context.Background(), "missing")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceHeartbeat(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-3", Hostname: "host-3", NodeType: NodeTypeBareMetal}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}

	// Advance time and trigger heartbeat.
	before := time.Now().Add(time.Minute)
	svc.now = func() time.Time { return before }

	got, err := svc.Heartbeat(ctx, "node-3")
	if err != nil {
		t.Fatalf("heartbeat: %v", err)
	}
	if got.Status != NodeStatusOnline {
		t.Errorf("expected online after heartbeat, got %s", got.Status)
	}
}

func TestServiceHeartbeatNotFound(t *testing.T) {
	svc := newTestService(newInMemoryRepo())
	_, err := svc.Heartbeat(context.Background(), "ghost")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceAssignAgent(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-4", Hostname: "host-4", NodeType: NodeTypeK8sPod}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}

	got, err := svc.AssignAgent(ctx, "node-4", "agent-99")
	if err != nil {
		t.Fatalf("assign agent: %v", err)
	}
	if got.Labels["agent_id"] != "agent-99" {
		t.Errorf("expected agent_id=agent-99, got %q", got.Labels["agent_id"])
	}
}

func TestServiceAssignAgentEnforcesCapacity(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-cap", Hostname: "host-cap", NodeType: NodeTypeK8sPod, MaxAgents: 1}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-cap", "agent-1"); err != nil {
		t.Fatalf("assign first: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-cap", "agent-2"); !errors.Is(err, ErrMaxAgentsReached) {
		t.Fatalf("expected ErrMaxAgentsReached, got %v", err)
	}
}

func TestServiceAssignAgentRejectsDuplicateNodeAssignment(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	if _, err := svc.Register(ctx, Node{ID: "node-a", Hostname: "host-a", NodeType: NodeTypeK8sPod}); err != nil {
		t.Fatalf("register node-a: %v", err)
	}
	if _, err := svc.Register(ctx, Node{ID: "node-b", Hostname: "host-b", NodeType: NodeTypeK8sPod}); err != nil {
		t.Fatalf("register node-b: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-a", "agent-1"); err != nil {
		t.Fatalf("assign node-a: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-b", "agent-1"); !errors.Is(err, ErrAgentAlreadyAssigned) {
		t.Fatalf("expected ErrAgentAlreadyAssigned, got %v", err)
	}
}

func TestServiceAutoAssignAgentUsesLeastLoadedOnlineNode(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	if _, err := svc.Register(ctx, Node{ID: "node-a", Hostname: "host-a", NodeType: NodeTypeK8sPod, MaxAgents: 3}); err != nil {
		t.Fatalf("register node-a: %v", err)
	}
	if _, err := svc.Register(ctx, Node{ID: "node-b", Hostname: "host-b", NodeType: NodeTypeK8sPod, MaxAgents: 3}); err != nil {
		t.Fatalf("register node-b: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-a", "existing-agent"); err != nil {
		t.Fatalf("seed assignment: %v", err)
	}

	got, err := svc.AutoAssignAgent(ctx, "new-agent")
	if err != nil {
		t.Fatalf("auto assign: %v", err)
	}
	if got.ID != "node-b" {
		t.Fatalf("expected least-loaded node-b, got %s", got.ID)
	}
}

func TestServiceScanOfflineNodesMigratesAgents(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)
	now := time.Now()
	svc.now = func() time.Time { return now }

	if _, err := svc.Register(ctx, Node{ID: "node-a", Hostname: "host-a", NodeType: NodeTypeK8sPod, MaxAgents: 2}); err != nil {
		t.Fatalf("register node-a: %v", err)
	}
	if _, err := svc.Register(ctx, Node{ID: "node-b", Hostname: "host-b", NodeType: NodeTypeK8sPod, MaxAgents: 2}); err != nil {
		t.Fatalf("register node-b: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-a", "agent-1"); err != nil {
		t.Fatalf("assign: %v", err)
	}
	placements := map[string]string{}
	svc.SetAgentPlacementObserver(func(agentID string, n Node) {
		placements[agentID] = n.ID
	})

	svc.now = func() time.Time { return now.Add(HeartbeatTimeout + time.Second) }
	if _, err := svc.Heartbeat(ctx, "node-b"); err != nil {
		t.Fatalf("heartbeat node-b: %v", err)
	}
	svc.scanOfflineNodes(ctx)

	source, err := repo.FindByID(ctx, "node-a")
	if err != nil {
		t.Fatalf("find source: %v", err)
	}
	target, err := repo.FindByID(ctx, "node-b")
	if err != nil {
		t.Fatalf("find target: %v", err)
	}
	if source.Status != NodeStatusOffline {
		t.Fatalf("expected source offline, got %s", source.Status)
	}
	if source.HasAgent("agent-1") {
		t.Fatalf("agent remained on offline source: %+v", source.Agents)
	}
	if !target.HasAgent("agent-1") {
		t.Fatalf("agent did not migrate to target: %+v", target.Agents)
	}
	if placements["agent-1"] != "node-b" {
		t.Fatalf("placement observer was not called for migration: %+v", placements)
	}
}

func TestServiceRemoveAgent(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	n := Node{ID: "node-5", Hostname: "host-5", NodeType: NodeTypeK8sPod}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}
	if _, err := svc.AssignAgent(ctx, "node-5", "agent-42"); err != nil {
		t.Fatalf("assign: %v", err)
	}

	got, err := svc.RemoveAgent(ctx, "node-5", "agent-42")
	if err != nil {
		t.Fatalf("remove agent: %v", err)
	}
	for _, v := range got.Labels {
		if v == "agent-42" {
			t.Errorf("expected agent-42 to be removed from labels, still present")
		}
	}
}

func TestServiceRemoveAgentNotFound(t *testing.T) {
	svc := newTestService(newInMemoryRepo())
	_, err := svc.RemoveAgent(context.Background(), "missing-node", "agent-x")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceRemoveAgentNotAssigned(t *testing.T) {
	ctx := context.Background()
	svc := newTestService(newInMemoryRepo())
	if _, err := svc.Register(ctx, Node{ID: "node-empty", Hostname: "host-empty", NodeType: NodeTypeK8sPod}); err != nil {
		t.Fatalf("register: %v", err)
	}
	_, err := svc.RemoveAgent(ctx, "node-empty", "agent-x")
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound, got %v", err)
	}
}

func TestServiceScanOfflineNodes(t *testing.T) {
	ctx := context.Background()
	repo := newInMemoryRepo()
	svc := newTestService(repo)

	// Register a node, then pretend 2 minutes have passed.
	n := Node{ID: "stale-node", Hostname: "host-stale", NodeType: NodeTypeBareMetal}
	if _, err := svc.Register(ctx, n); err != nil {
		t.Fatalf("register: %v", err)
	}

	// Advance clock past heartbeat timeout.
	svc.now = func() time.Time { return time.Now().Add(2 * HeartbeatTimeout) }
	svc.scanOfflineNodes(ctx)

	stored, err := repo.FindByID(ctx, "stale-node")
	if err != nil {
		t.Fatalf("find after scan: %v", err)
	}
	if stored.Status != NodeStatusOffline {
		t.Errorf("expected offline after scan, got %s", stored.Status)
	}
}
