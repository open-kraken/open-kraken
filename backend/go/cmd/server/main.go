package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"open-kraken/backend/go/internal/account"
	"open-kraken/backend/go/internal/ael"
	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/cws"
	"open-kraken/backend/go/internal/embedder"
	"open-kraken/backend/go/internal/estimator"
	"open-kraken/backend/go/internal/flowscheduler"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/llmexec"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/message"
	namespaces "open-kraken/backend/go/internal/namespace"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/observability"
	okprometheus "open-kraken/backend/go/internal/observability/prometheus"
	"open-kraken/backend/go/internal/orchestration"
	platformhttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/platform/logger"
	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
	"open-kraken/backend/go/internal/plugin"
	"open-kraken/backend/go/internal/presence"
	"open-kraken/backend/go/internal/projectdata"
	llmprovider "open-kraken/backend/go/internal/provider"
	llmanthropic "open-kraken/backend/go/internal/provider/anthropic"
	llmopenai "open-kraken/backend/go/internal/provider/openai"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/sem"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/settings"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/stepLease"
	"open-kraken/backend/go/internal/taskqueue"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/provider"
	"open-kraken/backend/go/internal/tokentrack"
	"open-kraken/backend/go/internal/vector"
	"open-kraken/backend/go/internal/verifier"
)

const defaultWorkspaceID = "ws_open_kraken"

// seedNodes registers a local node representing this machine and starts a
// heartbeat goroutine so the Nodes page shows realistic live data.
func seedNodes(ctx context.Context, svc *node.Service) {
	existing, _ := svc.List(ctx)
	if len(existing) > 0 {
		return // already has data
	}

	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "localhost"
	}

	local := node.Node{
		ID:          "node-local",
		Hostname:    hostname,
		NodeType:    node.NodeTypeBareMetal,
		Labels:      map[string]string{"region": "local", "pool": "dev"},
		WorkspaceID: "ws_open_kraken",
	}
	_, _ = svc.Register(ctx, local)

	// Keep the local node alive with periodic heartbeats.
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				_, _ = svc.Heartbeat(ctx, "node-local")
			}
		}
	}()
}

// buildSEMService returns the paper-§5.7 SEM facade. Batch 1 uses an
// in-memory vector store + HashEmbedder so the pipeline is exercisable
// end-to-end without Qdrant. Batch 2 will switch in QdrantStore +
// OpenAIEmbedder through env flags without changing this signature.
//
// Returns nil when AEL is disabled — without the PG sem_records table
// there is no source of truth to outbox from.
func buildSEMService(aelSvc *ael.Service, log *logger.Logger) *sem.Service {
	if aelSvc == nil {
		return nil
	}
	emb := embedder.NewHashEmbedder(256)
	vec := vector.NewMemoryVectorStore()
	svc, err := sem.New(aelSvc, vec, emb, sem.Config{})
	if err != nil {
		log.Error("sem service init failed", logger.WithFields("error", err.Error()))
		return nil
	}
	log.Info("sem service enabled",
		logger.WithFields("embedder", emb.Name(), "dim", emb.Dim(), "store", "memory"))
	return svc
}

// buildInstanceManager constructs the AgentInstance pool and, when AEL
// is available, attaches a PG-backed Repository + performs crash
// recovery. Returning a fully-wired Manager keeps main.go linear even
// as persistence grows optional backends.
func buildInstanceManager(ctx context.Context, aelSvc *ael.Service, log *logger.Logger) *instance.Manager {
	if aelSvc == nil {
		log.Info("agent instance pool: memory-only (AEL disabled)")
		return instance.NewManager()
	}
	pool := aelSvc.Repo().Pool()
	if pool == nil {
		log.Warn("agent instance pool: AEL pool unavailable; falling back to memory")
		return instance.NewManager()
	}

	repo := instance.NewPGRepository(pool)
	onErr := func(err error, s instance.Snapshot) {
		log.Error("agent instance persistence failed",
			logger.WithFields("instance_id", s.ID, "state", string(s.State), "error", err.Error()))
	}
	mgr := instance.NewManagerWithRepository(repo, onErr)

	stats, err := mgr.Restore(ctx)
	if err != nil {
		log.Error("agent instance restore failed", logger.WithFields("error", err.Error()))
	} else {
		log.Info("agent instance pool restored",
			logger.WithFields(
				"restored", stats.Restored,
				"crashed", stats.Crashed,
				"skipped", stats.Skipped,
			))
	}
	return mgr
}

