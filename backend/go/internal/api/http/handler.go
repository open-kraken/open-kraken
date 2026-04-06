package http

import (
	stdhttp "net/http"
	"path"
	"strings"

	"github.com/gorilla/websocket"

	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/tokentrack"

	plathttp "open-kraken/backend/go/internal/platform/http"
)

// ExtendedServices groups the optional new service dependencies introduced
// in T04–T07. Fields may be nil; when nil the corresponding routes are omitted.
type ExtendedServices struct {
	NodeService   *node.Service
	SkillService  *skill.Service
	TokenService  *tokentrack.Service
	MemoryService *memory.Service
	LedgerService *ledger.Service
	AuthAccounts  []handlers.KnownAccount
}

// NewHandler creates the default handler using in-process defaults (no extended services).
func NewHandler(service *terminal.Service, hub *realtime.Hub) stdhttp.Handler {
	return NewHandlerWithDependencies(service, hub, projectdata.NewRepository(".open-kraken-data"), ".", "/api/v1", "/ws", ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())
}

// NewHandlerWithConfig creates a handler with custom API and WS base paths.
func NewHandlerWithConfig(service *terminal.Service, hub *realtime.Hub, apiBasePath, wsPath string) stdhttp.Handler {
	return NewHandlerWithDependencies(service, hub, projectdata.NewRepository(".open-kraken-data"), ".", apiBasePath, wsPath, ExtendedServices{}, plathttp.PermissiveWebSocketUpgrader())
}

// NewHandlerWithDependencies builds the full HTTP mux. Extended services are
// registered when non-nil; existing callers that pass ExtendedServices{} retain
// the same behaviour as before.
func NewHandlerWithDependencies(service *terminal.Service, hub *realtime.Hub, projectRepo projectdata.ProjectDataRepository, workspaceRoot string, apiBasePath, wsPath string, ext ExtendedServices, wsUpgrader websocket.Upgrader) stdhttp.Handler {
	mux := stdhttp.NewServeMux()

	sessionsPathPrefix := JoinAPI(apiBasePath, "terminal/sessions") + "/"
	terminalHandler := handlers.NewTerminalHandler(service, sessionsPathPrefix)
	realtimeHandler := handlers.NewRealtimeHandler(service, hub, wsUpgrader)
	workspaceHandler := handlers.NewWorkspaceHandler(service, hub, projectRepo, workspaceRoot)

	terminalBase := JoinAPI(apiBasePath, "terminal")
	mux.HandleFunc(path.Join(terminalBase, "sessions"), terminalHandler.HandleSessions)
	mux.HandleFunc(path.Join(terminalBase, "member-session"), terminalHandler.HandleMemberSession)
	mux.HandleFunc(path.Join(terminalBase, "sessions")+"/", terminalHandler.HandleSessionByID)

	for _, realtimePath := range []string{"/realtime", wsPath} {
		mux.HandleFunc(realtimePath, realtimeHandler.HandleWS)
	}
	mux.HandleFunc(strings.TrimRight(apiBasePath, "/")+"/workspaces/", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
		if err := handlers.HandleWorkspaceRoute(workspaceHandler, w, r); err != nil {
			w.WriteHeader(stdhttp.StatusNotFound)
		}
	})

	// T04: Node registry routes (under API base path).
	if ext.NodeService != nil {
		nodeHandler := handlers.NewNodeHandler(ext.NodeService, JoinAPI(apiBasePath, "nodes"))
		nodesBase := JoinAPI(apiBasePath, "nodes")
		mux.HandleFunc(nodesBase, nodeHandler.Handle)
		mux.HandleFunc(nodesBase+"/", nodeHandler.Handle)
	}

	// T05: Skill catalog and member binding routes.
	if ext.SkillService != nil {
		skillHandler := handlers.NewSkillHandler(ext.SkillService, JoinAPI(apiBasePath, "members")+"/")
		mux.HandleFunc(JoinAPI(apiBasePath, "skills"), skillHandler.HandleSkills)
		mux.HandleFunc(JoinAPI(apiBasePath, "members")+"/", skillHandler.HandleMemberSkills)
	}

	// T06: Token tracking routes.
	if ext.TokenService != nil {
		tokenHandler := handlers.NewTokenHandler(ext.TokenService)
		mux.HandleFunc(JoinAPI(apiBasePath, "tokens/events"), tokenHandler.HandleEvents)
		mux.HandleFunc(JoinAPI(apiBasePath, "tokens/stats"), tokenHandler.HandleStats)
		mux.HandleFunc(JoinAPI(apiBasePath, "tokens/activity"), tokenHandler.HandleActivity)
	}

	// T07: Distributed memory store routes.
	if ext.MemoryService != nil {
		memHandler := handlers.NewMemoryHandler(ext.MemoryService, JoinAPI(apiBasePath, "memory"))
		mux.HandleFunc(JoinAPI(apiBasePath, "memory")+"/", memHandler.Handle)
	}

	// Central audit ledger (command / action trail for retrospectives).
	if ext.LedgerService != nil {
		ledgerHandler := handlers.NewLedgerHandler(ext.LedgerService)
		mux.HandleFunc(JoinAPI(apiBasePath, "ledger/events"), ledgerHandler.HandleEvents)
	}

	// Authentication endpoints (always registered).
	authHandler := handlers.NewAuthHandler(ext.AuthAccounts)
	mux.HandleFunc(JoinAPI(apiBasePath, "auth/login"), authHandler.HandleLogin)
	mux.HandleFunc(JoinAPI(apiBasePath, "auth/me"), authHandler.HandleMe)

	return mux
}
