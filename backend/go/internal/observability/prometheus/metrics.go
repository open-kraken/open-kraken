// Package prometheus registers the metric set named in paper §6.1 and exposes
// them on a /metrics HTTP endpoint. The metric names must match what the
// Prometheus scrape config and Grafana dashboards expect:
//
//   agent_steps_total{provider,workload_class,regime,state}
//   ucb_arm_selection_total{agent_type,provider,workload_class}
//   provider_cost_usd_total{provider,tenant_id}
//   etcd_lease_expiry_total{reason}
//   wal_write_latency_seconds               (histogram)
//   scheduling_score_histogram{workload_class}
//
// All metrics are registered on a private Registry so they don't clash with
// the legacy OTel instrumentation in internal/observability/tracing.go.
package prometheus

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics is the set of paper §6.1 metric handles.
type Metrics struct {
	Registry *prometheus.Registry

	AgentStepsTotal      *prometheus.CounterVec
	UCBArmSelectionTotal *prometheus.CounterVec
	ProviderCostUSDTotal *prometheus.CounterVec
	EtcdLeaseExpiryTotal *prometheus.CounterVec
	WALWriteLatency      prometheus.Histogram
	SchedulingScoreHisto *prometheus.HistogramVec
}

// New registers the metric set on a fresh Registry.
func New() *Metrics {
	reg := prometheus.NewRegistry()

	// Standard Go runtime metrics are useful even in dev.
	reg.MustRegister(collectors.NewGoCollector())
	reg.MustRegister(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))

	m := &Metrics{Registry: reg}

	m.AgentStepsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "agent_steps_total",
		Help: "Total number of AEL Step state transitions, labelled by terminal state.",
	}, []string{"provider", "workload_class", "regime", "state"})

	m.UCBArmSelectionTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "ucb_arm_selection_total",
		Help: "Total number of times a (agent_type, provider, workload_class) arm was selected by CWS.",
	}, []string{"agent_type", "provider", "workload_class"})

	m.ProviderCostUSDTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "provider_cost_usd_total",
		Help: "Cumulative USD cost accrued per provider per tenant (Run.cost_usd).",
	}, []string{"provider", "tenant_id"})

	m.EtcdLeaseExpiryTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "etcd_lease_expiry_total",
		Help: "Count of Step Lease expiry events observed on the etcd watch channel.",
	}, []string{"reason"})

	m.WALWriteLatency = prometheus.NewHistogram(prometheus.HistogramOpts{
		Name:    "wal_write_latency_seconds",
		Help:    "Latency of AEL T2 commit transactions (PostgreSQL serializable write path).",
		Buckets: prometheus.ExponentialBuckets(0.001, 2, 12), // 1ms .. ~4s
	})

	m.SchedulingScoreHisto = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "scheduling_score_histogram",
		Help:    "CWS score for the winning arm, per workload_class.",
		Buckets: prometheus.LinearBuckets(-1, 0.1, 21), // -1 .. 1
	}, []string{"workload_class"})

	reg.MustRegister(
		m.AgentStepsTotal,
		m.UCBArmSelectionTotal,
		m.ProviderCostUSDTotal,
		m.EtcdLeaseExpiryTotal,
		m.WALWriteLatency,
		m.SchedulingScoreHisto,
	)
	return m
}

// ObserveWALWrite records the latency of a T2 commit.
func (m *Metrics) ObserveWALWrite(d time.Duration) {
	m.WALWriteLatency.Observe(d.Seconds())
}

// --- HTTP listener ---

// Listener is an independent HTTP server that exposes /metrics on its own
// addr. This keeps the scrape path separate from the main application HTTP
// server so a stuck handler in the API layer never blocks metrics collection.
type Listener struct {
	srv  *http.Server
	once sync.Once
}

// NewListener constructs a Listener bound to addr that serves the given
// Metrics registry on /metrics. An empty addr disables the listener.
func NewListener(addr string, m *Metrics) *Listener {
	if addr == "" {
		return &Listener{}
	}
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(m.Registry, promhttp.HandlerOpts{
		EnableOpenMetrics: true,
	}))
	return &Listener{
		srv: &http.Server{
			Addr:              addr,
			Handler:           mux,
			ReadHeaderTimeout: 5 * time.Second,
		},
	}
}

// Start runs the metrics HTTP server in a goroutine. Calling Start on a
// disabled Listener (empty addr) is a no-op.
func (l *Listener) Start() {
	if l.srv == nil {
		return
	}
	l.once.Do(func() {
		go func() {
			if err := l.srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
				// Metrics server failure is non-fatal — log would be wired
				// up by the caller.
				_ = err
			}
		}()
	})
}

// Stop gracefully shuts down the listener.
func (l *Listener) Stop(ctx context.Context) error {
	if l.srv == nil {
		return nil
	}
	return l.srv.Shutdown(ctx)
}
