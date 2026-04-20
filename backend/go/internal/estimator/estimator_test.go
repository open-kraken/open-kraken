package estimator

import (
	"encoding/json"
	"testing"
)

func TestCharCountEstimator_EmptyInputIsJustOutputGuess(t *testing.T) {
	e := NewCharCountEstimator()
	got := e.Estimate(Request{})
	// chars=0, tokens = 0/4 + OutputGuess(128) = 128. MinEstimate(32)
	// acts as a lower clamp and does not apply here.
	if got != 128 {
		t.Errorf("empty request should return OutputGuess=128, got %d", got)
	}
}

func TestCharCountEstimator_MinEstimateAppliesWhenOutputGuessZero(t *testing.T) {
	// With OutputGuess=0 and tiny input, MinEstimate should kick in.
	e := &CharCountEstimator{CharsPerToken: 4, OutputGuess: 0, MinEstimate: 32, MaxEstimate: 8192}
	got := e.Estimate(Request{})
	if got != 32 {
		t.Errorf("want MinEstimate=32, got %d", got)
	}
}

func TestCharCountEstimator_SimpleMessage(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{
			{"role": "user", "content": "hello world hello world"}, // 23 chars
		},
	})
	e := NewCharCountEstimator()
	// chars = len("user") + len(content) = 4 + 23 = 27
	// tokens = 27/4 + 128 = 6 + 128 = 134
	got := e.Estimate(Request{EventStream: payload})
	if got < 130 || got > 140 {
		t.Errorf("expected ~134 tokens, got %d", got)
	}
}

func TestCharCountEstimator_RespectsMaxTokensHint(t *testing.T) {
	// A very long input should be clamped by MaxTokensHint + OutputGuess.
	big := make([]byte, 200_000)
	for i := range big {
		big[i] = 'a'
	}
	payload, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{{"role": "user", "content": string(big)}},
	})
	e := NewCharCountEstimator()
	got := e.Estimate(Request{EventStream: payload, MaxTokensHint: 512})
	// Expected ceiling ≈ 512 + 128 = 640.
	if got != 640 {
		t.Errorf("want 640 (hint+output), got %d", got)
	}
}

func TestCharCountEstimator_RespectsMaxEstimateCap(t *testing.T) {
	big := make([]byte, 200_000)
	for i := range big {
		big[i] = 'a'
	}
	payload, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{{"role": "user", "content": string(big)}},
	})
	e := NewCharCountEstimator() // no MaxTokensHint → MaxEstimate=8192
	got := e.Estimate(Request{EventStream: payload})
	if got != 8192 {
		t.Errorf("want 8192 (MaxEstimate cap), got %d", got)
	}
}

func TestCharCountEstimator_FallsBackWhenJSONIsMalformed(t *testing.T) {
	e := NewCharCountEstimator()
	bad := []byte(`{this is not JSON`) // 17 chars; tokens = 17/4 + 128 = 132
	got := e.Estimate(Request{EventStream: bad})
	if got < 128 || got > 140 {
		t.Errorf("malformed JSON should fall back to raw byte count; got %d", got)
	}
}

func TestCharCountEstimator_ZeroCharsPerTokenUsesDefault(t *testing.T) {
	// A defensive guard for misconfigured callers.
	e := &CharCountEstimator{CharsPerToken: 0, OutputGuess: 0, MinEstimate: 1, MaxEstimate: 0}
	payload, _ := json.Marshal(map[string]any{
		"messages": []map[string]string{{"role": "user", "content": "abcd"}},
	})
	got := e.Estimate(Request{EventStream: payload})
	// chars = 4+4 = 8; default CharsPerToken=4 → 2 tokens; OutputGuess=0, Min=1 → 2
	if got != 2 {
		t.Errorf("want 2 tokens with fallback divisor, got %d", got)
	}
}

func TestFixedEstimator_ReturnsConstant(t *testing.T) {
	f := FixedEstimator{Value: 999}
	if got := f.Estimate(Request{EventStream: []byte(`anything`)}); got != 999 {
		t.Errorf("want 999, got %d", got)
	}
	if got := f.Estimate(Request{}); got != 999 {
		t.Errorf("want 999 on empty, got %d", got)
	}
}
