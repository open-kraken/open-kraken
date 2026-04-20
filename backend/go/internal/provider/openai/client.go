package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"open-kraken/backend/go/internal/provider"
)

// Config bundles static settings for a Client.
type Config struct {
	// APIKey is the bearer token (`Authorization: Bearer ...`). Required.
	APIKey string

	// BaseURL overrides the default endpoint. Used by tests against
	// httptest.Server. Empty means "https://api.openai.com".
	BaseURL string

	// OrganizationID optionally sets the `OpenAI-Organization` header
	// for accounts with multiple orgs.
	OrganizationID string

	// HTTPClient is used for requests. Nil means a fresh client with a
	// 60s timeout.
	HTTPClient *http.Client
}

// Client is a provider.LLMProvider for the OpenAI Chat Completions API.
type Client struct {
	cfg        Config
	httpClient *http.Client
}

// New constructs a Client. Returns an error when required fields are
// missing; no network call is made.
func New(cfg Config) (*Client, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("openai: APIKey is required")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.openai.com"
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	return &Client{cfg: cfg, httpClient: hc}, nil
}

// Name implements provider.LLMProvider.
func (c *Client) Name() string { return "openai" }

// Complete implements provider.LLMProvider.
func (c *Client) Complete(ctx context.Context, p provider.Prompt) (*provider.Completion, error) {
	if p.Model == "" {
		return nil, provider.ErrUnknownModel
	}
	req, err := buildRequest(p)
	if err != nil {
		return nil, fmt.Errorf("openai: build request: %w", err)
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("openai: marshal: %w", err)
	}

	url := c.cfg.BaseURL + "/v1/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("openai: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	if c.cfg.OrganizationID != "" {
		httpReq.Header.Set("OpenAI-Organization", c.cfg.OrganizationID)
	}

	start := time.Now()
	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("openai: http: %w", err)
	}
	defer httpResp.Body.Close()

	raw, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("openai: read body: %w", err)
	}
	latency := time.Since(start)

	if httpResp.StatusCode != http.StatusOK {
		return nil, classifyError(httpResp.StatusCode, raw)
	}

	var resp createResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("openai: decode: %w", err)
	}
	if len(resp.Choices) == 0 {
		return nil, fmt.Errorf("openai: response has no choices")
	}

	first := resp.Choices[0]
	return &provider.Completion{
		Content:    first.Message.Content,
		Model:      resp.Model,
		StopReason: normalizeStopReason(first.FinishReason),
		Usage: provider.TokenUsage{
			InputTokens:  resp.Usage.PromptTokens,
			OutputTokens: resp.Usage.CompletionTokens,
			TotalTokens:  resp.Usage.TotalTokens,
			CostUSD:      costUSD(resp.Model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens),
		},
		Raw:     raw,
		Latency: latency,
	}, nil
}

func classifyError(status int, body []byte) error {
	msg := extractErrorMessage(body)
	switch status {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Errorf("%w: status=%d body=%s", provider.ErrAuth, status, msg)
	case http.StatusTooManyRequests:
		return fmt.Errorf("%w: status=%d body=%s", provider.ErrRateLimited, status, msg)
	case http.StatusNotFound:
		return fmt.Errorf("%w: status=%d body=%s", provider.ErrUnknownModel, status, msg)
	default:
		return &provider.ErrUpstream{
			StatusCode: status,
			Message:    fmt.Sprintf("openai: status=%d body=%s", status, msg),
		}
	}
}

func extractErrorMessage(body []byte) string {
	var e errorBody
	if err := json.Unmarshal(body, &e); err == nil && e.Error.Message != "" {
		return e.Error.Message
	}
	if len(body) > 256 {
		return string(body[:256]) + "…"
	}
	return string(body)
}
