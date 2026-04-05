package http

import (
	stdhttp "net/http"
	"path"
	"strings"

	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/terminal"
)

func NewHandler(service *terminal.Service, hub *realtime.Hub) stdhttp.Handler {
	return NewHandlerWithDependencies(service, hub, projectdata.NewRepository(".open-kraken-data"), ".", "/api/v1", "/ws")
}

func NewHandlerWithConfig(service *terminal.Service, hub *realtime.Hub, apiBasePath, wsPath string) stdhttp.Handler {
	return NewHandlerWithDependencies(service, hub, projectdata.NewRepository(".open-kraken-data"), ".", apiBasePath, wsPath)
}

func NewHandlerWithDependencies(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string, apiBasePath, wsPath string) stdhttp.Handler {
	mux := stdhttp.NewServeMux()
	terminalHandler := handlers.NewTerminalHandler(service)
	realtimeHandler := handlers.NewRealtimeHandler(service, hub)
	workspaceHandler := handlers.NewWorkspaceHandler(service, hub, projectRepo, workspaceRoot)

	for _, basePath := range []string{"/api/terminal", strings.TrimRight(apiBasePath, "/") + "/terminal"} {
		mux.HandleFunc(path.Join(basePath, "sessions"), terminalHandler.HandleSessions)
		mux.HandleFunc(path.Join(basePath, "member-session"), terminalHandler.HandleMemberSession)
		mux.HandleFunc(path.Join(basePath, "sessions")+"/", terminalHandler.HandleSessionByID)
	}
	for _, realtimePath := range []string{"/realtime", wsPath} {
		mux.HandleFunc(realtimePath, realtimeHandler.HandleWS)
	}
	mux.HandleFunc(strings.TrimRight(apiBasePath, "/")+"/workspaces/", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if err := handlers.HandleWorkspaceRoute(workspaceHandler, w, r); err != nil {
			w.WriteHeader(stdhttp.StatusNotFound)
		}
	})
	return mux
}
