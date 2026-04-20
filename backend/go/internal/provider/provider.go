package provider

import "context"

// LLMProvider is the minimal interface every concrete provider
// implementation satisfies. Keep it small on purpose — streaming, tool
// use, and batching will enter as separate optional interfaces so that
// implementations can declare capability rather than faking support.
type LLMProvider interface {
	// Name returns a short identifier used for logging, metric labels,
	// and CWS arm keys (e.g. "anthropic", "openai"). Must be stable.
	Name() string

	// Complete performs a single synchronous prompt → completion round
	// trip. Implementations must honour ctx cancellation and return one
	// of the typed errors (ErrUnknownModel, ErrAuth, ErrRateLimited,
	// *ErrUpstream) when applicable.
	Complete(ctx context.Context, p Prompt) (*Completion, error)
}
