package logger

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestLoggerWritesJSON(t *testing.T) {
	var buf bytes.Buffer
	log := New(&buf, "test-service", LevelInfo)
	log.Info("hello world", WithFields("key", "value"))

	var entry Entry
	if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
		t.Fatalf("unmarshal log entry: %v", err)
	}
	if entry.Level != LevelInfo {
		t.Errorf("expected info level, got %s", entry.Level)
	}
	if entry.Service != "test-service" {
		t.Errorf("expected test-service, got %s", entry.Service)
	}
	if entry.Message != "hello world" {
		t.Errorf("expected 'hello world', got %s", entry.Message)
	}
	if entry.Fields["key"] != "value" {
		t.Errorf("expected field key=value, got %v", entry.Fields)
	}
}

func TestLoggerFiltersLevel(t *testing.T) {
	var buf bytes.Buffer
	log := New(&buf, "test", LevelWarn)
	log.Debug("should not appear")
	log.Info("should not appear")

	if buf.Len() > 0 {
		t.Fatalf("expected no output at warn level, got: %s", buf.String())
	}

	log.Warn("this should appear")
	if !strings.Contains(buf.String(), "this should appear") {
		t.Fatalf("expected warn to appear: %s", buf.String())
	}
}

func TestLoggerAllLevels(t *testing.T) {
	var buf bytes.Buffer
	log := New(&buf, "svc", LevelDebug)

	log.Debug("d")
	log.Info("i")
	log.Warn("w")
	log.Error("e")

	lines := strings.Split(strings.TrimSpace(buf.String()), "\n")
	if len(lines) != 4 {
		t.Fatalf("expected 4 log lines, got %d", len(lines))
	}
}

func TestDefaultLogger(t *testing.T) {
	log := Default("svc", "info")
	if log == nil {
		t.Fatal("expected non-nil logger")
	}
	// Verify it doesn't panic on write.
	log.Info("startup")
}

func TestWithFieldsHelper(t *testing.T) {
	fields := WithFields("a", 1, "b", "two")
	if fields["a"] != 1 || fields["b"] != "two" {
		t.Fatalf("unexpected fields: %v", fields)
	}
}
