package http

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/gorilla/websocket"

	runtimecfg "open-kraken/backend/go/internal/platform/runtime"
)

// WebSocketUpgrader builds a gorilla Upgrader using OPEN_KRAKEN_WS_* runtime policy.
// When OPEN_KRAKEN_WS_ALLOW_ANY_ORIGIN is true, any browser Origin is accepted (dev only).
// Otherwise the Origin header must be empty (non-browser clients), match OPEN_KRAKEN_WS_ALLOWED_ORIGINS,
// match the request Host (same-origin deployment), or both Origin and Host use loopback (local dev proxy).
func WebSocketUpgrader(cfg runtimecfg.Config) websocket.Upgrader {
	return websocket.Upgrader{CheckOrigin: checkWebSocketOrigin(cfg)}
}

// PermissiveWebSocketUpgrader allows any Origin. Use only in tests or tightly controlled dev setups.
func PermissiveWebSocketUpgrader() websocket.Upgrader {
	return websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
}

func checkWebSocketOrigin(cfg runtimecfg.Config) func(*http.Request) bool {
	return func(r *http.Request) bool {
		if cfg.WSAllowAnyOrigin {
			return true
		}
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin == "" {
			return true
		}
		for _, allowed := range cfg.WSAllowedOrigins {
			if origin == allowed {
				return true
			}
		}
		u, err := url.Parse(origin)
		if err != nil {
			return false
		}
		if strings.EqualFold(u.Host, r.Host) {
			return true
		}
		// Dev: Vite (or another local proxy) serves the UI on e.g. :3100 while the WS upgrade hits :8080.
		// Origin and Host differ by port but both are loopback — allow so the browser can use the proxy.
		return isLoopbackHostname(u.Hostname()) && isLoopbackHostname(hostOnly(r.Host))
	}
}

func hostOnly(hostport string) string {
	hostport = strings.TrimSpace(hostport)
	if hostport == "" {
		return ""
	}
	if h, _, err := net.SplitHostPort(hostport); err == nil {
		return h
	}
	return hostport
}

func isLoopbackHostname(name string) bool {
	switch strings.ToLower(name) {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		return false
	}
}
