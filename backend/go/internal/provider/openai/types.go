package openai

// Native Chat Completions wire format. Private to the package —
// callers see only provider.Prompt / provider.Completion.

type messageRole string

const (
	roleSystem    messageRole = "system"
	roleUser      messageRole = "user"
	roleAssistant messageRole = "assistant"
	roleTool      messageRole = "tool"
)

type message struct {
	Role    messageRole `json:"role"`
	Content string      `json:"content"`
}

type createRequest struct {
	Model       string    `json:"model"`
	Messages    []message `json:"messages"`
	MaxTokens   int       `json:"max_tokens,omitempty"`
	Temperature *float64  `json:"temperature,omitempty"`
	User        string    `json:"user,omitempty"`
}

type usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

type choice struct {
	Index        int     `json:"index"`
	Message      message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type createResponse struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []choice `json:"choices"`
	Usage   usage    `json:"usage"`
}

// errorBody mirrors OpenAI's 4xx/5xx error envelope.
type errorBody struct {
	Error struct {
		Type    string `json:"type"`
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}
