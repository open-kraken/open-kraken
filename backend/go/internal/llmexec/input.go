package llmexec

import (
	"encoding/json"

	"open-kraken/backend/go/internal/provider"
)

// stepInput is the wire contract for steps.event_stream when a Step is
// dispatched through this executor. See package doc comment for the
// canonical shape.
type stepInput struct {
	Model       string    `json:"model,omitempty"`
	System      string    `json:"system,omitempty"`
	Messages    []inMsg   `json:"messages"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
}

type inMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// parseInput unmarshals the raw event_stream JSON with a forgiving
// policy: an empty body is treated as an empty envelope so the error is
// "no messages" rather than "unexpected EOF".
func parseInput(raw []byte) (stepInput, error) {
	var in stepInput
	if len(raw) == 0 {
		return in, nil
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return stepInput{}, err
	}
	return in, nil
}

// appendAssistant returns a copy of the input with an assistant turn
// appended. The result is what llmexec serialises back into
// steps.event_stream so the next Step (or the UI) sees the full thread.
func (in stepInput) appendAssistant(content string) stepInput {
	out := in
	out.Messages = make([]inMsg, len(in.Messages), len(in.Messages)+1)
	copy(out.Messages, in.Messages)
	out.Messages = append(out.Messages, inMsg{
		Role:    string(provider.RoleAssistant),
		Content: content,
	})
	return out
}

// toProviderMessages converts the wire representation to the
// provider-neutral Message slice. Unknown roles fall through unchanged;
// the provider layer is responsible for the final reconciliation.
func toProviderMessages(msgs []inMsg) []provider.Message {
	out := make([]provider.Message, 0, len(msgs))
	for _, m := range msgs {
		out = append(out, provider.Message{
			Role:    provider.Role(m.Role),
			Content: m.Content,
		})
	}
	return out
}
