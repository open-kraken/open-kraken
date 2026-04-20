package runtime

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	defaultHTTPAddr    = "127.0.0.1:8080"
	defaultAPIBasePath = "/api/v1"
	defaultWSPath      = "/ws"
	defaultDataRoot    = "./.open-kraken-data"
	defaultLogLevel    = "info"
	defaultWebDistDir  = "./web/dist"
)

type Config struct {
	ServiceName   string
	HTTPAddr      string
	APIBasePath   string
	WSPath        string
	AppDataRoot   string
	WorkspaceRoot string
	// SkillRoot is the directory that the skill loader scans for .md skill files.
	SkillRoot  string
	LogLevel   string
	WebDistDir string
	// WSAllowAnyOrigin disables WebSocket Origin validation (development only).
	WSAllowAnyOrigin bool
	// WSAllowedOrigins lists extra permitted Origin values (full URL, e.g. http://localhost:5173).
	WSAllowedOrigins []string
	// JWTSecret is the HMAC-SHA256 signing key for JWT authentication.
	// When empty, JWT auth middleware is disabled (development mode).
	JWTSecret string
	// RateLimitRPS is the per-IP rate limit in requests per second. 0 disables.
	RateLimitRPS int
	// OTELTracesEndpoint is the full OTLP/HTTP URL for traces (e.g. Langfuse …/api/public/otel/v1/traces).
	OTELTracesEndpoint string
	// LangfusePublicKey and LangfuseSecretKey are used for Basic auth on the OTLP exporter (server-side only).
	LangfusePublicKey string
	LangfuseSecretKey string
	// TracingEnabled is true when endpoint and both Langfuse keys are non-empty (export to Langfuse via OTLP).
	TracingEnabled bool

	// --- Paper §3.2 storage stack (Phase 0+).
	// All of these are empty-means-disabled: a dev deployment without PostgreSQL/etcd
	// continues to work on the legacy SQLite/JSON path until Phase 1 makes the new
	// path the default. Production deployments must set these to the real endpoints.

	// PostgresDSN is the connection string for the Authoritative Execution Ledger (AEL)
	// and all other relational state. When empty, AEL features are disabled and the
	// legacy ledger/memory/tokentrack SQLite files are used.
	PostgresDSN string
	// EtcdEndpoints is a comma-separated list of etcd client URLs used for Step Lease
	// coordination, node heartbeats, and leader election. When empty, distributed
	// step leasing is disabled (single-node mode using the in-memory fallback).
	EtcdEndpoints []string
	// PrometheusAddr is the host:port for the Prometheus metrics scrape endpoint.
	// When empty, metrics registration still happens but no HTTP listener is started.
	PrometheusAddr string

	// --- LLM provider (paper §5.4 agent runtime executor) ---
	//
	// LLMProviders is the comma-separated list of provider backends the
	// FlowScheduler activates. Known values today: "anthropic",
	// "openai". Empty falls back to NoopExecutor so CI / offline dev
	// keep working. Each entry still needs its own credential env var
	// (see below).
	LLMProviders []string
	// AnthropicAPIKey is the Anthropic credential. `ANTHROPIC_API_KEY`
	// is accepted as a fallback for the upstream SDK convention; the
	// legacy `OPEN_KRAKEN_LLM_API_KEY` is also honoured for a single-
	// provider deployment.
	AnthropicAPIKey string
	// OpenAIAPIKey is the OpenAI credential. `OPENAI_API_KEY` is the
	// fallback to match the upstream SDK convention.
	OpenAIAPIKey string
	// LLMDefaultModel is the model used when a Step's event_stream does
	// not specify one. Empty means Steps must set model explicitly.
	LLMDefaultModel string
	// LLMDefaultProvider is the provider key llmexec routes to when a
	// Step arrives without one set. Defaults to the first entry of
	// LLMProviders when empty.
	LLMDefaultProvider string

	// --- CWS budget awareness (paper §5.2.6 tail) ---
	//
	// CWSCostAlpha is the cost-sensitivity weight of the CWS reward
	// model in [0, 1]. 0 = pure success-driven (same as pre-budget
	// DefaultRewardModel). 1 = reward scales linearly with (1 -
	// cost/baseline). Zero or unset → DefaultRewardModel.
	CWSCostAlpha float64
	// CWSCostBaselineUSD is the per-Step cost at which the cost
	// penalty fully applies. Zero or unset → DefaultRewardModel.
	CWSCostBaselineUSD float64

	// RetryMaxAttempts caps the retry chain length per Step (paper
	// §5.3). 0 or negative disables automatic retries; a failed Step
	// immediately propagates into the Flow / Run terminal state.
	// Reasonable default is 3 — transient provider failures usually
	// clear in under that.
	RetryMaxAttempts int
}

