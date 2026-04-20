package anthropic

import (
	"strings"

	"open-kraken/backend/go/internal/provider"
)

// buildRequest converts a provider.Prompt into the Anthropic wire format.
// It enforces the one place where Anthropic specifics (system as a field
// rather than a Message, user/assistant-only role vocabulary) are encoded.
func buildRequest(p provider.Prompt) (createRequest, error) {
	msgs := make([]message, 0, len(p.Messages))
	for _, m := range p.Messages {
		switch m.Role {
		case provider.RoleSystem:
			// System turns inside Messages are forbidden by Anthropic.
			// Fold them into the System field (first wins; callers
			// should prefer Prompt.System).
			continue
		case provider.RoleUser, provider.RoleTool:
			msgs = append(msgs, message{Role: roleUser, Content: m.Content})
		case provider.RoleAssistant:
			msgs = append(msgs, message{Role: roleAssistant, Content: m.Content})
		default:
			// Unknown role is a bug in the adapter; fall back to user.
			msgs = append(msgs, message{Role: roleUser, Content: m.Content})
		}
	}

	// If Prompt.System is empty but a RoleSystem message appeared in
	// Messages, promote its content to System.
	system := strings.TrimSpace(p.System)
	if system == "" {
		for _, m := range p.Messages {
			if m.Role == provider.RoleSystem {
				system = m.Content
				break
			}
		}
	}

	req := createRequest{
		Model:     p.Model,
		MaxTokens: p.MaxTokens,
		System:    system,
		Messages:  msgs,
	}
	if req.MaxTokens <= 0 {
		req.MaxTokens = 1024
	}
	if p.Temperature >= 0 {
		t := p.Temperature
		req.Temperature = &t
	}
	if tenant := p.Metadata["tenant_id"]; tenant != "" {
		req.Metadata = &reqMeta{UserID: tenant}
	}
	return req, nil
}

// extractText concatenates every text block in the response content.
// Non-text blocks (tool_use etc.) are ignored for this minimal adapter.
func extractText(blocks []contentBlock) string {
	var b strings.Builder
	for _, blk := range blocks {
		if blk.Type == "text" {
			b.WriteString(blk.Text)
		}
	}
	return b.String()
}

// normalizeStopReason maps Anthropic's stop_reason values to the
// provider-neutral vocabulary declared in provider.Completion.
func normalizeStopReason(raw string) string {
	switch raw {
	case "end_turn":
		return "end_turn"
	case "max_tokens":
		return "max_tokens"
	case "stop_sequence":
		return "stop_sequence"
	case "tool_use":
		return "tool_use"
	default:
		return raw
	}
}
