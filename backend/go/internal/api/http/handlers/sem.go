package handlers

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"open-kraken/backend/go/contracts"
	"open-kraken/backend/go/internal/ael"
)

// SEMHandler handles HTTP requests for Shared Execution Memory records
// under /api/v2/sem.
type SEMHandler struct {
	svc        *ael.Service
	pathPrefix string // e.g. /api/v2/sem
}

// NewSEMHandler creates a SEMHandler.
func NewSEMHandler(svc *ael.Service, pathPrefix string) *SEMHandler {
	return &SEMHandler{svc: svc, pathPrefix: pathPrefix}
}

// Handle routes all requests under pathPrefix.
func (h *SEMHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if h.svc == nil {
		writeError(w, http.StatusServiceUnavailable, fmt.Errorf("AEL not configured"))
		return
	}

	suffix := strings.TrimPrefix(r.URL.Path, h.pathPrefix)
	suffix = strings.Trim(suffix, "/")
	var parts []string
	if suffix != "" {
		parts = strings.Split(suffix, "/")
	}

	switch {
	case len(parts) == 0 && r.Method == http.MethodGet:
		h.handleList(w, r)
	case len(parts) == 0 && r.Method == http.MethodPost:
		h.handleCreate(w, r)
	case len(parts) == 1 && r.Method == http.MethodGet:
		h.handleGetByID(w, r, parts[0])
	default:
		w.WriteHeader(http.StatusNotFound)
	}
}

func (h *SEMHandler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Type       string  `json:"type"`
		Scope      string  `json:"scope"`
		HiveID     string  `json:"hive_id"`
		RunID      string  `json:"run_id"`
		Key        string  `json:"key"`
		Content    string  `json:"content"` // raw JSON string
		CreatedBy  string  `json:"created_by"`
		SourceStep string  `json:"source_step"`
		Confidence float64 `json:"confidence"`
		Version    int     `json:"version"`
	}
	if !decodeJSON(r, &body, w) {
		return
	}
	contentBytes := []byte(body.Content)
	if len(contentBytes) == 0 {
		contentBytes = []byte("{}")
	}
	if body.Confidence == 0 {
		body.Confidence = 1.0
	}
	rec := &ael.SEMRecord{
		Type:       ael.SEMType(body.Type),
		Scope:      ael.SEMScope(body.Scope),
		HiveID:     body.HiveID,
		RunID:      body.RunID,
		Key:        body.Key,
		Content:    contentBytes,
		CreatedBy:  body.CreatedBy,
		SourceStep: body.SourceStep,
		Confidence: body.Confidence,
		Version:    body.Version,
	}
	if err := h.svc.CreateSEMRecord(r.Context(), rec); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, semRecordToDTO(rec))
}

func (h *SEMHandler) handleList(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	hiveID := q.Get("hive_id")
	semType := q.Get("type")
	scope := q.Get("scope")
	limit := 50
	if l := q.Get("limit"); l != "" {
		var n int
		if _, err := fmt.Sscanf(l, "%d", &n); err == nil && n > 0 {
			limit = n
		}
	}
	records, err := h.svc.ListSEMRecords(r.Context(), hiveID, semType, scope, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	items := make([]contracts.SEMRecordDTO, 0, len(records))
	for i := range records {
		items = append(items, semRecordToDTO(&records[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "total": len(items)})
}

func (h *SEMHandler) handleGetByID(w http.ResponseWriter, r *http.Request, id string) {
	rec, err := h.svc.GetSEMRecord(r.Context(), id)
	if err != nil {
		writeAELError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, semRecordToDTO(rec))
}

func semRecordToDTO(s *ael.SEMRecord) contracts.SEMRecordDTO {
	dto := contracts.SEMRecordDTO{
		ID:              s.ID,
		Type:            string(s.Type),
		Scope:           string(s.Scope),
		HiveID:          s.HiveID,
		RunID:           s.RunID,
		Key:             s.Key,
		Content:         string(s.Content),
		CreatedBy:       s.CreatedBy,
		SourceStep:      s.SourceStep,
		Confidence:      s.Confidence,
		Version:         s.Version,
		SupersededBy:    s.SupersededBy,
		EmbeddingStatus: s.EmbeddingStatus,
		CreatedAt:       s.CreatedAt.Format(time.RFC3339),
	}
	if s.ResolvedAt != nil {
		dto.ResolvedAt = s.ResolvedAt.Format(time.RFC3339)
	}
	return dto
}
