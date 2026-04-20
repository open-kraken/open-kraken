package anthropic

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

// Config bundles the static settings of a Client. Zero-values apply
// sensible defaults, so callers only need to set APIKey in the common
// case.
type Config struct {
	// APIKey is the `x-api-key` value. Required.
	APIKey string

	// BaseURL overrides the default endpoint. Used by tests against
	// httptest.Server. Empty means "https://api.anthropic.com".
	BaseURL string

	// APIVersion is the `anthropic-version` header value. Empty defaults
	// to "2023-06-01" (the current stable API version).
	APIVersion string

	// HTTPClient is used for requests. Nil means net/http.DefaultClient
	// with a 60s timeout.
	HTTPClient *http.Client
}

// Client is a provider.LLMProvider for the Anthropic Messages API.
type Client struct {
	cfg        Config
	httpClient *http.Client
}

// New constructs a Client. Returns an error only when required fields are
// missing — no network call is made.
func New(cfg Config) (*Client, error) {
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("anthropic: APIKey is required")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.anthropic.com"
	}
	if cfg.APIVersion == "" {
		cfg.APIVersion = "2023-06-01"
	}
	hc := cfg.HTTPClient
	if hc == nil {
		hc = &http.Client{Timeout: 60 * time.Second}
	}
	return &Client{cfg: cfg, httpClient: hc}, nil
}

// Name implements provider.LLMProvider.
func (c *Client) Name() string { return "anthropic" }

// Complete implements provider.LLMProvider. It translates the Prompt into
// an Anthropic Messages API call and decodes the response back into the
// provider-neutral Completion type.
func (c *Client) Complete(ctx context.Context, p provider.Prompt) (*provider.Completion, error) {
	if p.Model == "" {
		return nil, provider.ErrUnknownModel
	}
	req, err := buildRequest(p)
	if err != nil {
		return nil, fmt.Errorf("anthropic: build request: %w", err)
	}
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("anthropic: marshal: %w", err)
	}

	url := c.cfg.BaseURL + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("anthropic: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.cfg.APIKey)
	httpReq.Header.Set("anthropic-version", c.cfg.APIVersion)

	start := time.Now()
	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("anthropic: http: %w", err)
	}
	defer httpResp.Body.Close()

	raw, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("anthropic: read body: %w", err)
	}
	latency := time.Since(start)

	if httpResp.StatusCode != http.StatusOK {
		return nil, classifyError(httpResp.StatusCode, raw)
	}

	var resp createResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		return nil, fmt.Errorf("anthropic: decode: %w", err)
	}

	return &provider.Completion{
		Content:    extractText(resp.Content),
		Model:      resp.Model,
		StopReason: normalizeStopReason(resp.StopReason),
		Usage: provider.TokenUsage{
			InputTokens:  resp.Usage.InputTokens,
			OutputTokens: resp.Usage.OutputTokens,
			TotalTokens:  resp.Usage.InputTokens + resp.Usage.OutputTokens,
			CostUSD:      costUSD(resp.Model, resp.Usage.InputTokens, resp.Usage.OutputTokens),
		},
		Raw:     raw,
		Latency: latency,
	}, nil
}

// classifyError turns a non-2xx response into one of provider's typed
// errors where possible, falling back to *provider.ErrUpstream.
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
			Message:    fmt.Sprintf("anthropic: status=%d body=%s", status, msg),
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
