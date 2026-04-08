// Package observability configures OpenTelemetry export to Langfuse (OTLP/HTTP)
// when OPEN_KRAKEN_OTEL_* / Langfuse keys are set. See docs/observability/langfuse-integration.md.
package observability

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"sync/atomic"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"

	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
)

const langfuseIngestionHeader = "4"

// httpTracing is set true after successful InitTracer (used to wrap HTTP with otelhttp).
var httpTracing atomic.Bool

// HTTPTracingEnabled reports whether the OTLP exporter and TracerProvider are active.
func HTTPTracingEnabled() bool {
	return httpTracing.Load()
}

// InitTracer configures the global TracerProvider and OTLP HTTP exporter to Langfuse
// when cfg.TracingEnabled. Returns a shutdown function (may be nil).
func InitTracer(ctx context.Context, cfg runtimecfg.Config) (func(context.Context) error, error) {
	if !cfg.TracingEnabled {
		return nil, nil
	}

	endpointURL := normalizeTracesURL(cfg.OTELTracesEndpoint)
	auth := base64.StdEncoding.EncodeToString(
		[]byte(strings.TrimSpace(cfg.LangfusePublicKey) + ":" + strings.TrimSpace(cfg.LangfuseSecretKey)),
	)

	exp, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpointURL(endpointURL),
		otlptracehttp.WithHeaders(map[string]string{
			"Authorization":                "Basic " + auth,
			"x-langfuse-ingestion-version": langfuseIngestionHeader,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: otlp http exporter: %w", err)
	}

	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(cfg.ServiceName),
			semconv.ServiceVersionKey.String("open-kraken"),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("observability: resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
		sdktrace.WithSampler(sdktrace.ParentBased(sdktrace.AlwaysSample())),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	httpTracing.Store(true)
	return tp.Shutdown, nil
}

// normalizeTracesURL ensures the OTLP HTTP traces path Langfuse expects.
func normalizeTracesURL(raw string) string {
	s := strings.TrimSpace(raw)
	s = strings.TrimSuffix(s, "/")
	if strings.HasSuffix(s, "/v1/traces") {
		return s
	}
	// Langfuse base is often .../api/public/otel — append /v1/traces per OTLP HTTP.
	return s + "/v1/traces"
}

// WrapHTTP wraps the handler with otelhttp when tracing is enabled (after successful InitTracer).
func WrapHTTP(handler http.Handler, enabled bool) http.Handler {
	if !enabled {
		return handler
	}
	return otelhttp.NewHandler(handler, "open-kraken",
		otelhttp.WithFilter(func(r *http.Request) bool {
			p := r.URL.Path
			return p != "/healthz" && p != "/metrics"
		}),
	)
}
