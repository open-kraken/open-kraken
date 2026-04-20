package openai

import (
	"strings"

	"open-kraken/backend/go/internal/provider"
)

// buildRequest translates a provider.Prompt into the Chat Completions
// wire format. System prompt is prepended as a messages[0] with
// role=system (the OpenAI convention, unlike Anthropic's dedicated
// field).
func buildRequest(p provider.Prompt) (createRequest, error) {
	msgs := make([]message, 0, len(p.Messages)+1)

	// Prefer Prompt.System; fall back to the first system-role message.
	system := strings.TrimSpace(p.System)
	if system == "" {
		for _, m := range p.Messages {
			if m.Role == provider.RoleSystem {
				system = m.Content
				break
			}
		}
	}
	if system != "" {
		msgs = append(msgs, message{Role: roleSystem, Content: system})
	}

	for _, m := range p.Messages {
		switch m.Role {
		case provider.RoleSystem:
			// Already folded above; do not duplicate.
			continue
		case provider.RoleUser:
			msgs = append(msgs, message{Role: roleUser, Content: m.Content})
		case provider.RoleAssistant:
			msgs = append(msgs, message{Role: roleAssistant, Content: m.Content})
		case provider.RoleTool:
			msgs = append(msgs, message{Role: roleTool, Content: m.Content})
		default:
			msgs = append(msgs, message{Role: roleUser, Content: m.Content})
		}
	}

	req := createRequest{
		Model:    p.Model,
		Messages: msgs,
	}
	if p.MaxTokens > 0 {
		req.MaxTokens = p.MaxTokens
	}
	if p.Temperature >= 0 {
		t := p.Temperature
		req.Temperature = &t
	}
	if tenant := p.Metadata["tenant_id"]; tenant != "" {
		req.User = tenant
	}
	return req, nil
}

// normalizeStopReason maps OpenAI finish_reason values to the
// provider-neutral vocabulary declared in provider.Completion.
func normalizeStopReason(raw string) string {
	switch raw {
	case "stop":
		return "end_turn"
	case "length":
		return "max_tokens"
	case "content_filter":
		return "content_filter"
	case "tool_calls", "function_call":
		return "tool_use"
	default:
		return raw
	}
}