// buildStepExecutor returns the flowscheduler.StepExecutor wired to
// every LLM provider enabled by runtime config. When cfg.LLMProviders
// is empty — or no enabled provider has a usable API key — it falls
// back to NoopExecutor so CI / offline dev keep working.
//
// The resulting Executor routes each Step by its Provider string
// (which CWS writes at arm-pick time). Adding a new provider backend
// is a three-line change: extend the switch in resolveProvider below
// and register a Candidate row in buildCWSCatalog.
func buildStepExecutor(cfg runtimecfg.Config, aelSvc *ael.Service, log *logger.Logger) flowscheduler.StepExecutor {
	providers := map[string]llmprovider.LLMProvider{}
	for _, name := range cfg.LLMProviders {
		p := resolveProvider(name, cfg, log)
		if p == nil {
			continue
		}
		providers[name] = p
	}
	if len(providers) == 0 {
		return flowscheduler.NoopExecutor{}
	}

	names := make([]string, 0, len(providers))
	for n := range providers {
		names = append(names, n)
	}
	binder := newAELSkillBinder(aelSvc)
	log.Info("llm providers enabled", logger.WithFields(
		"providers", names,
		"default_provider", cfg.LLMDefaultProvider,
		"default_model", cfg.LLMDefaultModel,
		"skill_binder", binder != nil,
	))

	exec, err := llmexec.NewMulti(providers, llmexec.Options{
		DefaultModel:    cfg.LLMDefaultModel,
		DefaultProvider: cfg.LLMDefaultProvider,
		SkillBinder:     binder,
	})
	if err != nil {
		log.Error("llmexec build failed; using NoopExecutor",
			logger.WithFields("error", err.Error()))
		return flowscheduler.NoopExecutor{}
	}
	return exec
}

// newAELSkillBinder adapts *ael.Service into the narrow llmexec.SkillBinder
// interface so the provider layer keeps zero knowledge of AEL types.
// Returns nil when aelSvc is nil, which llmexec treats as "no skill
// library wired" and skips the lookup.
func newAELSkillBinder(aelSvc *ael.Service) llmexec.SkillBinder {
	if aelSvc == nil {
		return nil
	}
	return llmexec.SkillBinderFunc(func(ctx context.Context, agentType, workloadClass, tenantID string) (*llmexec.SkillBinding, error) {
		skill, err := aelSvc.FindSkillForAgent(ctx, agentType, workloadClass, tenantID)
		if err != nil {
			return nil, err
		}
		return &llmexec.SkillBinding{
			ID:             skill.ID,
			Name:           skill.Name,
			PromptTemplate: skill.PromptTemplate,
		}, nil
	})
}

// resolveProvider constructs one provider instance for the given name,
// returning nil when the backend is unknown or its credential is missing.
// Nil returns do not crash the server — they just mean that provider is
// skipped in the routing table.
func resolveProvider(name string, cfg runtimecfg.Config, log *logger.Logger) llmprovider.LLMProvider {
	switch name {
	case "anthropic":
		if cfg.AnthropicAPIKey == "" {
			log.Warn("llm provider=anthropic declared but no ANTHROPIC_API_KEY; skipping")
			return nil
		}
		client, err := llmanthropic.New(llmanthropic.Config{APIKey: cfg.AnthropicAPIKey})
		if err != nil {
			log.Error("anthropic provider init failed", logger.WithFields("error", err.Error()))
			return nil
		}
		return client
	case "openai":
		if cfg.OpenAIAPIKey == "" {
			log.Warn("llm provider=openai declared but no OPENAI_API_KEY; skipping")
			return nil
		}
		client, err := llmopenai.New(llmopenai.Config{APIKey: cfg.OpenAIAPIKey})
		if err != nil {
			log.Error("openai provider init failed", logger.WithFields("error", err.Error()))
			return nil
		}
		return client
	default:
		log.Warn("unknown llm provider; skipping", logger.WithFields("provider", name))
		return nil
	}
}

