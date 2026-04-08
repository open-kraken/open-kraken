package roster

import "time"

// Document is persisted at <workspaceRoot>/.open-kraken/roster.json
type Document struct {
	Meta    Meta             `json:"meta"`
	Members []map[string]any `json:"members"`
	Teams   []Team           `json:"teams"`
}

type Meta struct {
	WorkspaceID string    `json:"workspaceId"`
	Version     int64     `json:"version"`
	UpdatedAt   time.Time `json:"updatedAt"`
	Storage     string    `json:"storage"`
}

// Team references members by id; member rows live in Members.
type Team struct {
	TeamID    string   `json:"teamId"`
	Name      string   `json:"name"`
	MemberIDs []string `json:"memberIds"`
}
