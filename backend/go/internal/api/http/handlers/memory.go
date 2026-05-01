package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/internal/memory"
)

// errForbidden is returned when an actor attempts to access another actor's
// agent-scoped memory entry.
var errForbidden = errors.New("forbidden: actor does not own this memory entry")

// MemoryHandler handles HTTP requests for the distributed memory store API.
type MemoryHandler struct {
	svc        *memory.Service
	pathPrefix string // e.g. /api/v1/memory
}

// NewMemoryHandler creates a MemoryHandler backed by the given service.
func NewMemoryHandler(svc *memory.Service, pathPrefix string) *MemoryHandler {
	return &MemoryHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all memory-store requests under pathPrefix (e.g. /api/v1/memory).
// Supported routes:
//
//	PUT    {pathPrefix}/{scope}/{key}   — create or update an entry
//	GET    {pathPrefix}/{scope}/{key}   — retrieve a single entry
//	GET    {pathPrefix}/{scope}         — list all entries for a scope
//	DELETE {pathPrefix}/{scope}/{key}   — delete an entry
func (h *MemoryHandler) Handle(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	path = strings.Trim(path, "/")
	parts := []string{}
	if path != "" {
		parts = strings.Split(path, "/")
	}

	switch {
	case len(parts) == 1 && r.Method == http.MethodGet:
		// GET {pathPrefix}/{scope}
		h.handleList(w, r, parts[0])
	case len(parts) == 2 && r.Method == http.MethodPut:
		// PUT {pathPrefix}/{scope}/{key}
		h.handlePut(w, r, parts[0], parts[1])
	case len(parts) == 2 && r.Method == http.MethodGet:
		// GET {pathPrefix}/{scope}/{key}
		h.handleGet(w, r, parts[0], parts[1])
	case len(parts) == 2 && r.Method == http.MethodDelete:
		// DELETE {pathPrefix}/{scope}/{key}
		h.handleDelete(w, r, parts[0], parts[1])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

// actorID extracts the caller identity from the X-Kraken-Actor-Id header.
// Returns "anonymous" when the header is absent.
func actorID(r *http.Request) string {
	if id := strings.TrimSpace(r.Header.Get("X-Kraken-Actor-Id")); id != "" {
		return id
	}
	return "anonymous"
}

func (h *MemoryHandler) handlePut(w http.ResponseWriter, r *http.Request, scopeStr, key string) {
	var body struct {
		Value      string `json:"value"`
		NodeID     string `json:"nodeId"`
		TTLSeconds int64  `json:"ttlSeconds"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	scope := memory.Scope(scopeStr)
	actor := actorID(r)

	// For agent scope, ownerId is forced to the caller's actor ID to prevent
	// cross-agent writes. Team and global entries remain shared by key.
	ownerID := ""
	if scope == memory.ScopeAgent {
		ownerID = actor
	}
	e := memory.MemoryEntry{
		Key:     key,
		Value:   body.Value,
		Scope:   scope,
		OwnerID: ownerID,
		NodeID:  body.NodeID,
		TTL:     time.Duration(body.TTLSeconds) * time.Second,
	}
	stored, err := h.svc.Put(r.Context(), e)
	if err != nil {
		writeMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMemoryResponse(stored))
}

func (h *MemoryHandler) handleGet(w http.ResponseWriter, r *http.Request, scopeStr, key string) {
	scope := memory.Scope(scopeStr)
	ownerID, ok := h.memoryOwner(w, r, scope)
	if !ok {
		return
	}
	e, err := h.svc.Get(r.Context(), scope, ownerID, key)
	if err != nil {
		writeMemoryError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, toMemoryResponse(e))
}

func (h *MemoryHandler) handleList(w http.ResponseWriter, r *http.Request, scopeStr string) {
	scope := memory.Scope(scopeStr)
	ownerID, ok := h.memoryOwner(w, r, scope)
	if !ok {
		return
	}
	entries, err := h.svc.List(r.Context(), scope, ownerID)
	if err != nil {
		writeMemoryError(w, err)
		return
	}
	items := make([]map[string]any, 0, len(entries))
	for _, e := range entries {
		items = append(items, toMemoryResponse(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *MemoryHandler) handleDelete(w http.ResponseWriter, r *http.Request, scopeStr, key string) {
	scope := memory.Scope(scopeStr)
	ownerID, ok := h.memoryOwner(w, r, scope)
	if !ok {
		return
	}
	if err := h.svc.Delete(r.Context(), scope, ownerID, key); err != nil {
		writeMemoryError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *MemoryHandler) memoryOwner(w http.ResponseWriter, r *http.Request, scope memory.Scope) (string, bool) {
	if scope != memory.ScopeAgent {
		return "", true
	}
	ownerID := actorID(r)
	if requestedOwner := strings.TrimSpace(r.URL.Query().Get("ownerId")); requestedOwner != "" && requestedOwner != ownerID {
		writeError(w, http.StatusForbidden, errForbidden)
		return "", false
	}
	return ownerID, true
}

func toMemoryResponse(e memory.MemoryEntry) map[string]any {
	resp := map[string]any{
		"id":        e.ID,
		"key":       e.Key,
		"value":     e.Value,
		"scope":     string(e.Scope),
		"ownerId":   e.OwnerID,
		"nodeId":    e.NodeID,
		"createdAt": e.CreatedAt.Format(time.RFC3339),
		"updatedAt": e.UpdatedAt.Format(time.RFC3339),
	}
	if e.TTL > 0 {
		resp["ttlSeconds"] = int64(e.TTL.Seconds())
	}
	return resp
}

func writeMemoryError(w http.ResponseWriter, err error) {
	switch {
	case isNotFound(err):
		writeError(w, http.StatusNotFound, err)
	case isInvalidInput(err):
		writeError(w, http.StatusBadRequest, err)
	default:
		writeError(w, http.StatusInternalServerError, err)
	}
}

func isInvalidInput(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return strings.Contains(msg, "scope must be") ||
		strings.Contains(msg, "key is required") ||
		strings.Contains(msg, "invalid")
}
