package terminal

import (
	"context"
	"fmt"
	"strings"
	"sync/atomic"

	"open-kraken/backend/go/internal/authz"
	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
	"open-kraken/backend/go/internal/session"
)

// Service exposes stable session semantics:
//   - multiple subscribers may attach to one session
//   - duplicate attach by the same subscriber is allowed and replays the retained gap
//   - unknown sessions return session.ErrSessionNotFound
//   - exited sessions can be re-attached for frozen snapshot/status replay but reject input/dispatch
type Service struct {
	registry *session.Registry
	launcher pty.Launcher
	hub      *realtime.Hub
	counter  atomic.Uint64
}

func NewService(registry *session.Registry, launcher pty.Launcher, hub *realtime.Hub) *Service {
	return &Service{registry: registry, launcher: launcher, hub: hub}
}

func (s *Service) CreateSession(ctx context.Context, req session.CreateRequest) (session.SessionInfo, error) {
	if req.SessionID == "" {
		req.SessionID = fmt.Sprintf("session-%d", s.counter.Add(1))
	}
	if req.Cols == 0 {
		req.Cols = 80
	}
	if req.Rows == 0 {
		req.Rows = 24
	}
	process, err := s.launcher.Launch(ctx, pty.LaunchRequest{
		Command: req.Command,
		CWD:     req.CWD,
		Cols:    req.Cols,
		Rows:    req.Rows,
	})
	if err != nil {
		return session.SessionInfo{}, err
	}
	actor := session.NewActor(ctx, req, process, s.hub)
	if err := s.registry.Add(actor); err != nil {
		_ = actor.Close()
		return session.SessionInfo{}, err
	}
	return actor.Info(), nil
}

func (s *Service) AttachSession(req session.AttachRequest) (session.AttachEnvelope, error) {
	actor, ok := s.registry.Get(strings.TrimSpace(req.SessionID))
	if !ok {
		return session.AttachEnvelope{}, fmt.Errorf("%w: %s", session.ErrSessionNotFound, req.SessionID)
	}
	envelope, err := actor.Attach(req)
	if err != nil {
		return session.AttachEnvelope{}, err
	}
	s.hub.Publish(realtime.Event{
		Name:        session.EventSnapshot,
		TerminalID:  envelope.Snapshot.SessionID,
		MemberID:    actor.MemberID(),
		WorkspaceID: actor.WorkspaceID(),
		Payload: realtime.TerminalSnapshotPayload{
			TerminalID:      envelope.Snapshot.SessionID,
			ConnectionState: "attached",
			ProcessState:    session.ProcessState(envelope.Snapshot.TerminalStatus),
			Rows:            int(envelope.Snapshot.Rows),
			Cols:            int(envelope.Snapshot.Cols),
			Buffer:          envelope.Snapshot.Buffer,
		},
	})
	return envelope, nil
}

func (s *Service) AttachSessionAuthorized(req session.AttachRequest, authCtx authz.AuthContext, authorizer authz.Service) (session.AttachEnvelope, error) {
	actor, ok := s.registry.Get(strings.TrimSpace(req.SessionID))
	if !ok {
		return session.AttachEnvelope{}, fmt.Errorf("%w: %s", session.ErrSessionNotFound, req.SessionID)
	}
	info := actor.Info()
	authCtx.WorkspaceID = info.WorkspaceID
	authCtx.TargetMemberID = info.MemberID
	if authCtx.ResourceOwner == "" {
		authCtx.ResourceOwner = info.MemberID
	}
	authCtx.Action = authz.ActionTerminalAttach
	if err := authorizer.Enforce(authCtx); err != nil {
		return session.AttachEnvelope{}, err
	}
	return s.AttachSession(req)
}

func (s *Service) WriteInput(sessionID, data string) error {
	actor, ok := s.registry.Get(strings.TrimSpace(sessionID))
	if !ok {
		return fmt.Errorf("%w: %s", session.ErrSessionNotFound, sessionID)
	}
	return actor.WriteInput(data)
}

func (s *Service) Dispatch(sessionID, data string, ctx session.DispatchContext) error {
	actor, ok := s.registry.Get(strings.TrimSpace(sessionID))
	if !ok {
		return fmt.Errorf("%w: %s", session.ErrSessionNotFound, sessionID)
	}
	return actor.Dispatch(data, ctx)
}

func (s *Service) DispatchAuthorized(sessionID, data string, ctx session.DispatchContext, authCtx authz.AuthContext, authorizer authz.Service) error {
	actor, ok := s.registry.Get(strings.TrimSpace(sessionID))
	if !ok {
		return fmt.Errorf("%w: %s", session.ErrSessionNotFound, sessionID)
	}
	info := actor.Info()
	authCtx.WorkspaceID = info.WorkspaceID
	authCtx.ConversationID = ctx.ConversationID
	authCtx.TargetMemberID = info.MemberID
	if authCtx.ResourceOwner == "" {
		authCtx.ResourceOwner = info.MemberID
	}
	authCtx.Action = authz.ActionTerminalDispatch
	if err := authorizer.Enforce(authCtx); err != nil {
		return err
	}
	return s.Dispatch(sessionID, data, ctx)
}

func (s *Service) Resize(sessionID string, cols, rows uint16) error {
	actor, ok := s.registry.Get(strings.TrimSpace(sessionID))
	if !ok {
		return fmt.Errorf("%w: %s", session.ErrSessionNotFound, sessionID)
	}
	return actor.Resize(cols, rows)
}

func (s *Service) Close(sessionID string) error {
	actor, ok := s.registry.Get(strings.TrimSpace(sessionID))
	if !ok {
		return fmt.Errorf("%w: %s", session.ErrSessionNotFound, sessionID)
	}
	return actor.Close()
}

func (s *Service) ListSessions(workspaceID string) []session.SessionInfo {
	return s.registry.List(strings.TrimSpace(workspaceID))
}

func (s *Service) ResolveMemberSession(workspaceID, memberID string) (string, bool) {
	return s.registry.ResolveMemberSession(strings.TrimSpace(workspaceID), strings.TrimSpace(memberID))
}
