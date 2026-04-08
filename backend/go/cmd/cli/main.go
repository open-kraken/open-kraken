// kraken-cli is a command-line client for the Open Kraken API.
// Unlike golutra's IPC-based CLI, this uses HTTP since open-kraken is a web service.
//
// Usage:
//
//	kraken-cli status                     — check server health
//	kraken-cli sessions                   — list terminal sessions
//	kraken-cli send <sessionId> <text>    — send input to a terminal
//	kraken-cli members                    — list workspace members
//	kraken-cli presence                   — list online members
package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		printUsage()
		os.Exit(1)
	}

	baseURL := os.Getenv("KRAKEN_API_URL")
	if baseURL == "" {
		baseURL = "http://localhost:3001/api/v1"
	}
	workspaceID := os.Getenv("KRAKEN_WORKSPACE_ID")
	if workspaceID == "" {
		workspaceID = "ws_open_kraken"
	}

	switch args[0] {
	case "status":
		doGet(baseURL, "/../../healthz")
	case "sessions":
		doGet(baseURL, "/terminal/sessions")
	case "send":
		if len(args) < 3 {
			fmt.Fprintln(os.Stderr, "usage: kraken-cli send <sessionId> <text>")
			os.Exit(1)
		}
		doPost(baseURL, fmt.Sprintf("/terminal/sessions/%s/input", args[1]),
			map[string]string{"data": strings.Join(args[2:], " ")})
	case "members":
		doGet(baseURL, fmt.Sprintf("/workspaces/%s/members", workspaceID))
	case "presence":
		doGet(baseURL, fmt.Sprintf("/presence/online?workspaceId=%s", workspaceID))
	case "plugins":
		doGet(baseURL, "/plugins")
	case "help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n", args[0])
		printUsage()
		os.Exit(1)
	}
}

func doGet(baseURL, path string) {
	resp, err := http.Get(baseURL + path)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	prettyPrint(body)
}

func doPost(baseURL, path string, payload map[string]string) {
	data, _ := json.Marshal(payload)
	resp, err := http.Post(baseURL+path, "application/json", strings.NewReader(string(data)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	prettyPrint(body)
}

func prettyPrint(data []byte) {
	var obj any
	if json.Unmarshal(data, &obj) == nil {
		pretty, _ := json.MarshalIndent(obj, "", "  ")
		fmt.Println(string(pretty))
	} else {
		fmt.Println(string(data))
	}
}

func printUsage() {
	fmt.Println(`kraken-cli - Open Kraken command-line client

Commands:
  status              Check server health
  sessions            List terminal sessions
  send <id> <text>    Send input to a terminal session
  members             List workspace members
  presence            List online members
  plugins             List available plugins
  help                Show this help

Environment:
  KRAKEN_API_URL        API base URL (default: http://localhost:3001/api/v1)
  KRAKEN_WORKSPACE_ID   Workspace ID (default: ws_open_kraken)`)
}
