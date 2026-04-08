package provider

import (
	"strings"

	"open-kraken/backend/go/internal/terminal/postready"
)

// AI onboarding step shared across AI providers.
var aiOnboardingStep = postready.Action{
	Type:          postready.ActionIntroduction,
	PromptType:    "ai_onboarding",
	RequireStable: true,
}

// Built-in provider configurations aligned with golutra's default_members.
var builtinProviders = []Config{
	{
		ID:                  "claude-code",
		TerminalType:        "claude",
		DisplayName:         "Claude Code",
		DefaultCommand:      "claude",
		UnlimitedAccessFlag: "--dangerously-skip-permissions",
		Icon:                "CC",
		PostReadyPlan:       postready.Plan{Steps: []postready.Action{aiOnboardingStep}},
	},
	{
		ID:             "gemini-cli",
		TerminalType:   "gemini",
		DisplayName:    "Gemini CLI",
		DefaultCommand: "gemini",
		Icon:           "GE",
		PostReadyPlan:  postready.Plan{Steps: []postready.Action{aiOnboardingStep}},
	},
	{
		ID:             "codex-cli",
		TerminalType:   "codex",
		DisplayName:    "Codex CLI",
		DefaultCommand: "codex",
		Icon:           "CX",
		PostReadyPlan:  postready.Plan{Steps: []postready.Action{aiOnboardingStep}},
	},
	{
		ID:             "opencode",
		TerminalType:   "opencode",
		DisplayName:    "OpenCode",
		DefaultCommand: "opencode",
		Icon:           "OC",
		PostReadyPlan:  postready.Plan{Steps: []postready.Action{aiOnboardingStep}},
	},
	{
		ID:             "qwen-code",
		TerminalType:   "qwen",
		DisplayName:    "Qwen Code",
		DefaultCommand: "qwen",
		Icon:           "QW",
		PostReadyPlan:  postready.Plan{Steps: []postready.Action{aiOnboardingStep}},
	},
	{
		ID:             "shell",
		TerminalType:   "shell",
		DisplayName:    "Shell",
		DefaultCommand: "",
		Icon:           "SH",
		PostReadyPlan:  postready.Plan{}, // No post-ready for shell.
	},
}

// Registry provides lookup for provider configurations.
type Registry struct {
	byType map[string]Config
	byID   map[string]Config
	all    []Config
}

// NewRegistry creates a Registry with all built-in providers.
func NewRegistry() *Registry {
	r := &Registry{
		byType: make(map[string]Config, len(builtinProviders)),
		byID:   make(map[string]Config, len(builtinProviders)),
		all:    make([]Config, len(builtinProviders)),
	}
	copy(r.all, builtinProviders)
	for _, p := range r.all {
		r.byType[strings.ToLower(p.TerminalType)] = p
		r.byID[p.ID] = p
	}
	return r
}

// Resolve looks up a provider by terminal type. Returns the config and true
// if found, or a generic shell fallback and false if not.
func (r *Registry) Resolve(terminalType string) (Config, bool) {
	cfg, ok := r.byType[strings.ToLower(terminalType)]
	if ok {
		return cfg, true
	}
	// Fallback: treat as shell.
	return r.byType["shell"], false
}

// ResolveByID looks up a provider by its unique ID.
func (r *Registry) ResolveByID(id string) (Config, bool) {
	cfg, ok := r.byID[id]
	return cfg, ok
}

// List returns all registered providers.
func (r *Registry) List() []Config {
	out := make([]Config, len(r.all))
	copy(out, r.all)
	return out
}

// Register adds a custom provider. Overwrites if the terminal type already exists.
func (r *Registry) Register(cfg Config) {
	key := strings.ToLower(cfg.TerminalType)
	r.byType[key] = cfg
	r.byID[cfg.ID] = cfg
	// Update the all list.
	found := false
	for i, existing := range r.all {
		if strings.ToLower(existing.TerminalType) == key {
			r.all[i] = cfg
			found = true
			break
		}
	}
	if !found {
		r.all = append(r.all, cfg)
	}
}
