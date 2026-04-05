package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	apihttp "open-kraken/backend/go/internal/api/http"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	platformhttp "open-kraken/backend/go/internal/platform/http"
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
		log.Fatalf("load runtime config: %v", err)
	}

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
		log.Fatalf("init token repository: %v", err)
	}
	tokenSvc := tokentrack.NewService(tokenRepo, hub)

	memRepo, err := memory.NewSQLiteMemoryRepository(filepath.Join(cfg.AppDataRoot, "memory.db"))
	if err != nil {
		log.Fatalf("init memory repository: %v", err)
	}
	memorySvc := memory.NewService(memRepo)

	ledgerRepo, err := ledger.NewSQLiteRepository(filepath.Join(cfg.AppDataRoot, "ledger.db"))
	if err != nil {
		log.Fatalf("init ledger repository: %v", err)
	}
	ledgerSvc := ledger.NewService(ledgerRepo)

	apiHandler := apihttp.NewHandlerWithDependencies(service, hub, projectRepo, cfg.WorkspaceRoot, cfg.APIBasePath, cfg.WSPath, apihttp.ExtendedServices{
		NodeService:   nodeSvc,
		SkillService:  skillSvc,
		TokenService:  tokenSvc,
		MemoryService: memorySvc,
		LedgerService: ledgerSvc,
	}, platformhttp.WebSocketUpgrader(cfg))
	server := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: platformhttp.NewRuntimeHandler(cfg, apiHandler),
	}

	go func() {
		<-ctx.Done()
		_ = server.Shutdown(context.Background())
	}()

	log.Printf(
		"time=%s level=info service=%s requestId=startup message=%q addr=%s apiBasePath=%s wsPath=%s webDistDir=%s",
		time.Now().UTC().Format(time.RFC3339),
		cfg.ServiceName,
		"server starting",
		cfg.HTTPAddr,
		cfg.APIBasePath,
		cfg.WSPath,
		cfg.WebDistDir,
	)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen and serve: %v", err)
	}
}
