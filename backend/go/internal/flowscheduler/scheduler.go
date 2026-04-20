package flowscheduler

import (
	"context"
	"errors"
	"sync"
	"time"

	"open-kraken/backend/go/internal/cws"
	"open-kraken/backend/go/internal/estimator"
	okprometheus "open-kraken/backend/go/internal/observability/prometheus"
	"open-kraken/backend/go/internal/platform/logger"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/stepLease"
	"open-kraken/backend/go/internal/verifier"
)

// Config controls the scheduler's polling behaviour and timeouts. Every
// field has a safe default when zero-valued.
type Config struct {
	// NodeID is the identifier recorded on the Step Lease. Defaults to
	// "node-local" when empty.
	NodeID string

	// TenantID filters the pending-steps query. Empty = all tenants.
	TenantID string

	// PollInterval is the gap between two tick cycles. Default 500ms.
	PollInterval time.Duration

	// BatchSize caps how many pending Steps a single tick will attempt.
	// Default 16.
	BatchSize int

	// LeaseTTL is the TTL handed to stepLease.Acquire. Must be larger
	// than the expected Step duration. Default 60s.
	LeaseTTL time.Duration

	// KeepaliveInterval is the gap between periodic Lease keepalives
	// sent while a Step is executing. Must be < LeaseTTL. Zero derives
	// it as LeaseTTL / 3 so the scheduler still has two retry windows
	// before the lease would otherwise expire. Negative disables the
	// keepalive loop (used by tests that exercise T4).
	KeepaliveInterval time.Duration

	// ExecutionTimeout bounds a single StepExecutor.Execute call. It is
	// derived from LeaseTTL when zero (LeaseTTL / 2).
	ExecutionTimeout time.Duration

	// ExpiryScanInterval controls how often T4 runs. Default 30s.
	// Zero disables the scanner.
	ExpiryScanInterval time.Duration

	// Selector optionally enables CWS arm routing. When non-nil, the
	// scheduler calls Selector.Pick for any Step that arrives without
	// an explicit Provider, writes the chosen arm back to AEL, and
	// records a reward after T2 commit.
	//
	// Nil Selector = pre-CWS behaviour (Step's existing Provider is used
	// as-is; Steps without a Provider still fail when the executor
	// refuses them).
	Selector cws.Selector

	// Verifiers optionally enables the VerificationCallback path from
	// paper §5.2.2. When non-nil and the Step's regime is VERIFIABLE,
	// the scheduler looks up a Verifier for (regime, workload_class)
	// after T2 commit and feeds the resulting signal to the CWS reward.
	//
	// Nil (or NilRegistry{}) disables verification — the scheduler then
	// behaves as before and the reward collapses to the success
	// indicator.
	Verifiers verifier.Registry

	// Estimator optionally forecasts a Step's token cost at dispatch
	// time so T1 can debit the Run's token_budget. Nil preserves the
	// pre-estimator behaviour (EstimatedTokens = 0 → T1 skips the
	// budget check).
	Estimator estimator.Estimator

	// Retry controls automatic Step re-enqueue on failure (paper
	// §5.3). A failed Step that the policy approves is replaced by a
	// new Step row chained via retry_of; Flow finalization ignores
	// the failed parent. Nil disables retries — a failed Step
	// immediately propagates into Flow/Run terminal states.
	Retry RetryPolicy
}

func (c *Config) defaults() {
	if c.NodeID == "" {
		c.NodeID = "node-local"
	}
	if c.PollInterval <= 0 {
		c.PollInterval = 500 * time.Millisecond
	}
	if c.BatchSize <= 0 {
		c.BatchSize = 16
	}
	if c.LeaseTTL <= 0 {
		c.LeaseTTL = 60 * time.Second
	}
	if c.KeepaliveInterval == 0 {
		c.KeepaliveInterval = c.LeaseTTL / 3
	}
	if c.ExecutionTimeout <= 0 {
		c.ExecutionTimeout = c.LeaseTTL / 2
	}
	if c.ExpiryScanInterval < 0 {
		c.ExpiryScanInterval = 0
	} else if c.ExpiryScanInterval == 0 {
		c.ExpiryScanInterval = 30 * time.Second
	}
}

// Scheduler is the runtime glue between AEL, Step Lease, and AgentInstance.
// Construct with New, then call Start. Stop cancels the internal context and
// waits for running goroutines to drain.
type Scheduler struct {
	cfg      Config
	ledger   Ledger
	leases   stepLease.Lease
	pool     *instance.Manager
	executor StepExecutor
	metrics   *okprometheus.Metrics
	log       *logger.Logger
	selector  cws.Selector
	verifiers verifier.Registry
	estimator estimator.Estimator
	retry     RetryPolicy

	mu       sync.Mutex
	running  bool
	cancel   context.CancelFunc
	done     chan struct{}
}

