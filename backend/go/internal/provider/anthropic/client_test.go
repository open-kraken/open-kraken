package anthropic

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"open-kraken/backend/go/internal/provider"
)

func newStubServer(t *testing.T, h http.HandlerFunc) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	return srv
}

func newTestClient(t *testing.T, baseURL string) *Client {
	t.Helper()
	c, err := New(Config{APIKey: "k-dev", BaseURL: baseURL})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestClient_Complete_HappyPath(t *testing.T) {
	var got createRequest
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/messages" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if r.Header.Get("x-api-key") != "k-dev" {
			t.Errorf("missing x-api-key: %s", r.Header.Get("x-api-key"))
		}
		if r.Header.Get("anthropic-version") == "" {
			t.Errorf("missing anthropic-version")
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(createResponse{
			ID:    "msg_01",
			Type:  "message",
			Role:  roleAssistant,
			Model: "claude-opus-4-7",
			Content: []contentBlock{
				{Type: "text", Text: "hi there"},
			},
			StopReason: "end_turn",
			Usage:      usage{InputTokens: 10, OutputTokens: 3},
		})
	})

	c := newTestClient(t, srv.URL)
	resp, err := c.Complete(context.Background(), provider.Prompt{
		Model:  "claude-opus-4-7",
		System: "you are concise",
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "hello"},
		},
		MaxTokens: 64,
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if resp.Content != "hi there" {
		t.Errorf("content: %q", resp.Content)
	}
	if resp.Model != "claude-opus-4-7" {
		t.Errorf("model: %q", resp.Model)
	}
	if resp.StopReason != "end_turn" {
		t.Errorf("stop reason: %q", resp.StopReason)
	}
	if resp.Usage.InputTokens != 10 || resp.Usage.OutputTokens != 3 || resp.Usage.TotalTokens != 13 {
		t.Errorf("usage: %+v", resp.Usage)
	}
	// Cost should be non-zero for a priced model.
	if resp.Usage.CostUSD <= 0 {
		t.Errorf("cost should be >0 for claude-opus-4-7, got %f", resp.Usage.CostUSD)
	}
	if got.System != "you are concise" {
		t.Errorf("system not mapped: %q", got.System)
	}
	if len(got.Messages) != 1 || got.Messages[0].Role != roleUser {
		t.Errorf("messages mapping: %+v", got.Messages)
	}
}

func TestClient_SystemRoleFoldedFromMessages(t *testing.T) {
	// When Prompt.System is empty but Messages has a system-role entry,
	// the adapter folds it into req.System and drops it from Messages.
	var got createRequest
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		_ = json.NewEncoder(w).Encode(createResponse{
			Model:      "claude-haiku-4-5",
			Content:    []contentBlock{{Type: "text", Text: "ok"}},
			StopReason: "end_turn",
		})
	})
	c := newTestClient(t, srv.URL)
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model: "claude-haiku-4-5",
		Messages: []provider.Message{
			{Role: provider.RoleSystem, Content: "be brief"},
			{Role: provider.RoleUser, Content: "hi"},
		},
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if got.System != "be brief" {
		t.Errorf("system not folded: %q", got.System)
	}
	if len(got.Messages) != 1 {
		t.Errorf("system message should be stripped; got %+v", got.Messages)
	}
}

func TestClient_ClassifiesErrors(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   error
	}{
		{http.StatusUnauthorized, `{"type":"error","error":{"type":"authentication_error","message":"bad key"}}`, provider.ErrAuth},
		{http.StatusTooManyRequests, `{"type":"error","error":{"type":"rate_limit","message":"slow down"}}`, provider.ErrRateLimited},
		{http.StatusNotFound, `{"type":"error","error":{"type":"not_found","message":"unknown model"}}`, provider.ErrUnknownModel},
	}
	for _, tc := range cases {
		t.Run(http.StatusText(tc.status), func(t *testing.T) {
			srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			})
			c := newTestClient(t, srv.URL)
			_, err := c.Complete(context.Background(), provider.Prompt{
				Model:    "claude-opus-4-7",
				Messages: []provider.Message{{Role: provider.RoleUser, Content: "hi"}},
			})
			if !errors.Is(err, tc.want) {
				t.Errorf("want %v, got %v", tc.want, err)
			}
		})
	}
}

func TestClient_UpstreamError(t *testing.T) {
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`internal error`))
	})
	c := newTestClient(t, srv.URL)
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model:    "claude-opus-4-7",
		Messages: []provider.Message{{Role: provider.RoleUser, Content: "hi"}},
	})
	var up *provider.ErrUpstream
	if !errors.As(err, &up) {
		t.Fatalf("want *ErrUpstream, got %T: %v", err, err)
	}
	if up.StatusCode != http.StatusInternalServerError {
		t.Errorf("status: %d", up.StatusCode)
	}
	if !strings.Contains(up.Message, "internal error") {
		t.Errorf("message: %q", up.Message)
	}
}

func TestClient_RequiresAPIKey(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Fatal("want error on missing api key")
	}
}

func TestClient_UnknownModelLocalGuard(t *testing.T) {
	c := newTestClient(t, "http://never-called")
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model: "",
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "hi"},
		},
	})
	if !errors.Is(err, provider.ErrUnknownModel) {
		t.Errorf("want ErrUnknownModel for empty model, got %v", err)
	}
}

func TestPricing_ZeroForUnknownModel(t *testing.T) {
	if got := costUSD("not-a-model", 1_000_000, 1_000_000); got != 0 {
		t.Errorf("want 0 for unknown, got %f", got)
	}
}
