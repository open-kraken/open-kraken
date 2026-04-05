package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	apihttp "open-kraken/backend/go/internal/api/http"
	platformhttp "open-kraken/backend/go/internal/platform/http"
	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal"
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
	apiHandler := apihttp.NewHandlerWithDependencies(service, hub, projectRepo, cfg.WorkspaceRoot, cfg.APIBasePath, cfg.WSPath)
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
