// Package plugin provides a plugin catalog and install/remove lifecycle.
package plugin

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

var (
	ErrNotFound      = errors.New("plugin: not found")
	ErrAlreadyExists = errors.New("plugin: already installed")
)

// Category classifies plugins.
type Category string

const (
	CategoryProductivity   Category = "productivity"
	CategoryDevelopment    Category = "development"
	CategoryDesign         Category = "design"
	CategoryCommunication  Category = "communication"
	CategoryObservability  Category = "observability"
)

// Plugin represents a catalog entry.
type Plugin struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Category    Category `json:"category"`
	Version     string   `json:"version"`
	Rating      string   `json:"rating"`
	Icon        string   `json:"icon"`
	Installed   bool     `json:"installed"`
	InstalledAt *time.Time `json:"installedAt,omitempty"`
}

// Service provides plugin catalog and lifecycle operations.
type Service struct {
	mu        sync.RWMutex
	catalog   []Plugin
	installed map[string]Plugin
	now       func() time.Time
}

// NewService creates a plugin Service with a built-in catalog.
func NewService() *Service {
	return &Service{
		catalog:   defaultCatalog(),
		installed: make(map[string]Plugin),
		now:       time.Now,
	}
}

// ListAvailable returns all plugins from the catalog.
func (s *Service) ListAvailable(_ context.Context) []Plugin {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Plugin, len(s.catalog))
	for i, p := range s.catalog {
		out[i] = p
		if _, ok := s.installed[p.ID]; ok {
			out[i].Installed = true
		}
	}
	return out
}

// ListInstalled returns only installed plugins.
func (s *Service) ListInstalled(_ context.Context) []Plugin {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Plugin, 0, len(s.installed))
	for _, p := range s.installed {
		out = append(out, p)
	}
	return out
}

// Install marks a plugin as installed.
func (s *Service) Install(_ context.Context, pluginID string) (Plugin, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.installed[pluginID]; ok {
		return Plugin{}, ErrAlreadyExists
	}
	for _, p := range s.catalog {
		if p.ID == pluginID {
			now := s.now()
			p.Installed = true
			p.InstalledAt = &now
			s.installed[pluginID] = p
			return p, nil
		}
	}
	return Plugin{}, ErrNotFound
}

// Remove uninstalls a plugin.
func (s *Service) Remove(_ context.Context, pluginID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.installed[pluginID]; !ok {
		return ErrNotFound
	}
	delete(s.installed, pluginID)
	return nil
}

// Get returns a single plugin by ID.
func (s *Service) Get(_ context.Context, pluginID string) (Plugin, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, p := range s.catalog {
		if p.ID == pluginID {
			if inst, ok := s.installed[p.ID]; ok {
				return inst, nil
			}
			return p, nil
		}
	}
	return Plugin{}, ErrNotFound
}

func defaultCatalog() []Plugin {
	return []Plugin{
		{ID: "plugin-code-review", Name: "Code Review Assistant", Description: "AI-powered code review suggestions", Category: CategoryDevelopment, Version: "1.2.0", Rating: "4.8", Icon: "CR"},
		{ID: "plugin-test-gen", Name: "Test Generator", Description: "Auto-generate test cases from code", Category: CategoryDevelopment, Version: "1.0.3", Rating: "4.5", Icon: "TG"},
		{ID: "plugin-doc-writer", Name: "Doc Writer", Description: "Generate documentation from code comments", Category: CategoryProductivity, Version: "2.1.0", Rating: "4.6", Icon: "DW"},
		{ID: "plugin-perf-monitor", Name: "Performance Monitor", Description: "Real-time performance metrics and alerts", Category: CategoryObservability, Version: "1.4.2", Rating: "4.7", Icon: "PM"},
		{ID: "plugin-diagram-gen", Name: "Diagram Generator", Description: "Create architecture diagrams from code", Category: CategoryDesign, Version: "1.1.0", Rating: "4.3", Icon: "DG"},
		{ID: "plugin-slack-bridge", Name: "Slack Bridge", Description: "Forward terminal output to Slack channels", Category: CategoryCommunication, Version: "1.0.1", Rating: "4.2", Icon: "SB"},
	}
}

func defaultIDGen() string {
	return fmt.Sprintf("plug_%d", time.Now().UnixNano())
}
