package ael

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// --- Skill Library ---

// InsertSkill creates a new skill_definition row and fills in the assigned ID,
// published_at, and embedding_status from the RETURNING clause.
func (r *Repository) InsertSkill(ctx context.Context, s *SkillDefinition) error {
	const q = `
		INSERT INTO skill_definitions
			(name, version, description, prompt_template,
			 tool_requirements, agent_type_affinity, workload_class_tags,
			 tenant_id, authored_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, '')::UUID, $9)
		RETURNING id, published_at, embedding_status`
	return r.pool.QueryRow(ctx, q,
		s.Name, s.Version, s.Description, s.PromptTemplate,
		s.ToolRequirements, s.AgentTypeAffinity, s.WorkloadClassTags,
		s.TenantID, s.AuthoredBy,
	).Scan(&s.ID, &s.PublishedAt, &s.EmbeddingStatus)
}

// ListSkills returns up to limit skill definitions, newest first. If tenantID
// is non-empty only rows matching that tenant (or global NULL rows) are returned.
func (r *Repository) ListSkills(ctx context.Context, tenantID string, limit int) ([]SkillDefinition, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, name, version, description, prompt_template,
		       tool_requirements, agent_type_affinity, workload_class_tags,
		       COALESCE(tenant_id::TEXT, ''), authored_by, published_at, embedding_status
		FROM skill_definitions
		WHERE ($1 = '' OR tenant_id::TEXT = $1 OR tenant_id IS NULL)
		ORDER BY published_at DESC
		LIMIT $2`
	rows, err := r.pool.Query(ctx, q, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SkillDefinition
	for rows.Next() {
		var s SkillDefinition
		if err := rows.Scan(
			&s.ID, &s.Name, &s.Version, &s.Description, &s.PromptTemplate,
			&s.ToolRequirements, &s.AgentTypeAffinity, &s.WorkloadClassTags,
			&s.TenantID, &s.AuthoredBy, &s.PublishedAt, &s.EmbeddingStatus,
		); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetSkill loads a SkillDefinition by ID.
func (r *Repository) GetSkill(ctx context.Context, id string) (*SkillDefinition, error) {
	const q = `
		SELECT id, name, version, description, prompt_template,
		       tool_requirements, agent_type_affinity, workload_class_tags,
		       COALESCE(tenant_id::TEXT, ''), authored_by, published_at, embedding_status
		FROM skill_definitions WHERE id = $1`
	s := &SkillDefinition{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&s.ID, &s.Name, &s.Version, &s.Description, &s.PromptTemplate,
		&s.ToolRequirements, &s.AgentTypeAffinity, &s.WorkloadClassTags,
		&s.TenantID, &s.AuthoredBy, &s.PublishedAt, &s.EmbeddingStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return s, nil
}

// --- Process Template Library ---

// InsertProcessTemplate creates a new process_templates row.
func (r *Repository) InsertProcessTemplate(ctx context.Context, p *ProcessTemplate) error {
	const q = `
		INSERT INTO process_templates
			(name, version, trigger_description, dag_template,
			 applicable_domains, estimated_steps_min, estimated_steps_max, authored_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, published_at, embedding_status`
	return r.pool.QueryRow(ctx, q,
		p.Name, p.Version, p.TriggerDescription, p.DAGTemplate,
		p.ApplicableDomains, p.EstimatedStepsMin, p.EstimatedStepsMax, p.AuthoredBy,
	).Scan(&p.ID, &p.PublishedAt, &p.EmbeddingStatus)
}

// ListProcessTemplates returns up to limit process templates, newest first.
func (r *Repository) ListProcessTemplates(ctx context.Context, limit int) ([]ProcessTemplate, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, name, version, trigger_description, dag_template,
		       applicable_domains, estimated_steps_min, estimated_steps_max,
		       authored_by, published_at, embedding_status
		FROM process_templates
		ORDER BY published_at DESC
		LIMIT $1`
	rows, err := r.pool.Query(ctx, q, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProcessTemplate
	for rows.Next() {
		var p ProcessTemplate
		if err := rows.Scan(
			&p.ID, &p.Name, &p.Version, &p.TriggerDescription, &p.DAGTemplate,
			&p.ApplicableDomains, &p.EstimatedStepsMin, &p.EstimatedStepsMax,
			&p.AuthoredBy, &p.PublishedAt, &p.EmbeddingStatus,
		); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// GetProcessTemplate loads a ProcessTemplate by ID.
func (r *Repository) GetProcessTemplate(ctx context.Context, id string) (*ProcessTemplate, error) {
	const q = `
		SELECT id, name, version, trigger_description, dag_template,
		       applicable_domains, estimated_steps_min, estimated_steps_max,
		       authored_by, published_at, embedding_status
		FROM process_templates WHERE id = $1`
	p := &ProcessTemplate{}
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&p.ID, &p.Name, &p.Version, &p.TriggerDescription, &p.DAGTemplate,
		&p.ApplicableDomains, &p.EstimatedStepsMin, &p.EstimatedStepsMax,
		&p.AuthoredBy, &p.PublishedAt, &p.EmbeddingStatus,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return p, nil
}

// --- Shared Execution Memory ---

// InsertSEMRecord creates a new sem_records row.
func (r *Repository) InsertSEMRecord(ctx context.Context, s *SEMRecord) error {
	const q = `
		INSERT INTO sem_records
			(type, scope, hive_id, run_id, key, content,
			 created_by, source_step, confidence, version)
		VALUES ($1, $2, $3::UUID, NULLIF($4, '')::UUID, $5, $6,
		        $7, NULLIF($8, '')::UUID, $9, $10)
		RETURNING id, embedding_status, created_at`
	return r.pool.QueryRow(ctx, q,
		string(s.Type), string(s.Scope), s.HiveID, s.RunID, s.Key, s.Content,
		s.CreatedBy, s.SourceStep, s.Confidence, s.Version,
	).Scan(&s.ID, &s.EmbeddingStatus, &s.CreatedAt)
}

// ListSEMRecords returns SEM records filtered by hiveID, semType, and scope.
// Empty strings are treated as "no filter". Results are newest first.
func (r *Repository) ListSEMRecords(ctx context.Context, hiveID, semType, scope string, limit int) ([]SEMRecord, error) {
	if limit <= 0 {
		limit = 50
	}
	const q = `
		SELECT id, type, scope, hive_id::TEXT, COALESCE(run_id::TEXT, ''),
		       key, content, created_by, COALESCE(source_step::TEXT, ''),
		       confidence, version, COALESCE(superseded_by::TEXT, ''),
		       resolved_at, embedding_status, created_at
		FROM sem_records
		WHERE ($1 = '' OR hive_id::TEXT = $1)
		  AND ($2 = '' OR type::TEXT = $2)
		  AND ($3 = '' OR scope::TEXT = $3)
		  AND superseded_by IS NULL
		ORDER BY created_at DESC
		LIMIT $4`
	rows, err := r.pool.Query(ctx, q, hiveID, semType, scope, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SEMRecord
	for rows.Next() {
		var s SEMRecord
		var semT, semS string
		if err := rows.Scan(
			&s.ID, &semT, &semS, &s.HiveID, &s.RunID,
			&s.Key, &s.Content, &s.CreatedBy, &s.SourceStep,
			&s.Confidence, &s.Version, &s.SupersededBy,
			&s.ResolvedAt, &s.EmbeddingStatus, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		s.Type = SEMType(semT)
		s.Scope = SEMScope(semS)
		out = append(out, s)
	}
	return out, rows.Err()
}

// GetSEMRecord loads a SEMRecord by ID.
func (r *Repository) GetSEMRecord(ctx context.Context, id string) (*SEMRecord, error) {
	const q = `
		SELECT id, type, scope, hive_id::TEXT, COALESCE(run_id::TEXT, ''),
		       key, content, created_by, COALESCE(source_step::TEXT, ''),
		       confidence, version, COALESCE(superseded_by::TEXT, ''),
		       resolved_at, embedding_status, created_at
		FROM sem_records WHERE id = $1`
	s := &SEMRecord{}
	var semT, semS string
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&s.ID, &semT, &semS, &s.HiveID, &s.RunID,
		&s.Key, &s.Content, &s.CreatedBy, &s.SourceStep,
		&s.Confidence, &s.Version, &s.SupersededBy,
		&s.ResolvedAt, &s.EmbeddingStatus, &s.CreatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	s.Type = SEMType(semT)
	s.Scope = SEMScope(semS)
	return s, nil
}
