package sem

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/embedder"
	"open-kraken/backend/go/internal/vector"
)

// Ledger is the subset of ael.Service that sem consumes. Declaring it
// here (consumer-side) keeps unit tests free of a real PG — a fake
// implementation is enough. *ael.Service satisfies this interface.
type Ledger interface {
	CreateSEMRecord(ctx context.Context, rec *ael.SEMRecord) error
	GetSEMRecord(ctx context.Context, id string) (*ael.SEMRecord, error)
	MarkSEMEmbedded(ctx context.Context, id string, qdrantID int64) error
	MarkSEMEmbeddingFailed(ctx context.Context, id string) error
}

// Config tunes Service behaviour. Defaults are safe — callers only need
// to override for non-default collection names or disabled features.
type Config struct {
	// Collection is the vector-store collection name. Default "sem".
	Collection string

	// AutoEnsureCollection runs EnsureCollection lazily on the first
	// Put / Search call. Default true.
	AutoEnsureCollection bool
}

// Service is the SEM write/search facade.
type Service struct {
	cfg      Config
	ledger   Ledger
	vec      vector.VectorStore
	emb      embedder.Embedder
	ensured  bool
}

// New constructs a Service. All three dependencies must be non-nil;
// pass vector.NewMemoryVectorStore() + embedder.NewHashEmbedder(...) in
// dev.
func New(ledger Ledger, vec vector.VectorStore, emb embedder.Embedder, cfg Config) (*Service, error) {
	if ledger == nil || vec == nil || emb == nil {
		return nil, errors.New("sem.New: ledger, vec and emb are required")
	}
	if cfg.Collection == "" {
		cfg.Collection = "sem"
	}
	// Zero-value Go bool is false; promote the safer default here.
	if !cfg.AutoEnsureCollection {
		cfg.AutoEnsureCollection = true
	}
	return &Service{
		cfg:    cfg,
		ledger: ledger,
		vec:    vec,
		emb:    emb,
	}, nil
}

// PutRequest is the input to Put. Callers populate the meaningful
// fields on SEMRecord (Type, Scope, HiveID, RunID, Key, Content,
// CreatedBy, SourceStep, Confidence). Server-assigned values (ID,
// EmbeddingStatus, QdrantID, CreatedAt) are filled by Put on success.
type PutRequest struct {
	Record *ael.SEMRecord

	// Text is the source text to embed. If empty, Put extracts a
	// best-effort representation from Record.Content (raw JSON
	// string). A future slice will let callers supply their own
	// structured-text extraction hooks.
	Text string
}

// Put writes the record to PG, indexes it, and flips embedding_status.
// On vector-store or embedder failure the PG row is preserved in the
// 'failed' state so the outbox worker (Batch 2) retries.
func (s *Service) Put(ctx context.Context, req PutRequest) error {
	if req.Record == nil {
		return errors.New("sem.Put: Record is required")
	}
	if err := s.ensureCollectionIfNeeded(ctx); err != nil {
		return err
	}

	// Step 1: PG metadata insert. Authoritative even if the vector
	// write later fails.
	if err := s.ledger.CreateSEMRecord(ctx, req.Record); err != nil {
		return fmt.Errorf("sem: create pg row: %w", err)
	}

	// Step 2: embed.
	text := strings.TrimSpace(req.Text)
	if text == "" {
		text = string(req.Record.Content)
	}
	vec, err := s.emb.Embed(ctx, text)
	if err != nil {
		_ = s.ledger.MarkSEMEmbeddingFailed(ctx, req.Record.ID)
		return fmt.Errorf("sem: embed: %w", err)
	}

	// Step 3: vector upsert.
	payload := buildPayload(req.Record)
	if err := s.vec.Upsert(ctx, s.cfg.Collection, []vector.Point{{
		ID:      req.Record.ID,
		Vector:  vec,
		Payload: payload,
	}}); err != nil {
		_ = s.ledger.MarkSEMEmbeddingFailed(ctx, req.Record.ID)
		return fmt.Errorf("sem: vector upsert: %w", err)
	}

	// Step 4: mark indexed. The qdrant point id equals the SEM row id
	// for MemoryVectorStore; the Qdrant backend (Batch 2) uses its own
	// numeric id space and reconciles via MarkSEMEmbedded.
	if err := s.ledger.MarkSEMEmbedded(ctx, req.Record.ID, 0); err != nil {
		return fmt.Errorf("sem: mark indexed: %w", err)
	}
	req.Record.EmbeddingStatus = "indexed"
	return nil
}

