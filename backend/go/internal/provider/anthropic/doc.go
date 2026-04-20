// Package anthropic implements provider.LLMProvider against the
// Anthropic Messages API (https://docs.anthropic.com/en/api/messages).
//
// Scope of this package:
//
//   - HTTP transport, headers (x-api-key, anthropic-version), auth.
//   - Native request/response JSON structs. Nothing outside this package
//     should import them — callers use provider.Prompt / Completion.
//   - Mapping between provider-agnostic types and Anthropic's native
//     vocabulary (system prompt, content blocks, stop_reason values).
//   - A minimal price table used to compute Completion.Usage.CostUSD.
//
// Explicitly out of scope (kept out of the interface on purpose):
//
//   - Streaming (server-sent events).
//   - Tool use / tool_result content blocks.
//   - Prompt caching / batching.
//   - Long-running Messages via `beta` endpoints.
//
// Those land as optional interfaces on top of LLMProvider when the
// executors actually need them.
package anthropic
