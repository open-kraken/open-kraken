package node

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// NodeRepository defines the persistence contract for Node records.
type NodeRepository interface {
	// Save inserts or replaces the node record identified by n.ID.
	Save(ctx context.Context, n Node) error
	// FindByID returns the node with the given id, or ErrNotFound.
	FindByID(ctx context.Context, id string) (Node, error)
	// Delete removes the node record, returning ErrNotFound if absent.
	Delete(ctx context.Context, id string) error
	// List returns all persisted nodes in no guaranteed order.
	List(ctx context.Context) ([]Node, error)
	// UpdateStatus sets the Status field for the given id.
	UpdateStatus(ctx context.Context, id string, status NodeStatus) error
	// UpdateHeartbeat records a new heartbeat timestamp and sets Status to online.
	UpdateHeartbeat(ctx context.Context, id string, at time.Time) error
}

// nodeRecord is the on-disk (JSON) representation of a Node.
type nodeRecord struct {
	ID              string            `json:"id"`
	Hostname        string            `json:"hostname"`
	NodeType        NodeType          `json:"nodeType"`
	Status          NodeStatus        `json:"status"`
	Labels          map[string]string `json:"labels,omitempty"`
	WorkspaceID     string            `json:"workspaceId,omitempty"`
	MaxAgents       int               `json:"maxAgents,omitempty"`
	Agents          []string          `json:"agents,omitempty"`
	RegisteredAt    time.Time         `json:"registeredAt"`
	LastHeartbeatAt time.Time         `json:"lastHeartbeatAt"`
}

// jsonStore is a JSON-file-backed NodeRepository.
// All writes are guarded by a mutex to prevent concurrent file corruption.
type jsonStore struct {
	mu      sync.RWMutex
	dataDir string
}

// NewJSONRepository creates a NodeRepository that persists nodes as a single
// JSON file inside dataDir. The directory is created on first write.
func NewJSONRepository(dataDir string) NodeRepository {
	return &jsonStore{dataDir: dataDir}
}

func (s *jsonStore) Save(_ context.Context, n Node) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	all[n.ID] = toRecord(n)
	return s.saveLocked(all)
}

func (s *jsonStore) FindByID(_ context.Context, id string) (Node, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all, err := s.loadLocked()
	if err != nil {
		return Node{}, err
	}
	rec, ok := all[id]
	if !ok {
		return Node{}, ErrNotFound
	}
	return toNode(rec), nil
}

func (s *jsonStore) Delete(_ context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	if _, ok := all[id]; !ok {
		return ErrNotFound
	}
	delete(all, id)
	return s.saveLocked(all)
}

func (s *jsonStore) List(_ context.Context) ([]Node, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	all, err := s.loadLocked()
	if err != nil {
		return nil, err
	}
	nodes := make([]Node, 0, len(all))
	for _, rec := range all {
		nodes = append(nodes, toNode(rec))
	}
	return nodes, nil
}

func (s *jsonStore) UpdateStatus(_ context.Context, id string, status NodeStatus) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	rec, ok := all[id]
	if !ok {
		return ErrNotFound
	}
	rec.Status = status
	all[id] = rec
	return s.saveLocked(all)
}

func (s *jsonStore) UpdateHeartbeat(_ context.Context, id string, at time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	all, err := s.loadLocked()
	if err != nil {
		return err
	}
	rec, ok := all[id]
	if !ok {
		return ErrNotFound
	}
	rec.LastHeartbeatAt = at
	rec.Status = NodeStatusOnline
	all[id] = rec
	return s.saveLocked(all)
}

func (s *jsonStore) filePath() string {
	return filepath.Join(s.dataDir, "nodes.json")
}

// loadLocked reads the node map from disk. Caller must hold at least a read lock.
// Returns an empty map when the file does not yet exist.
func (s *jsonStore) loadLocked() (map[string]nodeRecord, error) {
	data, err := os.ReadFile(s.filePath())
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return make(map[string]nodeRecord), nil
		}
		return nil, err
	}
	var records map[string]nodeRecord
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, err
	}
	if records == nil {
		records = make(map[string]nodeRecord)
	}
	return records, nil
}

// saveLocked writes the node map to disk. Caller must hold a write lock.
func (s *jsonStore) saveLocked(records map[string]nodeRecord) error {
	if err := os.MkdirAll(s.dataDir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath(), append(data, '\n'), 0o644)
}

func toRecord(n Node) nodeRecord {
	return nodeRecord{
		ID:              n.ID,
		Hostname:        n.Hostname,
		NodeType:        n.NodeType,
		Status:          n.Status,
		Labels:          n.Labels,
		WorkspaceID:     n.WorkspaceID,
		MaxAgents:       n.MaxAgents,
		Agents:          n.Agents,
		RegisteredAt:    n.RegisteredAt,
		LastHeartbeatAt: n.LastHeartbeatAt,
	}
}

func toNode(r nodeRecord) Node {
	return Node{
		ID:              r.ID,
		Hostname:        r.Hostname,
		NodeType:        r.NodeType,
		Status:          r.Status,
		Labels:          r.Labels,
		WorkspaceID:     r.WorkspaceID,
		MaxAgents:       r.MaxAgents,
		Agents:          r.Agents,
		RegisteredAt:    r.RegisteredAt,
		LastHeartbeatAt: r.LastHeartbeatAt,
	}
}