// Ensure the concrete provider types satisfy the interface even if a
// future refactor changes import paths.
var (
	_ llmprovider.LLMProvider = (*llmanthropic.Client)(nil)
	_ llmprovider.LLMProvider = (*llmopenai.Client)(nil)
)

// buildCWSSelector constructs the CWS UCB-1 selector. The catalog lists
// the arms that correspond to currently-installed providers so Pick
// never returns an arm that has no real executor behind it. Stats go to
// PostgreSQL via the AEL pool when available; otherwise we fall back to
// in-memory stats (single-process dev).
//
// Returns nil when AEL is disabled — without AEL there is no source of
// truth for reward attribution and no durable place for stats.
func buildCWSSelector(cfg runtimecfg.Config, aelSvc *ael.Service, log *logger.Logger) cws.Selector {
	if aelSvc == nil {
		return nil
	}

	catalog := buildCWSCatalog(cfg)
	if catalog == nil {
		log.Info("cws disabled: no provider arms registered")
		return nil
	}

	var stats cws.StatsRepo
	if pool := aelSvc.Repo().Pool(); pool != nil {
		stats = cws.NewPGStats(pool)
		log.Info("cws stats: postgres")
	} else {
		stats = cws.NewMemoryStats()
		log.Info("cws stats: memory (no pg pool)")
	}

	opts := cws.Options{}
	if cfg.CWSCostAlpha > 0 && cfg.CWSCostBaselineUSD > 0 {
		opts.RewardModel = cws.BudgetAwareRewardModel{
			Alpha:        cfg.CWSCostAlpha,
			CostBaseline: cfg.CWSCostBaselineUSD,
		}
		log.Info("cws reward model: budget-aware",
			logger.WithFields("alpha", cfg.CWSCostAlpha, "baseline_usd", cfg.CWSCostBaselineUSD))
	} else {
		log.Info("cws reward model: default (success-driven)")
	}
	return cws.NewUCBSelector(catalog, stats, opts)
}

// buildVerifierRegistry returns the Registry handed to the FlowScheduler
// for VerificationCallback lookups. Today it is empty: the scheduler's
// VERIFIABLE branch falls back to the success-indicator reward when no
// row is registered, which is safe and conservative.
//
// This is the single place to attach concrete verifiers. Examples of
// what a real deployment adds here:
//
//	reg.Register("VERIFIABLE", "code-gen", gotestVerifier)
//	reg.Register("VERIFIABLE", "json-schema", schemaVerifier(myEnvelope))
//	reg.RegisterDefault("VERIFIABLE", llmJudgeVerifier)
//
// Keeping the wiring in one function means adding / renaming verifiers
// never touches the scheduler, cws, or provider packages.
func buildVerifierRegistry(cfg runtimecfg.Config, log *logger.Logger) verifier.Registry {
	reg := verifier.NewStaticRegistry()
	// Intentionally empty for now. Add rows above this line as
	// verifiers land.
	log.Info("verifier registry: empty (VERIFIABLE falls back to success indicator)")
	return reg
}

// buildCWSCatalog returns the StaticCatalog of arms legal for this
// deployment. Today it tracks only the provider selected by
// OPEN_KRAKEN_LLM_PROVIDER; extending this is the one-line change a
// new provider needs ("add a few Candidate rows").
//
// A nil return means "no arms available"; callers disable CWS in that
// case rather than creating a selector that always returns ErrNoCandidates.
func buildCWSCatalog(cfg runtimecfg.Config) cws.Catalog {
	if len(cfg.LLMProviders) == 0 {
		return nil
	}

	// Cartesian product: for each enabled provider, register the
	// common agent roles at OPAQUE regime with wildcard workload_class.
	// When multiple providers are live, CWS UCB picks across them per
	// (agent_type, workload_class) arm — that's the whole point of
	// multi-provider support.
	agentTypes := []string{"assistant", "planner"}
	candidates := make([]cws.Candidate, 0, len(cfg.LLMProviders)*len(agentTypes))
	for _, prov := range cfg.LLMProviders {
		for _, at := range agentTypes {
			candidates = append(candidates, cws.Candidate{
				AgentType:     at,
				Provider:      prov,
				WorkloadClass: "",
				Regime:        cws.RegimeOpaque,
			})
		}
	}
	return cws.NewStaticCatalog(candidates...)
}

