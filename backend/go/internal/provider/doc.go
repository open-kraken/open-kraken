// Package provider defines the LLM provider abstraction consumed by the
// Agent Runtime's executors. It is deliberately minimal and
// provider-agnostic:
//
//   - No package in this tree references vendor-specific SDKs or HTTP
//     details. Concrete implementations live in provider subpackages
//     (e.g. provider/anthropic, provider/openai) and expose the same
//     LLMProvider interface.
//   - Types in this package never leak ael.Step / flowscheduler structs.
//     The provider layer does not know about the Authoritative Execution
//     Ledger, scheduling, or Step lifecycles. That is the job of the
//     adapter layer (internal/llmexec) which sits between AEL and this
//     abstraction.
//
// Dependency direction enforced by layout:
//
//	flowscheduler ── StepExecutor ──── llmexec ───► provider ◄── provider/anthropic
//	                                                  ▲
//	                                             (interface only;
//	                                              no reverse deps)
//
// Rationale (paper §5.4 "Agent Runtime"): CWS should be able to route a
// Step to any registered (agent_type, provider, model) arm without the
// scheduler knowing provider-specific details. Keeping providers behind a
// stable Go interface is the precondition for a UCB-based router that
// treats providers as interchangeable arms.
package provider
