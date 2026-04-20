// Package llmexec implements flowscheduler.StepExecutor by dispatching an
// AEL Step to a provider.LLMProvider.
//
// This package is the one place that knows about both sides of the bridge:
//
//   - From the scheduler side it accepts an ExecutionRequest whose Step
//     carries the prompt in its EventStreamRaw field (JSON).
//   - From the provider side it emits a provider.Prompt and consumes the
//     provider.Completion back.
//
// Everything Anthropic-specific (JSON format on the wire, stop_reason
// values, pricing) is walled off inside provider/anthropic. Everything
// scheduler-specific (Step lifecycle, SideEffect bookkeeping) is walled
// off inside flowscheduler. This package translates between the two so
// neither has to know about the other.
//
// Step input contract (v1 — kept explicit and small):
//
//	steps.event_stream JSON:
//	{
//	  "model":       "claude-opus-4-7",
//	  "system":      "optional system prompt",
//	  "messages":    [{"role":"user","content":"..."}],
//	  "max_tokens":  1024,
//	  "temperature": 0.7
//	}
//
// On success the executor writes a fresh event_stream back with the
// assistant turn appended, plus provider-reported usage in
// ExecutionResult.TokensUsed / CostUSD.
//
// Dependency direction:
//
//	flowscheduler ── StepExecutor ──── llmexec ───► provider
//
// No reverse imports.
package llmexec