// SearchRequest scopes a vector query.
type SearchRequest struct {
	Query string

	// Scope narrows the search to one of the paper's L2/L3 planes:
	//   - SEMScopeRun  → records belonging to one Run (L2)
	//   - SEMScopeHive → hive-wide records (L3)
	// Empty matches everything.
	Scope ael.SEMScope

	// HiveID narrows the search to one hive. Empty matches all hives.
	HiveID string

	// RunID narrows the search to one run when Scope is Run/Flow/Step.
	RunID string

	// Limit is the top-k cap. Default 10.
	Limit int
}

// SearchHit pairs a SEM record with its similarity score.
type SearchHit struct {
	Record *ael.SEMRecord
	Score  float64
}

// Search embeds Query, performs a filtered vector search, and hydrates
// the top hits from PG. Missing rows (e.g. deleted after indexing) are
// skipped silently.
func (s *Service) Search(ctx context.Context, req SearchRequest) ([]SearchHit, error) {
	if strings.TrimSpace(req.Query) == "" {
		return nil, errors.New("sem.Search: Query is required")
	}
	if err := s.ensureCollectionIfNeeded(ctx); err != nil {
		return nil, err
	}
	vec, err := s.emb.Embed(ctx, req.Query)
	if err != nil {
		return nil, fmt.Errorf("sem: embed query: %w", err)
	}
	filter := vector.Filter{}
	if req.Scope != "" {
		filter["scope"] = string(req.Scope)
	}
	if req.HiveID != "" {
		filter["hive_id"] = req.HiveID
	}
	if req.RunID != "" {
		filter["run_id"] = req.RunID
	}
	limit := req.Limit
	if limit <= 0 {
		limit = 10
	}

	hits, err := s.vec.Search(ctx, s.cfg.Collection, vec, limit, filter)
	if err != nil {
		return nil, fmt.Errorf("sem: vector search: %w", err)
	}

	out := make([]SearchHit, 0, len(hits))
	for _, h := range hits {
		rec, err := s.ledger.GetSEMRecord(ctx, h.ID)
		if err != nil {
			// A row disappeared after indexing — skip silently. A
			// future WAL consumer can reconcile these orphans.
			continue
		}
		out = append(out, SearchHit{Record: rec, Score: h.Score})
	}
	return out, nil
}

// ensureCollectionIfNeeded lazily creates the collection on first use.
// Locked only on cold start; the check is deliberately non-atomic for
// simplicity — double-create is harmless (EnsureCollection is idempotent).
func (s *Service) ensureCollectionIfNeeded(ctx context.Context) error {
	if s.ensured || !s.cfg.AutoEnsureCollection {
		return nil
	}
	if err := s.vec.EnsureCollection(ctx, s.cfg.Collection, s.emb.Dim()); err != nil {
		return fmt.Errorf("sem: ensure collection: %w", err)
	}
	s.ensured = true
	return nil
}

// buildPayload extracts the filter-relevant fields from a SEMRecord
// into the vector-store payload. Strings stored here must match the
// filter values used by Search (stringified scope, hive_id, run_id).
func buildPayload(rec *ael.SEMRecord) map[string]any {
	return map[string]any{
		"scope":   string(rec.Scope),
		"type":    string(rec.Type),
		"hive_id": rec.HiveID,
		"run_id":  rec.RunID,
		"key":     rec.Key,
	}
}