// initTracing initialises the OpenTelemetry tracer if enabled.
// Returns a shutdown function (nil when tracing is disabled).
func initTracing(ctx context.Context, cfg runtimecfg.Config, log *logger.Logger) func(context.Context) error {
	if !cfg.TracingEnabled {
		return nil
	}
	shutdown, err := observability.InitTracer(ctx, cfg)
	if err != nil {
		log.Error("otel tracer init failed", logger.WithFields("error", err.Error()))
		return nil
	}
	return shutdown
}

// initStorageServices creates the SQLite-backed service layer (tokens, memory,
// messages, ledger). Panics on unrecoverable init errors.
func initStorageServices(cfg runtimecfg.Config, hub *realtime.Hub, log *logger.Logger) (
	tokenSvc *tokentrack.Service,
	memorySvc *memory.Service,
	msgSvc *message.Service,
	msgRepo message.Repository,
	ledgerSvc *ledger.Service,
) {
	tokenRepo, err := tokentrack.NewSQLiteTokenRepository(filepath.Join(cfg.AppDataRoot, "tokens.db"))
	if err != nil {
		log.Error("init token repository failed", logger.WithFields("error", err.Error()))
		panic("init token repository: " + err.Error())
	}
	tokenSvc = tokentrack.NewService(tokenRepo, hub)

	memRepo, err := memory.NewSQLiteMemoryRepository(filepath.Join(cfg.AppDataRoot, "memory.db"))
	if err != nil {
		log.Error("init memory repository failed", logger.WithFields("error", err.Error()))
		panic("init memory repository: " + err.Error())
	}
	memorySvc = memory.NewService(memRepo)

	sqliteRepo, err := message.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "messages.db"))
	if err != nil {
		log.Error("init message repository failed", logger.WithFields("error", err.Error()))
		panic("init message repository: " + err.Error())
	}
	msgRepo = sqliteRepo
	msgSvc = message.NewService(sqliteRepo, hub)

	ledgerRepo, err := ledger.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "ledger.db"))
	if err != nil {
		log.Error("init ledger repository failed", logger.WithFields("error", err.Error()))
		panic("init ledger repository: " + err.Error())
	}
	ledgerSvc = ledger.NewService(ledgerRepo)

	return
}

func buildNamespaceCountProvider(workspaceRoot string, store roster.Store, defaultWorkspaceID string) namespaces.CountProvider {
	return func(ctx context.Context, namespaceID string) (namespaces.Counts, error) {
		namespaceID = strings.TrimSpace(namespaceID)
		if namespaceID == "" {
			return namespaces.Counts{}, nil
		}
		if store != nil {
			doc, found, err := store.Read(ctx, namespaceID)
			if err != nil || !found {
				return namespaces.Counts{}, err
			}
			return namespaceRosterCounts(doc), nil
		}

		// The file-backed roster is still a singleton document. Only attach it
		// to the legacy default workspace id so new namespaces do not inherit
		// unrelated roster counts before namespace context switching lands.
		if namespaceID != defaultWorkspaceID {
			return namespaces.Counts{}, nil
		}
		doc, found, err := roster.Read(workspaceRoot)
		if err != nil || !found {
			return namespaces.Counts{}, err
		}
		return namespaceRosterCounts(doc), nil
	}
}

