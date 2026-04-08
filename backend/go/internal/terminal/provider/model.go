// Package provider defines the AI provider registry that maps terminal types
// to their default commands, configuration flags, and post-ready startup plans.
// Aligned with golutra's default_members registry.
package provider

import (
	"strings"

	"open-kraken/backend/go/internal/terminal/postready"
)

// Config holds the static configuration for a terminal provider.
type Config struct {
	// ID is the unique identifier (e.g. "claude-code").
	ID string
	// TerminalType is the type string used in session creation.
	TerminalType string
	// DisplayName is the human-readable name.
	DisplayName string
	// DefaultCommand is the CLI binary to launch.
	DefaultCommand string
	// UnlimitedAccessFlag is an optional flag for permission bypass
	// (e.g. "--dangerously-skip-permissions" for Claude).
	UnlimitedAccessFlag string
	// ResumeCommandTemplate is a template for resuming sessions.
	// Use {session_id} as placeholder.
	ResumeCommandTemplate string
	// PostReadyPlan defines the startup sequence after launch.
	PostReadyPlan postready.Plan
	// Icon is a short identifier for UI rendering.
	Icon string
}

// ApplyUnlimitedAccess appends the unlimited access flag to a command
// if the flag is configured and the command matches the default.
func (c Config) ApplyUnlimitedAccess(cmd string) string {
	if c.UnlimitedAccessFlag == "" {
		return cmd
	}
	if cmd == "" || cmd == c.DefaultCommand {
		return c.DefaultCommand + " " + c.UnlimitedAccessFlag
	}
	return cmd
}

// ApplyResumeCommand generates a resume command with the session ID.
func (c Config) ApplyResumeCommand(sessionID string) string {
	if c.ResumeCommandTemplate == "" || sessionID == "" {
		return ""
	}
	return strings.Replace(c.ResumeCommandTemplate, "{session_id}", sessionID, 1)
}

// ResolveCommand returns the command to use for session creation.
// If customCmd is non-empty, it's used as-is. Otherwise the default is returned.
func (c Config) ResolveCommand(customCmd string, unlimitedAccess bool) string {
	cmd := customCmd
	if cmd == "" {
		cmd = c.DefaultCommand
	}
	if unlimitedAccess {
		return c.ApplyUnlimitedAccess(cmd)
	}
	return cmd
}
