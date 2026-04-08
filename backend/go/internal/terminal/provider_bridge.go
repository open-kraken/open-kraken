package terminal

import (
	"context"
	"fmt"

	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal/provider"
	"open-kraken/backend/go/internal/terminal/semantic"
)

// CreateSessionWithProvider creates a session using the provider registry to
// resolve the command, flags, and post-ready plan for the given terminal type.
//
// If terminalType is empty or unrecognized, falls back to shell.
// If customCommand is non-empty, it overrides the provider's default.
func (s *Service) CreateSessionWithProvider(
	ctx context.Context,
	req session.CreateRequest,
	registry *provider.Registry,
	messageSink semantic.MessageSink,
	unlimitedAccess bool,
) (session.SessionInfo, error) {
	if registry == nil {
		return s.CreateSession(ctx, req)
	}

	cfg, _ := registry.Resolve(req.TerminalType)

	// Apply provider command if not overridden.
	if req.Command == "" {
		req.Command = cfg.ResolveCommand("", unlimitedAccess)
	} else if unlimitedAccess {
		req.Command = cfg.ApplyUnlimitedAccess(req.Command)
	}

	// Shell provider: use system shell.
	if req.Command == "" {
		req.Command = defaultShell()
	}

	// Create the session.
	info, err := s.CreateSession(ctx, req)
	if err != nil {
		return info, err
	}

	// Enable intelligence with the provider's post-ready plan.
	actor, ok := s.registry.Get(info.SessionID)
	if ok {
		actor.EnableIntelligence(ctx, session.IntelligenceConfig{
			TerminalType:  cfg.TerminalType,
			MessageSink:   messageSink,
			PostReadyPlan: cfg.PostReadyPlan,
		})
		// Start the poller trigger for this session.
		s.TriggerPoll(info.SessionID)
	}

	return info, nil
}

// CreateSessionForMember is a convenience method that resolves the provider
// from a member's terminal type and creates the session.
func (s *Service) CreateSessionForMember(
	ctx context.Context,
	memberID, workspaceID, terminalType, customCommand, cwd string,
	registry *provider.Registry,
	messageSink semantic.MessageSink,
) (session.SessionInfo, error) {
	req := session.CreateRequest{
		SessionID:    fmt.Sprintf("session-%d", s.counter.Add(1)),
		MemberID:     memberID,
		WorkspaceID:  workspaceID,
		TerminalType: terminalType,
		Command:      customCommand,
		CWD:          cwd,
		Cols:         80,
		Rows:         24,
		KeepAlive:    true,
	}
	return s.CreateSessionWithProvider(ctx, req, registry, messageSink, false)
}

func defaultShell() string {
	// On Unix, default to bash. On Windows, cmd.
	return "/bin/bash"
}
