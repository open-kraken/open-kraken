package provider

import (
	"errors"
	"time"
)

// Role is the speaker role for a single message in a conversation.
// Providers that use a different vocabulary (e.g. Anthropic's
// "user"/"assistant") map to/from these values inside their subpackage.
type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
	RoleTool      Role = "tool"
)

// Message is a single turn in a conversation. Content is plain text; rich
// content types (images, tool_use blocks) will land later as an opaque
// Parts slice — intentionally out of scope for the first cut.
type Message struct {
	Role    Role   `json:"role"`
	Content string `json:"content"`
}

// Prompt is the provider-agnostic request envelope. Concrete providers
// translate it into their native wire format.
type Prompt struct {
	// Model is the logical model identifier (e.g. "claude-opus-4-7",
	// "gpt-4o"). Providers validate it against their own catalogue and
	// return ErrUnknownModel when rejected.
	Model string

	// System is the system prompt. Providers that accept system as a
	// dedicated field (Anthropic) use it directly; those that only
	// accept system-as-message (OpenAI) prepend it to Messages.
	System string

	// Messages is the conversation so far, in chronological order.
	Messages []Message

	// MaxTokens caps the completion length. Zero means provider default.
	MaxTokens int

	// Temperature ∈ [0, 2]. Negative means provider default.
	Temperature float64

	// Metadata carries correlation ids (tenant, run, step) that some
	// providers attach to their own trace records. It must never contain
	// secrets.
	Metadata map[string]string
}

// Completion is the provider-agnostic response envelope.
type Completion struct {
	// Content is the assistant's reply as plain text.
	Content string

	// Model is the actual model that served the request. Providers can
	// route internally (e.g. "claude-opus-4-7" → a dated snapshot) so
	// the caller should record this, not Prompt.Model, when auditing.
	Model string

	// StopReason is a normalized string ("end_turn", "max_tokens",
	// "tool_use", "stop_sequence"). Concrete providers map their native
	// reason into this vocabulary.
	StopReason string

	// Usage reports token accounting. Providers that don't expose one of
	// the fields leave it at zero.
	Usage TokenUsage

	// Raw is the original JSON response body. Stored for audit / debug;
	// callers must not parse it at this layer.
	Raw []byte

	// Latency is measured end-to-end by the provider implementation.
	Latency time.Duration
}

// TokenUsage carries accounting fields. It deliberately matches the
// columns on AEL.steps so callers can pass the values through without
// reshaping.
type TokenUsage struct {
	InputTokens  int
	OutputTokens int
	TotalTokens  int

	// CostUSD is computed by the provider implementation using its own
	// price table. CWS reads this to update scheduling_arm_stats.
	CostUSD float64
}

// --- Errors ---

// ErrUnknownModel is returned when Prompt.Model is not supported by the
// provider implementation.
var ErrUnknownModel = errors.New("provider: unknown model")

// ErrAuth is returned when the configured API key is missing or rejected.
var ErrAuth = errors.New("provider: authentication failed")

// ErrRateLimited is returned when the upstream signalled rate limiting.
// Callers (typically CWS) are expected to back off; this is not a
// permanent Step failure.
var ErrRateLimited = errors.New("provider: rate limited")

// ErrUpstream wraps any non-classifiable upstream failure. Implementations
// may embed the HTTP status code and body in the error message.
type ErrUpstream struct {
	StatusCode int
	Message    string
}

func (e *ErrUpstream) Error() string {
	return e.Message
}
