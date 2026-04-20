// Package openai implements provider.LLMProvider against the OpenAI
// Chat Completions API (https://platform.openai.com/docs/api-reference/chat).
//
// Scope mirrors provider/anthropic: HTTP transport, auth header,
// native wire DTOs, mapping to/from provider-neutral types, a small
// price table for cost estimation.
//
// Notable differences from Anthropic (encoded here, nowhere else):
//
//   - System prompt is a regular message (role="system"), not a
//     dedicated request field.
//   - `stop_reason` is called `finish_reason`; possible values map as
//     stop → end_turn, length → max_tokens, content_filter →
//     content_filter, tool_calls → tool_use.
//   - Usage uses `prompt_tokens` / `completion_tokens` / `total_tokens`.
//   - Auth header is `Authorization: Bearer <key>`.
//   - 4xx/5xx error body is `{"error": {"code", "message", "type"}}`.
//
// Out of scope for v1 (same cut as Anthropic package):
//
//   - Streaming (server-sent events).
//   - Function calling / tool calls.
//   - Batch / vision / embeddings (embeddings land in the embedder
//     package, not here).
//
// Callers import only `internal/provider`; the concrete type satisfies
// that interface so registries stay provider-agnostic.
package openai