func namespaceRosterCounts(doc roster.Document) namespaces.Counts {
	return namespaces.Counts{
		TeamCount:   len(doc.Teams),
		MemberCount: len(doc.Members),
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := runtimecfg.Load()
	if err != nil {
		panic("load runtime config: " + err.Error())
	}
	log := logger.Default(cfg.ServiceName, cfg.LogLevel)

	// Observability.
	shutdownTracer := initTracing(ctx, cfg, log)
	defer func() {
		if shutdownTracer == nil {
			return
		}
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := shutdownTracer(sctx); err != nil {
			log.Error("otel tracer shutdown failed", logger.WithFields("error", err.Error()))
		}
	}()

	// Paper §3.2: Authoritative Execution Ledger (PostgreSQL-backed, optional).
	var aelSvc *ael.Service
	if cfg.PostgresDSN != "" {
		aelRepo, aelErr := ael.NewRepository(ctx, cfg.PostgresDSN)
		if aelErr != nil {
			log.Error("ael repository init failed", logger.WithFields("error", aelErr.Error()))
		} else {
			aelSvc = ael.NewService(aelRepo)
			defer aelSvc.Close()
			log.Info("ael repository connected", logger.WithFields("dsn_set", true))
		}
	}

	// Paper §3.3: Step Lease coordination (etcd in production, in-memory in dev).
	var stepLeaseSvc stepLease.Lease
	if len(cfg.EtcdEndpoints) > 0 {
		etcdLease, etcdErr := stepLease.NewEtcdLease(ctx, stepLease.EtcdConfig{
			Endpoints: cfg.EtcdEndpoints,
		})
		if etcdErr != nil {
			log.Error("etcd step lease init failed", logger.WithFields("error", etcdErr.Error()))
			stepLeaseSvc = stepLease.NewMemoryLease()
		} else {
			stepLeaseSvc = etcdLease
			log.Info("step lease using etcd", logger.WithFields("endpoints", cfg.EtcdEndpoints))
		}
	} else {
		stepLeaseSvc = stepLease.NewMemoryLease()
	}
	defer stepLeaseSvc.Close()

	// Paper §4: AgentInstance pool manager. When AEL is configured we
	// wire a PG-backed Repository so the pool survives restarts; the
	// dev fallback stays fully in-memory.
	instanceMgr := buildInstanceManager(ctx, aelSvc, log)
	defer instanceMgr.Close()

	// Paper §5.7: Shared Execution Memory (L2/L3). Batch 1 wires the
	// service but does not yet expose it through the HTTP layer — that
	// handler swap lands in the next slice. Held here so we keep the
	// import honest and so SEM writes from the scheduler (future work)
	// have a live handle to consume.
	semSvc := buildSEMService(aelSvc, log)
	_ = semSvc

	// Paper §6.1: Prometheus metrics (always registered; listener conditional on addr).
	metrics := okprometheus.New()
	metricsListener := okprometheus.NewListener(cfg.PrometheusAddr, metrics)
	metricsListener.Start()
	defer func() {
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := metricsListener.Stop(sctx); err != nil {
			log.Error("prometheus listener shutdown failed", logger.WithFields("error", err.Error()))
		}
	}()
	if cfg.PrometheusAddr != "" {
		log.Info("prometheus metrics listener started", logger.WithFields("addr", cfg.PrometheusAddr))
	}

	// Core services.
	hub := realtime.NewHub(256)
	termSvc := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(cfg.AppDataRoot)

	// Node registry (T04).
	nodeRepo := node.NewJSONRepository(filepath.Join(cfg.AppDataRoot, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
	nodeSvc.SetAgentPlacementObserver(func(agentID string, placed node.Node) {
		for _, inst := range instanceMgr.Snapshot() {
			context := inst.SnapshotContext()
			if memberID, _ := context["memberId"].(string); memberID != agentID {
				continue
			}
			inst.SetContext("nodeId", placed.ID)
			inst.SetContext("nodeHostname", placed.Hostname)
			inst.SetContext("placementState", "placed")
		}
	})
	go nodeSvc.Start(ctx)
	seedNodes(ctx, nodeSvc)

	// Skills (T05).
	skillLoader := skill.NewLoader(cfg.SkillRoot)
	skillBindingRepo := skill.NewJSONBindingRepository(filepath.Join(cfg.AppDataRoot, "skills"))
	skillSvc := skill.NewService(skillLoader, skillBindingRepo)

	// Storage-backed services (T06-T07).
	tokenSvc, memorySvc, msgSvc, msgRepo, ledgerSvc := initStorageServices(cfg, hub, log)

	// Provider registry and presence (Phase 3-4).
	providerRegistry := provider.NewRegistry()
	presenceSvc := presence.NewService(hub)
	go presenceSvc.Start(ctx)

	// Terminal polling engine.
	termSvc.StartPoller(ctx)

	// Orchestration: message dispatch → terminal sessions.
	orch := orchestration.New(msgSvc, termSvc, providerRegistry, hub)
	msgSvc.SetDNDCheck(presenceSvc.IsDND)

	// Outbox worker for reliable message → terminal dispatch.
	if accessor, ok := msgRepo.(message.DBAccessor); ok {
		outboxStore, outboxErr := message.NewOutboxStore(accessor.DB())
		if outboxErr != nil {
			log.Error("init outbox store failed", logger.WithFields("error", outboxErr.Error()))
		} else {
			msgSvc.SetOutboxStore(outboxStore)
			outboxWorker := message.NewOutboxWorker(outboxStore, orch.DispatchChatToTerminal, msgSvc)
			go outboxWorker.Run(ctx)
		}
	}

	// Task queue (P0: cross-node scheduling).
	taskRepo, err := taskqueue.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "taskqueue.db"))
	if err != nil {
		log.Error("init taskqueue repository failed", logger.WithFields("error", err.Error()))
		panic("init taskqueue repository: " + err.Error())
	}
	taskSvc := taskqueue.NewService(taskRepo, hub)
	taskSvc.SetAgentResolver(func(resolveCtx context.Context, nodeID string, busyAgents map[string]bool) (string, error) {
		placed, err := nodeSvc.GetByID(resolveCtx, nodeID)
		if err != nil {
			return "", err
		}
		for _, agentID := range placed.Agents {
			if agentID != "" && !busyAgents[agentID] {
				return agentID, nil
			}
		}
		return "", taskqueue.ErrNoAvailableAgent
	})
	go taskSvc.StartTimeoutScanner(ctx)

	pluginSvc := plugin.NewService()
	settingsSvc := settings.NewService(filepath.Join(cfg.AppDataRoot, "settings"))
	var rosterStore roster.Store
	if aelSvc != nil {
		rosterStore = roster.NewPGStore(aelSvc.Repo().Pool())
		log.Info("workspace roster store: postgres")
	} else {
		log.Info("workspace roster store: workspace file")
	}
	namespaceRepo, err := namespaces.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "namespaces.db"))
	if err != nil {
		log.Error("init namespace repository failed", logger.WithFields("error", err.Error()))
		panic("init namespace repository: " + err.Error())
	}
	namespaceSvc := namespaces.NewService(namespaceRepo, buildNamespaceCountProvider(cfg.WorkspaceRoot, rosterStore, defaultWorkspaceID))

	// Seed accounts for development login.
	seedAccounts := []handlers.KnownAccount{
		{MemberID: "owner_1", WorkspaceID: defaultWorkspaceID, DisplayName: "Claire", Role: authz.RoleOwner, Password: "admin", Avatar: "CO"},
		{MemberID: "assistant_1", WorkspaceID: defaultWorkspaceID, DisplayName: "Planner", Role: authz.RoleAssistant, Password: "planner", Avatar: "PL"},
		{MemberID: "member_1", WorkspaceID: defaultWorkspaceID, DisplayName: "Runner", Role: authz.RoleMember, Password: "runner", Avatar: "RN"},
	}
	accountSeeds := make([]account.SeedAccount, 0, len(seedAccounts))
	for _, seed := range seedAccounts {
		accountSeeds = append(accountSeeds, account.SeedAccount{
			MemberID:    seed.MemberID,
			WorkspaceID: seed.WorkspaceID,
			DisplayName: seed.DisplayName,
			Role:        seed.Role,
			Password:    seed.Password,
			Avatar:      seed.Avatar,
		})
	}
	accountSvc, err := account.NewService(filepath.Join(cfg.AppDataRoot, "accounts"), accountSeeds)
	if err != nil {
		log.Error("init account service failed", logger.WithFields("error", err.Error()))
		panic("init account service: " + err.Error())
	}

	// Paper §3.3 / §5.3: FlowScheduler connects AEL + Step Lease + AgentInstance
	// into an end-to-end execution path. Only started when AEL is configured —
	// without PG there is no durable Step store to poll.
	if aelSvc != nil {
		executor := buildStepExecutor(cfg, aelSvc, log)
		selector := buildCWSSelector(cfg, aelSvc, log)
		if selector != nil {
			log.Info("cws selector enabled (ucb-1)")
		}
		verifiers := buildVerifierRegistry(cfg, log)
		est := estimator.NewCharCountEstimator()
		log.Info("estimator: char-count",
			logger.WithFields("chars_per_token", est.CharsPerToken, "output_guess", est.OutputGuess))
		retryPolicy := flowscheduler.NewDefaultRetryPolicy(cfg.RetryMaxAttempts)
		log.Info("retry policy", logger.WithFields("max_attempts", cfg.RetryMaxAttempts))
		sched := flowscheduler.New(flowscheduler.Config{
			NodeID:    "node-local",
			Selector:  selector,
			Verifiers: verifiers,
			Estimator: est,
			Retry:     retryPolicy,
		}, flowscheduler.NewServiceLedger(aelSvc), stepLeaseSvc, instanceMgr, executor, metrics, log)
		if err := sched.Start(ctx); err != nil {
			log.Error("flowscheduler start failed", logger.WithFields("error", err.Error()))
		} else {
			log.Info("flowscheduler started", logger.WithFields("node_id", "node-local"))
			defer sched.Stop()
		}
	} else {
		// Keep the unused symbols anchored so a refactor accidentally dropping
		// AEL wiring still produces a compile-time reminder.
		_ = stepLeaseSvc
		_ = instanceMgr
		_ = metrics
	}

	apiHandler := apihttp.NewHandlerWithDependencies(termSvc, hub, projectRepo, cfg.WorkspaceRoot, cfg.APIBasePath, cfg.WSPath, apihttp.ExtendedServices{
		NodeService:      nodeSvc,
		SkillService:     skillSvc,
		TokenService:     tokenSvc,
		MemoryService:    memorySvc,
		LedgerService:    ledgerSvc,
		MessageService:   msgSvc,
		NamespaceService: namespaceSvc,
		PresenceService:  presenceSvc,
		PluginService:    pluginSvc,
		SettingsService:  settingsSvc,
		ProviderRegistry: providerRegistry,
		TaskQueueService: taskSvc,
		InstanceManager:  instanceMgr,
		RosterStore:      rosterStore,
		AELService:       aelSvc,
		AuthAccounts:     seedAccounts,
		AccountService:   accountSvc,
		JWTSecret:        cfg.JWTSecret,
	}, platformhttp.WebSocketUpgrader(cfg))

	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: platformhttp.NewRuntimeHandler(cfg, apiHandler),
	}

	go func() {
		<-ctx.Done()
		_ = server.Shutdown(context.Background())
	}()

	log.Info("server starting", logger.WithFields(
		"addr", cfg.HTTPAddr,
		"apiBasePath", cfg.APIBasePath,
		"wsPath", cfg.WSPath,
		"webDistDir", cfg.WebDistDir,
		"jwtEnabled", cfg.JWTSecret != "",
		"rateLimitRPS", cfg.RateLimitRPS,
		"otelHttpTracing", observability.HTTPTracingEnabled(),
	))
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("listen and serve failed", logger.WithFields("error", err.Error()))
		panic("listen and serve: " + err.Error())
	}
	log.Info("server stopped")
}
