// Package main implements the open-kraken agent node binary.
// Each agent node registers itself with the backend, sends periodic heartbeats,
// loads assigned skills, and executes dispatched tasks.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"open-kraken/backend/go/internal/platform/logger"
)

type agentConfig struct {
	BackendURL string
	NodeID     string
	Hostname   string
	DataDir    string
	SkillsDir  string
	LogLevel   string
}

func loadAgentConfig() agentConfig {
	hostname, _ := os.Hostname()
	return agentConfig{
		BackendURL: envOr("KRAKEN_BACKEND_URL", "http://localhost:8080"),
		NodeID:     envOr("KRAKEN_NODE_ID", "agent-"+hostname),
		Hostname:   hostname,
		DataDir:    envOr("KRAKEN_DATA_DIR", "/data"),
		SkillsDir:  envOr("KRAKEN_SKILLS_DIR", "/skills"),
		LogLevel:   envOr("KRAKEN_LOG_LEVEL", "info"),
	}
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	cfg := loadAgentConfig()
	log := logger.Default("kraken-agent-node", cfg.LogLevel)

	log.Info("agent starting", logger.WithFields(
		"nodeId", cfg.NodeID,
		"hostname", cfg.Hostname,
		"backendUrl", cfg.BackendURL,
	))

	// Wait for backend to be reachable.
	if !waitForBackend(ctx, cfg.BackendURL, log) {
		log.Error("backend not reachable, exiting")
		os.Exit(1)
	}

	// Register this node with the backend.
	if err := registerNode(ctx, cfg, log); err != nil {
		log.Error("failed to register node", logger.WithFields("error", err.Error()))
		os.Exit(1)
	}
	log.Info("node registered successfully")

	// Start heartbeat loop.
	go heartbeatLoop(ctx, cfg, log)

	// Wait for shutdown signal.
	<-ctx.Done()
	log.Info("shutting down agent node")

	// Deregister on graceful shutdown.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := deregisterNode(shutdownCtx, cfg, log); err != nil {
		log.Warn("deregister failed", logger.WithFields("error", err.Error()))
	} else {
		log.Info("node deregistered")
	}
}

func waitForBackend(ctx context.Context, backendURL string, log *logger.Logger) bool {
	client := &http.Client{Timeout: 5 * time.Second}
	for i := 0; i < 30; i++ {
		select {
		case <-ctx.Done():
			return false
		default:
		}
		resp, err := client.Get(backendURL + "/healthz")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return true
			}
		}
		log.Debug("waiting for backend...", logger.WithFields("attempt", i+1))
		time.Sleep(2 * time.Second)
	}
	return false
}

func registerNode(ctx context.Context, cfg agentConfig, log *logger.Logger) error {
	body := map[string]any{
		"id":       cfg.NodeID,
		"hostname": cfg.Hostname,
		"nodeType": "k8s_pod",
		"labels": map[string]string{
			"dataDir":   cfg.DataDir,
			"skillsDir": cfg.SkillsDir,
		},
	}
	return postJSON(ctx, cfg.BackendURL+"/api/v1/nodes/register", body, log)
}

func deregisterNode(ctx context.Context, cfg agentConfig, log *logger.Logger) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, cfg.BackendURL+"/api/v1/nodes/"+cfg.NodeID, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("deregister returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func heartbeatLoop(ctx context.Context, cfg agentConfig, log *logger.Logger) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := sendHeartbeat(ctx, cfg, log); err != nil {
				log.Warn("heartbeat failed", logger.WithFields("error", err.Error()))
			} else {
				log.Debug("heartbeat sent")
			}
		}
	}
}

func sendHeartbeat(ctx context.Context, cfg agentConfig, log *logger.Logger) error {
	return postJSON(ctx, cfg.BackendURL+"/api/v1/nodes/"+cfg.NodeID+"/heartbeat", nil, log)
}

func postJSON(ctx context.Context, url string, body any, log *logger.Logger) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, reader)
	if err != nil {
		return err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("POST %s returned %d: %s", url, resp.StatusCode, string(respBody))
	}
	return nil
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
