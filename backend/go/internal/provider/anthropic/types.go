package anthropic

// The native Messages API wire format. These types are intentionally
// private to the package; callers see provider.Prompt / Completion.

type messageRole string

const (
	roleUser      messageRole = "user"
	roleAssistant messageRole = "assistant"
)

type message struct {
	Role    messageRole `json:"role"`
	Content string      `json:"content"`
}

type createRequest struct {
	Model       string      `json:"model"`
	MaxTokens   int         `json:"max_tokens"`
	System      string      `json:"system,omitempty"`
	Messages    []message   `json:"messages"`
	Temperature *float64    `json:"temperature,omitempty"`
	Metadata    *reqMeta    `json:"metadata,omitempty"`
}

type reqMeta struct {
	UserID string `json:"user_id,omitempty"`
}

type contentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type usage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type createResponse struct {
	ID         string         `json:"id"`
	Type       string         `json:"type"`
	Role       messageRole    `json:"role"`
	Model      string         `json:"model"`
	Content    []contentBlock `json:"content"`
	StopReason string         `json:"stop_reason"`
	Usage      usage          `json:"usage"`
}

// errorBody is the shape Anthropic returns for 4xx/5xx responses.
type errorBody struct {
	Type  string `json:"type"`
	Error struct {
		Type    string `json:"type"`
		Message string `json:"message"`
	} `json:"error"`
}
