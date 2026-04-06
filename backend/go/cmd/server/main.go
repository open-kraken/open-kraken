package main

import (
	"context"
	"errors"
	"net/http"
	"os/signal"
	"path/filepath"
	"syscall"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	platformhttp "open-kraken/backend/go/internal/platform/http"
	"open-kraken/backend/go/internal/platform/logger"
	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/tokentrack"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg, err := runtimecfg.Load()
	if err != nil {
		panic("load runtime config: " + err.Error())
	}

	log := logger.Default(cfg.ServiceName, cfg.LogLevel)

	hub := realtime.NewHub(256)
	service := terminal.NewService(session.NewRegistry(), pty.NewLocalLauncher(), hub)
	projectRepo := projectdata.NewRepository(cfg.AppDataRoot)

	// Extended services (T04–T07).
	nodeRepo := node.NewJSONRepository(filepath.Join(cfg.AppDataRoot, "nodes"))
	nodeSvc := node.NewService(nodeRepo, hub)
	go nodeSvc.Start(ctx)

	skillLoader := skill.NewLoader(cfg.SkillRoot)
	skillBindingRepo := skill.NewJSONBindingRepository(filepath.Join(cfg.AppDataRoot, "skills"))
	skillSvc := skill.NewService(skillLoader, skillBindingRepo)

	tokenRepo, err := tokentrack.NewSQLiteTokenRepository(filepath.Join(cfg.AppDataRoot, "tokens.db"))
	if err != nil {
		log.Error("init token repository failed", logger.WithFields("error", err.Error()))
		panic("init token repository: " + err.Error())
	}
	tokenSvc := tokentrack.NewService(tokenRepo, hub)

	memRepo, err := memory.NewSQLiteMemoryRepository(filepath.Join(cfg.AppDataRoot, "memory.db"))
	if err != nil {
		log.Error("init memory repository failed", logger.WithFields("error", err.Error()))
		panic("init memory repository: " + err.Error())
	}
	memorySvc := memory.NewService(memRepo)

	ledgerRepo, err := ledger.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "ledger.db"))
	if err != nil {
		log.Error("init ledger repository failed", logger.WithFields("error", err.Error()))
		panic("init ledger repository: " + err.Error())
	}
	ledgerSvc := ledger.NewService(ledgerRepo)

	// Seed accounts for development login.
	seedAccounts := []handlers.KnownAccount{
		{MemberID: "owner_1", WorkspaceID: "ws_open_kraken", DisplayName: "Claire", Role: authz.RoleOwner, Password: "admin", Avatar: "CO"},
		{MemberID: "assistant_1", WorkspaceID: "ws_open_kraken", DisplayName: "Planner", Role: authz.RoleAssistant, Password: "planner", Avatar: "PL"},
		{MemberID: "member_1", WorkspaceID: "ws_open_kraken", DisplayName: "Runner", Role: authz.RoleMember, Password: "runner", Avatar: "RN"},
	}

	apiHandler := apihttp.NewHandlerWithDependencies(service, hub, projectRepo, cfg.WorkspaceRoot, cfg.APIBasePath, cfg.WSPath, apihttp.ExtendedServices{
		NodeService:   nodeSvc,
		SkillService:  skillSvc,
		TokenService:  tokenSvc,
		MemoryService: memorySvc,
		LedgerService: ledgerSvc,
		AuthAccounts:  seedAccounts,
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
	))
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Error("listen and serve failed", logger.WithFields("error", err.Error()))
		panic("listen and serve: " + err.Error())
	}
	log.Info("server stopped")
}
