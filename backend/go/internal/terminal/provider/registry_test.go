package provider

import "testing"

func TestRegistryResolve(t *testing.T) {
	r := NewRegistry()

	cfg, ok := r.Resolve("claude")
	if !ok {
		t.Fatal("expected to find claude")
	}
	if cfg.ID != "claude-code" {
		t.Fatalf("expected claude-code, got %s", cfg.ID)
	}
	if cfg.DefaultCommand != "claude" {
		t.Fatalf("expected 'claude' command, got %s", cfg.DefaultCommand)
	}
	if cfg.UnlimitedAccessFlag != "--dangerously-skip-permissions" {
		t.Fatalf("expected unlimited flag, got %s", cfg.UnlimitedAccessFlag)
	}
}

func TestRegistryResolveCaseInsensitive(t *testing.T) {
	r := NewRegistry()
	cfg, ok := r.Resolve("Claude")
	if !ok || cfg.ID != "claude-code" {
		t.Fatal("expected case-insensitive match")
	}
}

func TestRegistryResolveAllBuiltins(t *testing.T) {
	r := NewRegistry()
	types := []string{"claude", "gemini", "codex", "opencode", "qwen", "shell"}
	for _, tt := range types {
		_, ok := r.Resolve(tt)
		if !ok {
			t.Errorf("expected to find provider for %q", tt)
		}
	}
}

func TestRegistryResolveFallback(t *testing.T) {
	r := NewRegistry()
	cfg, ok := r.Resolve("unknown-tool")
	if ok {
		t.Fatal("expected fallback (not found)")
	}
	if cfg.TerminalType != "shell" {
		t.Fatalf("expected shell fallback, got %s", cfg.TerminalType)
	}
}

func TestRegistryList(t *testing.T) {
	r := NewRegistry()
	all := r.List()
	if len(all) != 6 {
		t.Fatalf("expected 6 providers, got %d", len(all))
	}
}

func TestRegistryCustomProvider(t *testing.T) {
	r := NewRegistry()
	r.Register(Config{
		ID:             "custom-ai",
		TerminalType:   "custom",
		DisplayName:    "Custom AI",
		DefaultCommand: "custom-cli",
	})
	cfg, ok := r.Resolve("custom")
	if !ok {
		t.Fatal("expected to find custom provider")
	}
	if cfg.DefaultCommand != "custom-cli" {
		t.Fatalf("expected custom-cli, got %s", cfg.DefaultCommand)
	}
	if len(r.List()) != 7 {
		t.Fatalf("expected 7 providers after register, got %d", len(r.List()))
	}
}

func TestConfigApplyUnlimitedAccess(t *testing.T) {
	cfg := Config{
		DefaultCommand:      "claude",
		UnlimitedAccessFlag: "--dangerously-skip-permissions",
	}
	got := cfg.ApplyUnlimitedAccess("claude")
	expected := "claude --dangerously-skip-permissions"
	if got != expected {
		t.Fatalf("expected %q, got %q", expected, got)
	}

	// Custom command should not get the flag.
	got = cfg.ApplyUnlimitedAccess("my-claude")
	if got != "my-claude" {
		t.Fatalf("expected unchanged custom command, got %q", got)
	}
}

func TestConfigResolveCommand(t *testing.T) {
	cfg := Config{
		DefaultCommand:      "claude",
		UnlimitedAccessFlag: "--skip",
	}

	// No custom, no unlimited.
	if got := cfg.ResolveCommand("", false); got != "claude" {
		t.Fatalf("expected 'claude', got %q", got)
	}

	// No custom, with unlimited.
	if got := cfg.ResolveCommand("", true); got != "claude --skip" {
		t.Fatalf("expected 'claude --skip', got %q", got)
	}

	// Custom command, no unlimited.
	if got := cfg.ResolveCommand("my-cmd", false); got != "my-cmd" {
		t.Fatalf("expected 'my-cmd', got %q", got)
	}
}

func TestConfigApplyResumeCommand(t *testing.T) {
	cfg := Config{
		ResumeCommandTemplate: "claude --resume {session_id}",
	}
	got := cfg.ApplyResumeCommand("sess123")
	if got != "claude --resume sess123" {
		t.Fatalf("expected 'claude --resume sess123', got %q", got)
	}

	// Empty session ID.
	if cfg.ApplyResumeCommand("") != "" {
		t.Fatal("expected empty for no session id")
	}
}
