// Package settings provides user settings persistence (JSON file per member).
package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

var ErrNotFound = errors.New("settings: not found")

// UserSettings holds per-user preferences.
type UserSettings struct {
	MemberID             string                         `json:"memberId"`
	DisplayName          string                         `json:"displayName,omitempty"`
	Avatar               string                         `json:"avatar,omitempty"`
	Timezone             string                         `json:"timezone,omitempty"`
	BrowserNotifications bool                           `json:"browserNotifications"`
	SoundEnabled         bool                           `json:"soundEnabled"`
	DNDStart             string                         `json:"dndStart,omitempty"` // "HH:mm"
	DNDEnd               string                         `json:"dndEnd,omitempty"`
	Theme                string                         `json:"theme,omitempty"` // "light" | "dark"
	Locale               string                         `json:"locale,omitempty"`
	ProviderAuth         map[string]ProviderAuthSetting `json:"providerAuth,omitempty"`
}

// ProviderAuthSetting stores per-provider authentication metadata. APIKey is
// persisted server-side but omitted from normal GET responses by the HTTP layer.
type ProviderAuthSetting struct {
	Mode      string `json:"mode,omitempty"` // api_key | account | none
	Account   string `json:"account,omitempty"`
	APIKey    string `json:"apiKey,omitempty"`
	HasAPIKey bool   `json:"hasApiKey,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

// Service provides get/update for user settings.
type Service struct {
	mu      sync.RWMutex
	dataDir string
}

// NewService creates a settings Service that stores JSON files in dataDir.
func NewService(dataDir string) *Service {
	_ = os.MkdirAll(dataDir, 0o755)
	return &Service{dataDir: dataDir}
}

// Get loads settings for a member. Returns defaults if not found.
func (s *Service) Get(memberID string) (UserSettings, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	path := s.filePath(memberID)
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return UserSettings{MemberID: memberID, SoundEnabled: true, Timezone: "UTC"}, nil
		}
		return UserSettings{}, fmt.Errorf("settings read: %w", err)
	}
	var us UserSettings
	if err := json.Unmarshal(data, &us); err != nil {
		return UserSettings{}, fmt.Errorf("settings parse: %w", err)
	}
	us.MemberID = memberID
	return us, nil
}

// Update saves settings for a member.
func (s *Service) Update(memberID string, us UserSettings) (UserSettings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	us.MemberID = memberID
	data, err := json.MarshalIndent(us, "", "  ")
	if err != nil {
		return UserSettings{}, fmt.Errorf("settings marshal: %w", err)
	}
	path := s.filePath(memberID)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return UserSettings{}, fmt.Errorf("settings write: %w", err)
	}
	return us, nil
}

func (s *Service) filePath(memberID string) string {
	safe := filepath.Base(memberID)
	return filepath.Join(s.dataDir, safe+".json")
}
