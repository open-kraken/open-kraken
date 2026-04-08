package filter

import "strings"

// ResolveProfile maps a terminal type string to the appropriate filter profile.
func ResolveProfile(terminalType string) Profile {
	switch strings.ToLower(terminalType) {
	case "claude":
		return ProfileClaude
	case "codex":
		return ProfileCodex
	case "gemini":
		return ProfileGemini
	case "shell", "bash", "zsh", "fish", "powershell":
		return ProfileShell
	default:
		return ProfileGeneric
	}
}

// Runtime holds the active filter profile and applies rules.
type Runtime struct {
	profile Profile
}

// NewRuntime creates a filter Runtime for the given profile.
func NewRuntime(profile Profile) *Runtime {
	return &Runtime{profile: profile}
}

// Apply runs profile-specific rules against the output lines.
func (rt *Runtime) Apply(lines []string, ctx Context) Result {
	if len(lines) == 0 {
		return Result{Decision: DecisionAllow, Profile: rt.profile}
	}

	// Apply prompt block detection for all profiles.
	if dropped := detectPromptBlock(lines, ctx); dropped {
		return Result{
			Decision: DecisionDrop,
			Reason:   "prompt_block_detected",
			Profile:  rt.profile,
		}
	}

	// Profile-specific rules.
	switch rt.profile {
	case ProfileClaude:
		return rt.applyClaude(lines, ctx)
	case ProfileCodex:
		return rt.applyCodex(lines, ctx)
	case ProfileGemini:
		return rt.applyGemini(lines, ctx)
	case ProfileShell:
		return rt.applyShell(lines, ctx)
	default:
		return rt.applyGeneric(lines, ctx)
	}
}

// detectPromptBlock checks if the output is just a shell prompt with no
// meaningful content (common after a command completes).
func detectPromptBlock(lines []string, ctx Context) bool {
	if len(lines) > 3 {
		return false
	}
	nonEmpty := 0
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			nonEmpty++
		}
	}
	// If all lines are empty or just a prompt, drop.
	return nonEmpty == 0
}

func (rt *Runtime) applyGeneric(lines []string, ctx Context) Result {
	return Result{Decision: DecisionAllow, Profile: rt.profile}
}

func (rt *Runtime) applyClaude(lines []string, ctx Context) Result {
	// Claude Code outputs progress indicators that should not be sent as messages.
	// Filter lines that are only spinner characters or ANSI escape sequences.
	filtered := filterProgressLines(lines)
	if len(filtered) == 0 {
		return Result{Decision: DecisionDrop, Reason: "claude_progress_only", Profile: rt.profile}
	}
	return Result{Decision: DecisionAllow, Profile: rt.profile, Lines: filtered}
}

func (rt *Runtime) applyCodex(lines []string, ctx Context) Result {
	return Result{Decision: DecisionAllow, Profile: rt.profile}
}

func (rt *Runtime) applyGemini(lines []string, ctx Context) Result {
	return Result{Decision: DecisionAllow, Profile: rt.profile}
}

func (rt *Runtime) applyShell(lines []string, ctx Context) Result {
	return Result{Decision: DecisionAllow, Profile: rt.profile}
}

// filterProgressLines removes lines that contain only ANSI escape sequences,
// spinner characters, or are otherwise content-free.
func filterProgressLines(lines []string) []string {
	out := make([]string, 0, len(lines))
	for _, line := range lines {
		cleaned := stripANSI(line)
		trimmed := strings.TrimSpace(cleaned)
		// Keep lines that have meaningful text content.
		if trimmed != "" && !isSpinnerOnly(trimmed) {
			out = append(out, line)
		}
	}
	return out
}

// stripANSI removes ANSI escape sequences from a string.
func stripANSI(s string) string {
	var out strings.Builder
	i := 0
	for i < len(s) {
		if s[i] == '\x1b' {
			// Skip ESC sequence.
			i++
			if i < len(s) && s[i] == '[' {
				i++
				// Skip parameter bytes (0x30-0x3f) and intermediate bytes (0x20-0x2f).
				for i < len(s) && s[i] >= 0x20 && s[i] <= 0x3f {
					i++
				}
				// Skip final byte.
				if i < len(s) {
					i++
				}
			} else if i < len(s) && s[i] == ']' {
				// OSC sequence: skip until ST or BEL.
				i++
				for i < len(s) && s[i] != '\x07' && s[i] != '\x1b' {
					i++
				}
				if i < len(s) {
					i++
				}
			}
			continue
		}
		out.WriteByte(s[i])
		i++
	}
	return out.String()
}

// isSpinnerOnly returns true if the text consists only of spinner/progress characters.
func isSpinnerOnly(s string) bool {
	spinnerChars := "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/-\\●○◐◑◒◓◔◕⣾⣽⣻⢿⡿⣟⣯⣷"
	for _, r := range s {
		if !strings.ContainsRune(spinnerChars, r) && r != ' ' && r != '.' {
			return false
		}
	}
	return true
}
