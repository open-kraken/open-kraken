package session

import (
	"fmt"
	"sync"
)

// Registry keeps session IDs stable across attaches. It never rejects repeated
// attaches because subscriber identity is tracked inside Actor.Attach.
type Registry struct {
	mu             sync.RWMutex
	sessions       map[string]*Actor
	memberSessions map[string]string
}

func NewRegistry() *Registry {
	return &Registry{
		sessions:       make(map[string]*Actor),
		memberSessions: make(map[string]string),
	}
}

func (r *Registry) Add(actor *Actor) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.sessions[actor.ID()]; exists {
		return fmt.Errorf("session already exists: %s", actor.ID())
	}
	r.sessions[actor.ID()] = actor
	if actor.MemberID() != "" && actor.WorkspaceID() != "" {
		r.memberSessions[memberKey(actor.WorkspaceID(), actor.MemberID())] = actor.ID()
	}
	return nil
}

func (r *Registry) Get(sessionID string) (*Actor, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	actor, ok := r.sessions[sessionID]
	return actor, ok
}

func (r *Registry) List(workspaceID string) []SessionInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]SessionInfo, 0, len(r.sessions))
	for _, actor := range r.sessions {
		info := actor.Info()
		if workspaceID != "" && info.WorkspaceID != workspaceID {
			continue
		}
		out = append(out, info)
	}
	return out
}

func (r *Registry) ResolveMemberSession(workspaceID, memberID string) (string, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	id, ok := r.memberSessions[memberKey(workspaceID, memberID)]
	return id, ok
}

// IntelligentActors returns all actors that have intelligence enabled.
func (r *Registry) IntelligentActors() []*Actor {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Actor, 0, len(r.sessions))
	for _, actor := range r.sessions {
		if actor.HasIntelligence() {
			out = append(out, actor)
		}
	}
	return out
}

func memberKey(workspaceID, memberID string) string {
	return workspaceID + ":" + memberID
}