func Load() (Config, error) {
	cfg := Config{
		ServiceName:   "open-kraken-backend",
		HTTPAddr:      firstNonEmpty(os.Getenv("OPEN_KRAKEN_HTTP_ADDR"), os.Getenv("OPEN_KRAKEN_ADDR"), defaultHTTPAddr),
		APIBasePath:   normalizePath(firstNonEmpty(os.Getenv("OPEN_KRAKEN_API_BASE_PATH"), defaultAPIBasePath)),
		WSPath:        normalizePath(firstNonEmpty(os.Getenv("OPEN_KRAKEN_WS_PATH"), defaultWSPath)),
		AppDataRoot:   firstNonEmpty(os.Getenv("OPEN_KRAKEN_APP_DATA_ROOT"), defaultDataRoot),
		WorkspaceRoot: firstNonEmpty(os.Getenv("OPEN_KRAKEN_WORKSPACE_ROOT"), "."),
		LogLevel:      strings.ToLower(firstNonEmpty(os.Getenv("OPEN_KRAKEN_LOG_LEVEL"), defaultLogLevel)),
		WebDistDir:    firstNonEmpty(os.Getenv("OPEN_KRAKEN_WEB_DIST_DIR"), defaultWebDistDir),
	}
	cfg.WSAllowAnyOrigin = parseBoolEnv("OPEN_KRAKEN_WS_ALLOW_ANY_ORIGIN")
	cfg.WSAllowedOrigins = splitComma(os.Getenv("OPEN_KRAKEN_WS_ALLOWED_ORIGINS"))
	cfg.JWTSecret = os.Getenv("OPEN_KRAKEN_JWT_SECRET")
	cfg.RateLimitRPS = parseIntEnv("OPEN_KRAKEN_RATE_LIMIT_RPS", 0)

	cfg.OTELTracesEndpoint = strings.TrimSpace(firstNonEmpty(
		os.Getenv("OPEN_KRAKEN_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"),
		os.Getenv("OPEN_KRAKEN_OTEL_EXPORTER_OTLP_ENDPOINT"),
	))
	cfg.LangfusePublicKey = strings.TrimSpace(os.Getenv("OPEN_KRAKEN_LANGFUSE_PUBLIC_KEY"))
	cfg.LangfuseSecretKey = strings.TrimSpace(os.Getenv("OPEN_KRAKEN_LANGFUSE_SECRET_KEY"))
	cfg.TracingEnabled = cfg.OTELTracesEndpoint != "" && cfg.LangfusePublicKey != "" && cfg.LangfuseSecretKey != ""

	cfg.PostgresDSN = strings.TrimSpace(os.Getenv("OPEN_KRAKEN_POSTGRES_DSN"))
	cfg.EtcdEndpoints = splitComma(os.Getenv("OPEN_KRAKEN_ETCD_ENDPOINTS"))
	cfg.PrometheusAddr = strings.TrimSpace(os.Getenv("OPEN_KRAKEN_PROMETHEUS_ADDR"))

	cfg.LLMProviders = parseProviderList(os.Getenv("OPEN_KRAKEN_LLM_PROVIDER"))
	cfg.AnthropicAPIKey = strings.TrimSpace(firstNonEmpty(
		os.Getenv("ANTHROPIC_API_KEY"),
		os.Getenv("OPEN_KRAKEN_LLM_API_KEY"),
	))
	cfg.OpenAIAPIKey = strings.TrimSpace(firstNonEmpty(
		os.Getenv("OPENAI_API_KEY"),
		os.Getenv("OPEN_KRAKEN_OPENAI_API_KEY"),
	))
	cfg.LLMDefaultModel = strings.TrimSpace(os.Getenv("OPEN_KRAKEN_LLM_DEFAULT_MODEL"))
	cfg.LLMDefaultProvider = strings.ToLower(strings.TrimSpace(os.Getenv("OPEN_KRAKEN_LLM_DEFAULT_PROVIDER")))
	if cfg.LLMDefaultProvider == "" && len(cfg.LLMProviders) > 0 {
		cfg.LLMDefaultProvider = cfg.LLMProviders[0]
	}

	cfg.CWSCostAlpha = parseFloatEnv("OPEN_KRAKEN_CWS_COST_ALPHA")
	cfg.CWSCostBaselineUSD = parseFloatEnv("OPEN_KRAKEN_CWS_COST_BASELINE_USD")

	cfg.RetryMaxAttempts = parseIntEnv("OPEN_KRAKEN_RETRY_MAX_ATTEMPTS", 3)

	if cfg.APIBasePath == cfg.WSPath {
		return Config{}, fmt.Errorf("OPEN_KRAKEN_API_BASE_PATH and OPEN_KRAKEN_WS_PATH must be distinct")
	}
	if err := os.MkdirAll(cfg.AppDataRoot, 0o755); err != nil {
		return Config{}, fmt.Errorf("create OPEN_KRAKEN_APP_DATA_ROOT %q: %w", cfg.AppDataRoot, err)
	}
	absDataRoot, err := filepath.Abs(cfg.AppDataRoot)
	if err != nil {
		return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_APP_DATA_ROOT %q: %w", cfg.AppDataRoot, err)
	}
	cfg.AppDataRoot = absDataRoot

	if skillRoot := strings.TrimSpace(os.Getenv("OPEN_KRAKEN_SKILL_ROOT")); skillRoot != "" {
		absSkillRoot, err := filepath.Abs(skillRoot)
		if err != nil {
			return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_SKILL_ROOT %q: %w", skillRoot, err)
		}
		cfg.SkillRoot = absSkillRoot
	} else {
		cfg.SkillRoot = filepath.Join(cfg.AppDataRoot, "skills")
	}

	absWorkspaceRoot, err := filepath.Abs(cfg.WorkspaceRoot)
	if err != nil {
		return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_WORKSPACE_ROOT %q: %w", cfg.WorkspaceRoot, err)
	}
	cfg.WorkspaceRoot = absWorkspaceRoot

	if cfg.WebDistDir != "" {
		absWebDistDir, err := filepath.Abs(cfg.WebDistDir)
		if err != nil {
			return Config{}, fmt.Errorf("resolve OPEN_KRAKEN_WEB_DIST_DIR %q: %w", cfg.WebDistDir, err)
		}
		cfg.WebDistDir = absWebDistDir
	}

	return cfg, nil
}

func parseBoolEnv(key string) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return v == "1" || v == "true" || v == "yes"
}

func parseIntEnv(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	var n int
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil {
		return fallback
	}
	return n
}

// parseProviderList splits a comma-separated provider name list and
// lower-cases each entry so callers can compare case-insensitively.
// Empty input produces nil (callers treat that as "disabled").
func parseProviderList(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" {
			continue
		}
		if _, ok := seen[p]; ok {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	return out
}

func parseFloatEnv(key string) float64 {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return 0
	}
	var f float64
	if _, err := fmt.Sscanf(raw, "%f", &f); err != nil {
		return 0
	}
	return f
}

func splitComma(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func normalizePath(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || trimmed == "/" {
		return "/"
	}
	return "/" + strings.Trim(strings.TrimSpace(trimmed), "/")
}
