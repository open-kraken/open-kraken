package openai

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
	c, err := New(Config{APIKey: "sk-test", BaseURL: baseURL})
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c
}

func TestClient_Complete_HappyPath(t *testing.T) {
	var got createRequest
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/chat/completions" {
			t.Errorf("path: %s", r.URL.Path)
		}
		if auth := r.Header.Get("Authorization"); auth != "Bearer sk-test" {
			t.Errorf("auth header: %q", auth)
		}
		body, _ := io.ReadAll(r.Body)
		if err := json.Unmarshal(body, &got); err != nil {
			t.Fatalf("decode: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(createResponse{
			ID:     "cmpl_01",
			Object: "chat.completion",
			Model:  "gpt-4o",
			Choices: []choice{{
				Index:        0,
				Message:      message{Role: roleAssistant, Content: "hello back"},
				FinishReason: "stop",
			}},
			Usage: usage{PromptTokens: 7, CompletionTokens: 3, TotalTokens: 10},
		})
	})

	c := newTestClient(t, srv.URL)
	resp, err := c.Complete(context.Background(), provider.Prompt{
		Model:  "gpt-4o",
		System: "you are concise",
		Messages: []provider.Message{
			{Role: provider.RoleUser, Content: "hello"},
		},
		MaxTokens: 64,
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	if resp.Content != "hello back" {
		t.Errorf("content: %q", resp.Content)
	}
	if resp.Model != "gpt-4o" {
		t.Errorf("model: %q", resp.Model)
	}
	if resp.StopReason != "end_turn" {
		t.Errorf("stop reason should map to end_turn, got %q", resp.StopReason)
	}
	if resp.Usage.InputTokens != 7 || resp.Usage.OutputTokens != 3 || resp.Usage.TotalTokens != 10 {
		t.Errorf("usage: %+v", resp.Usage)
	}
	if resp.Usage.CostUSD <= 0 {
		t.Errorf("cost should be >0 for gpt-4o, got %f", resp.Usage.CostUSD)
	}

	// System prompt folded into messages[0] with role=system.
	if len(got.Messages) < 2 || got.Messages[0].Role != roleSystem {
		t.Errorf("messages should start with system role: %+v", got.Messages)
	}
	if got.Messages[0].Content != "you are concise" {
		t.Errorf("system content: %q", got.Messages[0].Content)
	}
}

func TestClient_SystemFoldedFromMessageRole(t *testing.T) {
	var got createRequest
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		_ = json.NewEncoder(w).Encode(createResponse{
			Model: "gpt-4o-mini",
			Choices: []choice{{
				Message:      message{Role: roleAssistant, Content: "ok"},
				FinishReason: "stop",
			}},
		})
	})
	c := newTestClient(t, srv.URL)
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model: "gpt-4o-mini",
		Messages: []provider.Message{
			{Role: provider.RoleSystem, Content: "be brief"},
			{Role: provider.RoleUser, Content: "hi"},
		},
	})
	if err != nil {
		t.Fatalf("Complete: %v", err)
	}
	// Must appear exactly once, at index 0.
	systemCount := 0
	for _, m := range got.Messages {
		if m.Role == roleSystem {
			systemCount++
		}
	}
	if systemCount != 1 || got.Messages[0].Role != roleSystem {
		t.Errorf("system fold: %+v", got.Messages)
	}
}

func TestClient_ClassifiesErrors(t *testing.T) {
	cases := []struct {
		status int
		body   string
		want   error
	}{
		{http.StatusUnauthorized, `{"error":{"type":"invalid_request_error","message":"bad key"}}`, provider.ErrAuth},
		{http.StatusTooManyRequests, `{"error":{"type":"rate_limit","message":"slow"}}`, provider.ErrRateLimited},
		{http.StatusNotFound, `{"error":{"type":"not_found","message":"no model"}}`, provider.ErrUnknownModel},
	}
	for _, tc := range cases {
		t.Run(http.StatusText(tc.status), func(t *testing.T) {
			srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			})
			c := newTestClient(t, srv.URL)
			_, err := c.Complete(context.Background(), provider.Prompt{
				Model:    "gpt-4o",
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
		_, _ = w.Write([]byte(`boom`))
	})
	c := newTestClient(t, srv.URL)
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model:    "gpt-4o",
		Messages: []provider.Message{{Role: provider.RoleUser, Content: "hi"}},
	})
	var up *provider.ErrUpstream
	if !errors.As(err, &up) {
		t.Fatalf("want *ErrUpstream, got %T: %v", err, err)
	}
	if up.StatusCode != http.StatusInternalServerError {
		t.Errorf("status: %d", up.StatusCode)
	}
	if !strings.Contains(up.Message, "boom") {
		t.Errorf("message: %q", up.Message)
	}
}

func TestClient_RequiresAPIKey(t *testing.T) {
	if _, err := New(Config{}); err == nil {
		t.Fatal("want error on missing api key")
	}
}

func TestClient_EmptyChoicesIsError(t *testing.T) {
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(createResponse{Model: "gpt-4o", Choices: nil})
	})
	c := newTestClient(t, srv.URL)
	_, err := c.Complete(context.Background(), provider.Prompt{
		Model:    "gpt-4o",
		Messages: []provider.Message{{Role: provider.RoleUser, Content: "hi"}},
	})
	if err == nil || !strings.Contains(err.Error(), "no choices") {
		t.Errorf("want 'no choices' error, got %v", err)
	}
}

func TestClient_OrganizationHeader(t *testing.T) {
	srv := newStubServer(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("OpenAI-Organization") != "org-xyz" {
			t.Errorf("org header: %q", r.Header.Get("OpenAI-Organization"))
		}
		_ = json.NewEncoder(w).Encode(createResponse{
			Model:   "gpt-4o",
			Choices: []choice{{Message: message{Role: roleAssistant, Content: "hi"}, FinishReason: "stop"}},
		})
	})
	c, err := New(Config{APIKey: "sk-test", BaseURL: srv.URL, OrganizationID: "org-xyz"})
	if err != nil {
		t.Fatal(err)
	}
	_, _ = c.Complete(context.Background(), provider.Prompt{
		Model:    "gpt-4o",
		Messages: []provider.Message{{Role: provider.RoleUser, Content: "hi"}},
	})
}

func TestPricing_ZeroForUnknownModel(t *testing.T) {
	if got := costUSD("custom-model", 1_000_000, 1_000_000); got != 0 {
		t.Errorf("want 0 for unknown, got %f", got)
	}
}
