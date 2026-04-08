package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/message"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/observability"
	"open-kraken/backend/go/internal/orchestration"
	"open-kraken/backend/go/internal/plugin"
	"open-kraken/backend/go/internal/presence"
	platformhttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/platform/logger"
	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/settings"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/taskqueue"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/provider"
	"open-kraken/backend/go/internal/tokentrack"
)

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

	// Core services.
	hub := realtime.NewHub(256)
	termSvc := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(cfg.AppDataRoot)

	// Node registry (T04).
	nodeRepo := node.NewJSONRepository(filepath.Join(cfg.AppDataRoot, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
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
	go taskSvc.StartTimeoutScanner(ctx)

	pluginSvc := plugin.NewService()
	settingsSvc := settings.NewService(filepath.Join(cfg.AppDataRoot, "settings"))

	// Seed accounts for development login.
	seedAccounts := []handlers.KnownAccount{
		{MemberID: "owner_1", WorkspaceID: "ws_open_kraken", DisplayName: "Claire", Role: authz.RoleOwner, Password: "admin", Avatar: "CO"},
		{MemberID: "assistant_1", WorkspaceID: "ws_open_kraken", DisplayName: "Planner", Role: authz.RoleAssistant, Password: "planner", Avatar: "PL"},
		{MemberID: "member_1", WorkspaceID: "ws_open_kraken", DisplayName: "Runner", Role: authz.RoleMember, Password: "runner", Avatar: "RN"},
	}

	// Wire HTTP handler.
	apiHandler := apihttp.NewHandlerWithDependencies(termSvc, hub, projectRepo, cfg.WorkspaceRoot, cfg.APIBasePath, cfg.WSPath, apihttp.ExtendedServices{
		NodeService:      nodeSvc,
		SkillService:     skillSvc,
		TokenService:     tokenSvc,
		MemoryService:    memorySvc,
		LedgerService:    ledgerSvc,
		MessageService:   msgSvc,
		PresenceService:  presenceSvc,
		PluginService:    pluginSvc,
		SettingsService:  settingsSvc,
		ProviderRegistry:  providerRegistry,
		TaskQueueService: taskSvc,
		AuthAccounts:     seedAccounts,
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