// New constructs a Scheduler. All of ledger, leases, and pool must be
// non-nil. executor defaults to NoopExecutor when nil. metrics and log are
// optional — when nil, metrics recording and logging become no-ops.
func New(
	cfg Config,
	ledger Ledger,
	leases stepLease.Lease,
	pool *instance.Manager,
	executor StepExecutor,
	metrics *okprometheus.Metrics,
	log *logger.Logger,
) *Scheduler {
	cfg.defaults()
	if executor == nil {
		executor = NoopExecutor{}
	}
	verifiers := cfg.Verifiers
	if verifiers == nil {
		verifiers = verifier.NilRegistry{}
	}
	retry := cfg.Retry
	if retry == nil {
		retry = noRetryPolicy{}
	}
	return &Scheduler{
		cfg:       cfg,
		ledger:    ledger,
		leases:    leases,
		pool:      pool,
		executor:  executor,
		metrics:   metrics,
		log:       log,
		selector:  cfg.Selector,
		verifiers: verifiers,
		estimator: cfg.Estimator,
		retry:     retry,
	}
}

// ErrAlreadyRunning is returned when Start is called a second time without an
// intervening Stop.
var ErrAlreadyRunning = errors.New("flowscheduler: already running")

// Start begins the poll loop and the T4 expiry scanner. It returns
// immediately; use Stop to tear down.
func (s *Scheduler) Start(parent context.Context) error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return ErrAlreadyRunning
	}
	ctx, cancel := context.WithCancel(parent)
	s.cancel = cancel
	s.done = make(chan struct{})
	s.running = true
	s.mu.Unlock()

	go s.run(ctx)
	return nil
}

// Stop cancels the internal context and waits for the run loop to drain.
// Safe to call multiple times.
func (s *Scheduler) Stop() {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return
	}
	cancel := s.cancel
	done := s.done
	s.running = false
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if done != nil {
		<-done
	}
}

// RunOnce executes a single tick synchronously. Intended for tests.
func (s *Scheduler) RunOnce(ctx context.Context) error {
	return s.tick(ctx)
}

func (s *Scheduler) run(ctx context.Context) {
	defer close(s.done)

	pollTimer := time.NewTicker(s.cfg.PollInterval)
	defer pollTimer.Stop()

	var expiryTimer *time.Ticker
	if s.cfg.ExpiryScanInterval > 0 {
		expiryTimer = time.NewTicker(s.cfg.ExpiryScanInterval)
		defer expiryTimer.Stop()
	}

	// Consume lease expiry events on a best-effort basis — etcd's watch
	// channel is authoritative, but we only use it here for metrics. T4
	// is the recovery path.
	watchCh, watchErr := s.leases.Watch(ctx)
	if watchErr != nil {
		s.infof("lease watch unavailable", "error", watchErr.Error())
		watchCh = nil
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-pollTimer.C:
			if err := s.tick(ctx); err != nil && !errors.Is(err, context.Canceled) {
				s.errorf("tick failed", "error", err.Error())
			}
		case <-tickChan(expiryTimer):
			if err := s.expiryScan(ctx); err != nil && !errors.Is(err, context.Canceled) {
				s.errorf("expiry scan failed", "error", err.Error())
			}
		case evt, ok := <-watchCh:
			if !ok {
				watchCh = nil
				continue
			}
			if s.metrics != nil {
				s.metrics.EtcdLeaseExpiryTotal.WithLabelValues(evt.Reason).Inc()
			}
		}
	}
}

func (s *Scheduler) expiryScan(ctx context.Context) error {
	res, err := s.ledger.ExpiryScan(ctx, time.Now().UTC())
	if err != nil {
		return err
	}
	if res != nil && len(res.RecoveredStepIDs) > 0 {
		s.infof("t4 recovered steps", "count", len(res.RecoveredStepIDs))
	}
	return nil
}

// tickChan is a safe helper: ticker may be nil when the expiry scanner is
// disabled, in which case we return a nil channel so the select branch is
// never chosen.
func tickChan(t *time.Ticker) <-chan time.Time {
	if t == nil {
		return nil
	}
	return t.C
}

func (s *Scheduler) infof(msg string, kv ...any) {
	if s.log == nil {
		return
	}
	s.log.Info(msg, logger.WithFields(kv...))
}

func (s *Scheduler) errorf(msg string, kv ...any) {
	if s.log == nil {
		return
	}
	s.log.Error(msg, logger.WithFields(kv...))
}
