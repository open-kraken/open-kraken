package roster

import "time"

// Document is the canonical team/member roster payload. Local development can
// persist it as <workspaceRoot>/.open-kraken/roster.json; clustered deployments
// persist the same payload in PostgreSQL via workspace_rosters.
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
