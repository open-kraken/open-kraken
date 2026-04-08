package semantic

import "strings"

// ExtractCommandFromInput finds the last non-empty line in user input,
// which is typically the command being executed.
func ExtractCommandFromInput(data string) string {
	lines := strings.Split(data, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := strings.TrimSpace(lines[i])
		if line != "" {
			return line
		}
	}
	return ""
}

// ExtractInputLines splits input into non-empty lines.
func ExtractInputLines(data string) []string {
	raw := strings.Split(data, "\n")
	out := make([]string, 0, len(raw))
	for _, line := range raw {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

// joinLines concatenates lines with newline separators.
func joinLines(lines []string) string {
	return strings.Join(lines, "\n")
}

// trimContent removes leading/trailing empty lines and whitespace.
func trimContent(s string) string {
	lines := strings.Split(s, "\n")

	// Trim leading empty lines.
	start := 0
	for start < len(lines) && strings.TrimSpace(lines[start]) == "" {
		start++
	}

	// Trim trailing empty lines.
	end := len(lines)
	for end > start && strings.TrimSpace(lines[end-1]) == "" {
		end--
	}

	if start >= end {
		return ""
	}

	return strings.Join(lines[start:end], "\n")
}
