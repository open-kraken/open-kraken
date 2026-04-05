package http

import "strings"

// JoinAPI joins the configured API base path (e.g. /api/v1) with a relative path
// segment such as "nodes", "terminal/sessions", or "tokens/events".
func JoinAPI(apiBasePath, rel string) string {
	base := strings.TrimRight(apiBasePath, "/")
	rel = strings.Trim(rel, "/")
	if rel == "" {
		return base
	}
	return base + "/" + rel
}
