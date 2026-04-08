package filter

import "testing"

func TestResolveProfile(t *testing.T) {
	cases := []struct {
		termType string
		expect   Profile
	}{
		{"claude", ProfileClaude},
		{"Claude", ProfileClaude},
		{"codex", ProfileCodex},
		{"gemini", ProfileGemini},
		{"shell", ProfileShell},
		{"bash", ProfileShell},
		{"zsh", ProfileShell},
		{"unknown", ProfileGeneric},
		{"", ProfileGeneric},
	}
	for _, tc := range cases {
		got := ResolveProfile(tc.termType)
		if got != tc.expect {
			t.Errorf("ResolveProfile(%q) = %s, want %s", tc.termType, got, tc.expect)
		}
	}
}

func TestFilterAllowsNormalContent(t *testing.T) {
	rt := NewRuntime(ProfileGeneric)
	lines := []string{"hello world", "this is output", "line 3"}
	result := rt.Apply(lines, Context{})
	if result.Decision != DecisionAllow {
		t.Fatalf("expected allow, got %d", result.Decision)
	}
}

func TestFilterDropsEmptyContent(t *testing.T) {
	rt := NewRuntime(ProfileGeneric)
	lines := []string{"", "  ", ""}
	result := rt.Apply(lines, Context{})
	if result.Decision != DecisionDrop {
		t.Fatalf("expected drop for empty content, got %d", result.Decision)
	}
}

func TestClaudeFilterDropsSpinnerOnly(t *testing.T) {
	rt := NewRuntime(ProfileClaude)
	lines := []string{"⠋ ", "⠙ ", "⠹ "}
	result := rt.Apply(lines, Context{TerminalType: "claude"})
	if result.Decision != DecisionDrop {
		t.Fatalf("expected drop for spinner-only content, got %d", result.Decision)
	}
}

func TestClaudeFilterAllowsMixedContent(t *testing.T) {
	rt := NewRuntime(ProfileClaude)
	lines := []string{"⠋ Loading...", "Here is the result:", "function foo() {}"}
	result := rt.Apply(lines, Context{TerminalType: "claude"})
	if result.Decision != DecisionAllow {
		t.Fatalf("expected allow for mixed content, got %d", result.Decision)
	}
}

func TestStripANSI(t *testing.T) {
	cases := []struct {
		input  string
		expect string
	}{
		{"\x1b[31mred\x1b[0m", "red"},
		{"\x1b[1;32mbold green\x1b[0m", "bold green"},
		{"no escape", "no escape"},
		{"\x1b]0;title\x07text", "text"},
	}
	for _, tc := range cases {
		got := stripANSI(tc.input)
		if got != tc.expect {
			t.Errorf("stripANSI(%q) = %q, want %q", tc.input, got, tc.expect)
		}
	}
}

func TestIsSpinnerOnly(t *testing.T) {
	if !isSpinnerOnly("⠋ ") {
		t.Error("expected spinner only for ⠋")
	}
	if !isSpinnerOnly("... ") {
		t.Error("expected spinner only for ...")
	}
	if isSpinnerOnly("hello world") {
		t.Error("'hello world' should not be spinner only")
	}
}
