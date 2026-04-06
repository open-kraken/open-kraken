// Package logger provides structured JSON logging for open-kraken.
package logger

import (
	"encoding/json"
	"io"
	"os"
	"sync"
	"time"
)

// Level represents a log severity level.
type Level string

const (
	LevelDebug Level = "debug"
	LevelInfo  Level = "info"
	LevelWarn  Level = "warn"
	LevelError Level = "error"
)

var levelPriority = map[Level]int{
	LevelDebug: 0,
	LevelInfo:  1,
	LevelWarn:  2,
	LevelError: 3,
}

// Logger writes structured JSON log entries.
type Logger struct {
	mu       sync.Mutex
	w        io.Writer
	minLevel int
	service  string
}

// New creates a Logger that writes to w at the given minimum level.
func New(w io.Writer, service string, minLevel Level) *Logger {
	return &Logger{
		w:        w,
		minLevel: levelPriority[minLevel],
		service:  service,
	}
}

// Default creates a Logger writing to stderr at the given level.
func Default(service, level string) *Logger {
	l := Level(level)
	if _, ok := levelPriority[l]; !ok {
		l = LevelInfo
	}
	return New(os.Stderr, service, l)
}

// Entry represents a single structured log record.
type Entry struct {
	Time      string         `json:"time"`
	Level     Level          `json:"level"`
	Service   string         `json:"service"`
	Message   string         `json:"msg"`
	RequestID string         `json:"requestId,omitempty"`
	Method    string         `json:"method,omitempty"`
	Path      string         `json:"path,omitempty"`
	Status    int            `json:"status,omitempty"`
	Duration  int64          `json:"durationMs,omitempty"`
	Error     string         `json:"error,omitempty"`
	Fields    map[string]any `json:"fields,omitempty"`
}

func (lg *Logger) log(level Level, msg string, fields map[string]any) {
	if levelPriority[level] < lg.minLevel {
		return
	}
	entry := Entry{
		Time:    time.Now().UTC().Format(time.RFC3339),
		Level:   level,
		Service: lg.service,
		Message: msg,
		Fields:  fields,
	}
	data, err := json.Marshal(entry)
	if err != nil {
		return
	}
	data = append(data, '\n')
	lg.mu.Lock()
	_, _ = lg.w.Write(data)
	lg.mu.Unlock()
}

// Debug logs at debug level.
func (lg *Logger) Debug(msg string, fields ...map[string]any) {
	lg.log(LevelDebug, msg, mergeFields(fields))
}

// Info logs at info level.
func (lg *Logger) Info(msg string, fields ...map[string]any) {
	lg.log(LevelInfo, msg, mergeFields(fields))
}

// Warn logs at warn level.
func (lg *Logger) Warn(msg string, fields ...map[string]any) {
	lg.log(LevelWarn, msg, mergeFields(fields))
}

// Error logs at error level.
func (lg *Logger) Error(msg string, fields ...map[string]any) {
	lg.log(LevelError, msg, mergeFields(fields))
}

// WithFields returns a map for use as structured log fields.
func WithFields(kvs ...any) map[string]any {
	m := make(map[string]any, len(kvs)/2)
	for i := 0; i+1 < len(kvs); i += 2 {
		if key, ok := kvs[i].(string); ok {
			m[key] = kvs[i+1]
		}
	}
	return m
}

func mergeFields(fields []map[string]any) map[string]any {
	if len(fields) == 0 {
		return nil
	}
	return fields[0]
}
