// Package node provides the node registry domain model for tracking
// distributed execution environments (k8s pods, bare metal hosts).
package node

import (
	"errors"
	"strings"
	"time"
)

var (
	// ErrNotFound is returned when a node cannot be located by ID.
	ErrNotFound = errors.New("node: not found")
	// ErrInvalidID is returned when a node has a blank ID.
	ErrInvalidID = errors.New("node: id is required")
	// ErrInvalidHostname is returned when a node has a blank hostname.
	ErrInvalidHostname = errors.New("node: hostname is required")
	// ErrInvalidType is returned when NodeType is not a known value.
	ErrInvalidType = errors.New("node: type must be k8s_pod or bare_metal")
)

// NodeStatus represents the operational state of a node.
type NodeStatus string

const (
	NodeStatusOnline   NodeStatus = "online"
	NodeStatusOffline  NodeStatus = "offline"
	NodeStatusDegraded NodeStatus = "degraded"
)

// NodeType classifies the underlying infrastructure of a node.
type NodeType string

const (
	// NodeTypeK8sPod represents a Kubernetes pod.
	NodeTypeK8sPod NodeType = "k8s_pod"
	// NodeTypeBareMetal represents a physical or virtual machine host.
	NodeTypeBareMetal NodeType = "bare_metal"
)

// HeartbeatTimeout is the duration after which a node with no heartbeat
// is considered offline by the background scanner.
const HeartbeatTimeout = 90 * time.Second

// Node represents a registered execution environment that can host agent tasks.
type Node struct {
	ID       string
	Hostname string
	NodeType NodeType
	Status   NodeStatus
	Labels   map[string]string
	// WorkspaceID scopes this node to a workspace for event isolation.
	// Defaults to the server's default workspace when omitted at registration.
	WorkspaceID     string
	RegisteredAt    time.Time
	LastHeartbeatAt time.Time
}

// Validate returns a non-nil error when required fields are absent or invalid.
func (n Node) Validate() error {
	if strings.TrimSpace(n.ID) == "" {
		return ErrInvalidID
	}
	if strings.TrimSpace(n.Hostname) == "" {
		return ErrInvalidHostname
	}
	if n.NodeType != NodeTypeK8sPod && n.NodeType != NodeTypeBareMetal {
		return ErrInvalidType
	}
	return nil
}

// IsHeartbeatExpired reports whether the node's last heartbeat exceeds HeartbeatTimeout.
func (n Node) IsHeartbeatExpired(now time.Time) bool {
	return now.Sub(n.LastHeartbeatAt) > HeartbeatTimeout
}
