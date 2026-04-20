package estimator

import (
	"encoding/json"
)

// Request is the plain-value view of a Step handed to the Estimator.
// Kept local to this package so Estimator never sees ael.Step — the
// scheduler copies the fields it needs in.
type Request struct {
	// Regime and WorkloadClass let length-agnostic estimators branch
	// per workload (e.g. "code-gen" typically longer than "chat").
	Regime        string
	WorkloadClass string

	// AgentType and Provider inform future learned estimators that
	// model arms separately; today's heuristics ignore them.
	AgentType string
	Provider  string

	// EventStream is the executor input stream — usually the JSON
	// messages array from llmexec. Empty means "no input available",
	// which the char-count estimator treats as a fixed floor.
	EventStream []byte

	// MaxTokensHint is the Step's declared max_tokens ceiling (parsed
	// from event_stream by the scheduler when available). When set,
	// Estimators use it as an upper clamp rather than inventing one.
	MaxTokensHint int
}

// Estimator returns a conservative token-count forecast for req. The
// value is what the scheduler passes into T1 as EstimatedTokens; a
// return of 0 tells T1 "no debit" (the Run's budget is not touched).
//
// Implementations must be pure functions. No network, no disk, no
// provider calls — this runs on the dispatch hot path.
type Estimator interface {
	Estimate(req Request) int
}

// --- CharCountEstimator ---

// CharCountEstimator approximates tokens as `(inputChars / CharsPerToken)
// + OutputGuess`, clamped to [MinEstimate, MaxTokensHint or MaxEstimate].
// The defaults (4 chars/token, 128 output tokens guess) match the
// rule-of-thumb Anthropic/OpenAI publish for English prose.
type CharCountEstimator struct {
	// CharsPerToken is the divisor applied to input bytes. Default 4.
	CharsPerToken int
	// OutputGuess is added on top of the input estimate as a placeholder
	// for the assistant's reply. Default 128.
	OutputGuess int
	// MinEstimate is the floor (applied even for empty input). Default 32.
	MinEstimate int
	// MaxEstimate caps the result when MaxTokensHint is 0. Default 8192.
	MaxEstimate int
}

// NewCharCountEstimator returns an Estimator with the documented defaults.
func NewCharCountEstimator() *CharCountEstimator {
	return &CharCountEstimator{
		CharsPerToken: 4,
		OutputGuess:   128,
		MinEstimate:   32,
		MaxEstimate:   8192,
	}
}

// Estimate implements Estimator.
func (e *CharCountEstimator) Estimate(req Request) int {
	chars := countMessageChars(req.EventStream)
	cpt := e.CharsPerToken
	if cpt <= 0 {
		cpt = 4
	}
	est := chars/cpt + e.OutputGuess
	if est < e.MinEstimate {
		est = e.MinEstimate
	}
	ceiling := e.MaxEstimate
	if req.MaxTokensHint > 0 {
		// Cap at hint + OutputGuess headroom so we never block a Step
		// that the user explicitly constrained.
		ceiling = req.MaxTokensHint + e.OutputGuess
	}
	if ceiling > 0 && est > ceiling {
		est = ceiling
	}
	return est
}

// countMessageChars extracts a character count from the canonical llmexec
// event_stream JSON: {"messages":[{"role":"...", "content":"..."}], ...}.
// Falls back to raw byte length when the JSON cannot be decoded — still
// produces a usable signal without a second query into the database.
func countMessageChars(raw []byte) int {
	if len(raw) == 0 {
		return 0
	}
	var env struct {
		System   string `json:"system"`
		Messages []struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(raw, &env); err != nil {
		return len(raw)
	}
	total := len(env.System)
	for _, m := range env.Messages {
		total += len(m.Role) + len(m.Content)
	}
	return total
}

// --- FixedEstimator ---

// FixedEstimator returns the same constant for every request. Useful
// for tests and for deployments that pre-size every Step to the same
// budget bucket.
type FixedEstimator struct {
	Value int
}

// Estimate implements Estimator.
func (f FixedEstimator) Estimate(_ Request) int { return f.Value }

// --- Compile-time checks ---
var (
	_ Estimator = (*CharCountEstimator)(nil)
	_ Estimator = FixedEstimator{}
)
