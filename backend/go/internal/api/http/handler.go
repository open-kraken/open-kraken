package http

import (
	stdhttp "net/http"
	"path"
	"strings"

	"github.com/gorilla/websocket"

	"open-kraken/backend/go/internal/account"
	"open-kraken/backend/go/internal/ael"
	"open-kraken/backend/go/internal/api/http/handlers"
	"open-kraken/backend/go/internal/ledger"
	"open-kraken/backend/go/internal/memory"
	"open-kraken/backend/go/internal/message"
	namespaces "open-kraken/backend/go/internal/namespace"
	"open-kraken/backend/go/internal/node"
	"open-kraken/backend/go/internal/plugin"
	"open-kraken/backend/go/internal/presence"
	"open-kraken/backend/go/internal/projectdata"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/roster"
	"open-kraken/backend/go/internal/runtime/instance"
	"open-kraken/backend/go/internal/settings"
	"open-kraken/backend/go/internal/skill"
	"open-kraken/backend/go/internal/taskqueue"
	"open-kraken/backend/go/internal/terminal"
	"open-kraken/backend/go/internal/terminal/provider"
	"open-kraken/backend/go/internal/tokentrack"

	plathttp "open-kraken/backend/go/internal/platform/http"
)

// ExtendedServices groups the optional new service dependencies introduced
// in T04–T07 and the Phase 1 paper implementation. Fields may be nil; when
// nil the corresponding routes are omitted.
type ExtendedServices struct {
	NodeService      *node.Service
	SkillService     *skill.Service
	TokenService     *tokentrack.Service
	MemoryService    *memory.Service
	LedgerService    *ledger.Service
	MessageService   *message.Service
	NamespaceService *namespaces.Service
	PresenceService  *presence.Service
	PluginService    *plugin.Service
	SettingsService  *settings.Service
	ProviderRegistry *provider.Registry
	TaskQueueService *taskqueue.Service
	InstanceManager  *instance.Manager
	AuthAccounts     []handlers.KnownAccount
	AccountService   *account.Service
	JWTSecret        string
	RosterStore      roster.Store
	// AELService is the Authoritative Execution Ledger (paper §3.2). Nil when
	// OPEN_KRAKEN_POSTGRES_DSN is not configured.
	AELService *ael.Service
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
	if ext.ProviderRegistry != nil {
		terminalHandler.SetProviderRegistry(ext.ProviderRegistry)
	}
	realtimeHandler := handlers.NewRealtimeHandler(service, hub, wsUpgrader)
	var workspaceHandler *handlers.WorkspaceHandler
	if ext.RosterStore != nil {
		var err error
		workspaceHandler, err = handlers.NewWorkspaceHandlerWithRosterStore(service, hub, projectRepo, workspaceRoot, ext.RosterStore)
		if err != nil {
			panic("init roster store: " + err.Error())
		}
	} else {
		workspaceHandler = handlers.NewWorkspaceHandler(service, hub, projectRepo, workspaceRoot)
	}
	if ext.MessageService != nil {
		workspaceHandler.SetMessageService(ext.MessageService)
	}
	if ext.SettingsService != nil {
		workspaceHandler.SetSettingsService(ext.SettingsService)
	}
	if ext.InstanceManager != nil || ext.ProviderRegistry != nil {
		workspaceHandler.SetAgentRuntime(ext.InstanceManager, ext.ProviderRegistry, ext.NodeService)
	}

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
		skillHandler.SetMemberSkillEligibility(workspaceHandler.MemberCanUseSkills)
		mux.HandleFunc(JoinAPI(apiBasePath, "skills"), skillHandler.HandleSkills)
		mux.HandleFunc(JoinAPI(apiBasePath, "skills/reload"), skillHandler.HandleSkillsReload)
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
		approvalsBase := JoinAPI(apiBasePath, "approvals")
		approvalHandler := handlers.NewApprovalHandler(ext.LedgerService, approvalsBase)
		mux.HandleFunc(approvalsBase, approvalHandler.Handle)
		mux.HandleFunc(approvalsBase+"/", approvalHandler.Handle)
	}

	// Presence routes.
	if ext.PresenceService != nil {
		presenceHandler := handlers.NewPresenceHandler(ext.PresenceService)
		mux.HandleFunc(JoinAPI(apiBasePath, "presence/status"), presenceHandler.HandleStatus)
		mux.HandleFunc(JoinAPI(apiBasePath, "presence/heartbeat"), presenceHandler.HandleHeartbeat)
		mux.HandleFunc(JoinAPI(apiBasePath, "presence/online"), presenceHandler.HandleListOnline)
	}

	// Message service routes.
	if ext.MessageService != nil {
		msgHandler := handlers.NewMessageHandler(ext.MessageService, JoinAPI(apiBasePath, "messages"))
		msgBase := JoinAPI(apiBasePath, "messages")
		mux.HandleFunc(msgBase, msgHandler.Handle)
		mux.HandleFunc(msgBase+"/", msgHandler.Handle)
	}

	// Namespace registry routes.
	if ext.NamespaceService != nil {
		namespaceHandler := handlers.NewNamespaceHandler(ext.NamespaceService, JoinAPI(apiBasePath, "namespaces"))
		namespacesBase := JoinAPI(apiBasePath, "namespaces")
		mux.HandleFunc(namespacesBase, namespaceHandler.Handle)
		mux.HandleFunc(namespacesBase+"/", namespaceHandler.Handle)
	}

	// Provider registry routes.
	if ext.ProviderRegistry != nil {
		providerHandler := handlers.NewProviderHandler(ext.ProviderRegistry)
		mux.HandleFunc(JoinAPI(apiBasePath, "providers"), providerHandler.HandleList)
	}

	// Settings routes.
	if ext.SettingsService != nil {
		settingsHandler := handlers.NewSettingsHandler(ext.SettingsService)
		mux.HandleFunc(JoinAPI(apiBasePath, "settings"), func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			switch r.Method {
			case stdhttp.MethodGet:
				settingsHandler.HandleGet(w, r)
			case stdhttp.MethodPut:
				settingsHandler.HandleUpdate(w, r)
			default:
				w.WriteHeader(stdhttp.StatusMethodNotAllowed)
			}
		})
	}

	// Plugin marketplace routes.
	if ext.PluginService != nil {
		pluginHandler := handlers.NewPluginHandler(ext.PluginService, JoinAPI(apiBasePath, "plugins"))
		pluginBase := JoinAPI(apiBasePath, "plugins")
		mux.HandleFunc(pluginBase, pluginHandler.Handle)
		mux.HandleFunc(pluginBase+"/", pluginHandler.Handle)
	}

	// Task queue routes (P0: cross-node scheduling).
	if ext.TaskQueueService != nil {
		queueHandler := handlers.NewTaskQueueHandler(ext.TaskQueueService, JoinAPI(apiBasePath, "queue"))
		queueBase := JoinAPI(apiBasePath, "queue")
		mux.HandleFunc(queueBase, queueHandler.Handle)
		mux.HandleFunc(queueBase+"/", queueHandler.Handle)
	}

	// Skill import route.
	if ext.SkillService != nil {
		skillHandler := handlers.NewSkillHandler(ext.SkillService, JoinAPI(apiBasePath, "members")+"/")
		skillHandler.SetMemberSkillEligibility(workspaceHandler.MemberCanUseSkills)
		mux.HandleFunc(JoinAPI(apiBasePath, "skills/import"), skillHandler.HandleSkillImport)
	}

	// Unified agent status route (P2).
	if ext.PresenceService != nil {
		agentHandler := handlers.NewAgentStatusHandler(
			service, ext.NodeService, ext.PresenceService, ext.TokenService, ext.TaskQueueService, ext.InstanceManager,
		)
		mux.HandleFunc(JoinAPI(apiBasePath, "agents/status"), agentHandler.HandleList)
		mux.HandleFunc(JoinAPI(apiBasePath, "agents/status")+"/", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			agentID := strings.TrimPrefix(r.URL.Path, JoinAPI(apiBasePath, "agents/status")+"/")
			agentID = strings.TrimSuffix(agentID, "/")
			if agentID == "" {
				agentHandler.HandleList(w, r)
				return
			}
			agentHandler.HandleByID(w, r, agentID)
		})
	}

	// Authentication endpoints (always registered).
	authHandler := handlers.NewAuthHandlerWithServiceAndJWT(ext.AccountService, ext.AuthAccounts, ext.JWTSecret)
	mux.HandleFunc(JoinAPI(apiBasePath, "auth/login"), authHandler.HandleLogin)
	mux.HandleFunc(JoinAPI(apiBasePath, "auth/me"), authHandler.HandleMe)
	if ext.AccountService != nil {
		accountHandler := handlers.NewAccountHandler(ext.AccountService)
		accountsBase := JoinAPI(apiBasePath, "system/users")
		mux.HandleFunc(accountsBase, accountHandler.Handle)
		mux.HandleFunc(accountsBase+"/", accountHandler.HandleByID)
	}

	// AEL v2 routes: Runs, Flows, Steps.
	// These are always registered; handlers return 503 when AELService is nil.
	{
		v2Runs := "/api/v2/runs"
		v2Flows := "/api/v2/flows"
		v2Steps := "/api/v2/steps"

		// AEL v2 cognition routes: Skill Library, Process Templates, SEM.
		v2Skills := "/api/v2/skills"
		skillLibHandler := handlers.NewSkillLibraryHandler(ext.AELService, v2Skills)
		mux.HandleFunc(v2Skills, skillLibHandler.Handle)
		mux.HandleFunc(v2Skills+"/", skillLibHandler.Handle)

		v2ProcTemplates := "/api/v2/process-templates"
		procTplHandler := handlers.NewProcessTemplateHandler(ext.AELService, v2ProcTemplates)
		mux.HandleFunc(v2ProcTemplates, procTplHandler.Handle)
		mux.HandleFunc(v2ProcTemplates+"/", procTplHandler.Handle)

		v2SEM := "/api/v2/sem"
		semHandler := handlers.NewSEMHandler(ext.AELService, v2SEM)
		mux.HandleFunc(v2SEM, semHandler.Handle)
		mux.HandleFunc(v2SEM+"/", semHandler.Handle)

		runHandler := handlers.NewRunHandler(ext.AELService, v2Runs)
		mux.HandleFunc(v2Runs, runHandler.Handle)
		// /api/v2/runs/{id}, /api/v2/runs/{id}/state, /api/v2/runs/{id}/flows
		mux.HandleFunc(v2Runs+"/", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			// Delegate /api/v2/runs/{id}/flows to the flow handler.
			if strings.Contains(strings.TrimPrefix(r.URL.Path, v2Runs+"/"), "/flows") {
				flowHandler := handlers.NewFlowHandler(ext.AELService, v2Flows, v2Runs)
				flowHandler.HandleRunFlows(w, r)
				return
			}
			runHandler.Handle(w, r)
		})

		flowHandler := handlers.NewFlowHandler(ext.AELService, v2Flows, v2Runs)
		mux.HandleFunc(v2Flows, flowHandler.HandleFlows)

		stepHandler := handlers.NewStepHandler(ext.AELService, v2Steps, v2Flows)
		mux.HandleFunc(v2Steps, stepHandler.HandleSteps)
		mux.HandleFunc(v2Steps+"/", stepHandler.HandleSteps)
		// /api/v2/flows/{id}/steps — handled under the flows/ prefix.
		mux.HandleFunc(v2Flows+"/", func(w stdhttp.ResponseWriter, r *stdhttp.Request) {
			if strings.HasSuffix(strings.TrimRight(r.URL.Path, "/"), "/steps") ||
				strings.Contains(strings.TrimPrefix(r.URL.Path, v2Flows+"/"), "/steps") {
				stepHandler.HandleFlowSteps(w, r)
				return
			}
			w.WriteHeader(stdhttp.StatusNotFound)
		})
	}

	return withRolePolicy(mux, apiBasePath, ext.AccountService)
}
