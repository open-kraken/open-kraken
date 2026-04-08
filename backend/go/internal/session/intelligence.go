package session

import (
	"context"

	"open-kraken/backend/go/internal/terminal/dispatch"
	"open-kraken/backend/go/internal/terminal/intelligence"
	"open-kraken/backend/go/internal/terminal/polling"
	"open-kraken/backend/go/internal/terminal/postready"
	"open-kraken/backend/go/internal/terminal/semantic"
)

// Intelligence holds the enhanced terminal state modules attached to an Actor.
// It is nil for actors created without intelligence support (backward compat).
type Intelligence struct {
	StatusEngine   *intelligence.StatusEngine
	FlowControl    *intelligence.FlowControl
	SemanticWorker *semantic.Worker
	PostReady      *postready.Executor
	DispatchQueue  *dispatch.Queue
	cancelSemantic context.CancelFunc
}

// IntelligenceConfig configures the intelligence modules for a session.
type IntelligenceConfig struct {
	TerminalType string
	MessageSink  semantic.MessageSink
	PostReadyPlan postready.Plan
}

// EnableIntelligence attaches intelligence modules to an actor.
// Should be called after NewActor but before the session is used.
func (a *Actor) EnableIntelligence(ctx context.Context, cfg IntelligenceConfig) {
	a.mu.Lock()
	defer a.mu.Unlock()

	se := intelligence.NewStatusEngine()
	fc := intelligence.NewFlowControl()

	sw := semantic.NewWorker(
		a.info.SessionID,
		a.info.MemberID,
		a.info.WorkspaceID,
		cfg.TerminalType,
		cfg.MessageSink,
	)

	var pr *postready.Executor
	if len(cfg.PostReadyPlan.Steps) > 0 {
		pr = postready.NewExecutor(cfg.PostReadyPlan, a)
	}

	dq := dispatch.NewQueue()

	semCtx, semCancel := context.WithCancel(ctx)
	go sw.Run(semCtx)

	a.intelligence = &Intelligence{
		StatusEngine:   se,
		FlowControl:    fc,
		SemanticWorker: sw,
		PostReady:      pr,
		DispatchQueue:  dq,
		cancelSemantic: semCancel,
	}
}

// HasIntelligence returns true if intelligence modules are attached.
func (a *Actor) HasIntelligence() bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.intelligence != nil
}

// IntelligenceModules returns the intelligence modules (nil if not enabled).
func (a *Actor) IntelligenceModules() *Intelligence {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.intelligence
}

// IntelligenceStatus returns the status engine's current status,
// falling back to the basic session status if intelligence is not enabled.
func (a *Actor) IntelligenceStatus() string {
	a.mu.RLock()
	intel := a.intelligence
	a.mu.RUnlock()

	if intel != nil {
		return string(intel.StatusEngine.Status())
	}
	return string(a.Info().Status)
}

// PollSnapshot creates a polling snapshot for the polling engine.
func (a *Actor) PollSnapshot() polling.SessionSnapshot {
	a.mu.RLock()
	intel := a.intelligence
	info := a.info
	a.mu.RUnlock()

	snap := polling.SessionSnapshot{
		TerminalID:   info.SessionID,
		TerminalType: info.TerminalType,
		MemberID:     info.MemberID,
		WorkspaceID:  info.WorkspaceID,
		ShellReady:   true,
		UIActive:     len(a.subscribers) > 0,
	}

	if intel != nil {
		snap.Status = intel.StatusEngine.Snapshot()
		snap.ShellReady = intel.StatusEngine.ShellReady()
		if intel.PostReady != nil {
			snap.PostReady = polling.PostReadySnapshot{
				State:    string(intel.PostReady.State()),
				QueueLen: intel.PostReady.QueueLen(),
			}
		}
	}

	return snap
}

// OnOutputIntelligence is called by handleOutput when intelligence is enabled.
// It feeds the status engine, flow control, and semantic worker.
func (a *Actor) OnOutputIntelligence(data string) {
	intel := a.intelligence
	if intel == nil {
		return
	}

	intel.StatusEngine.OnOutput(len(data))
	intel.FlowControl.Add(len(data))
	intel.SemanticWorker.Send(semantic.Event{
		Type: semantic.EventOutput,
		Data: []byte(data),
	})
}

// OnInputIntelligence is called when user input is sent.
func (a *Actor) OnInputIntelligence(data string, ctx DispatchContext) {
	intel := a.intelligence
	if intel == nil {
		return
	}

	intel.StatusEngine.OnInput()
	intel.SemanticWorker.Send(semantic.Event{
		Type:             semantic.EventUserInput,
		Text:             data,
		ConversationID:   ctx.ConversationID,
		ConversationType: ctx.ConversationType,
		SenderID:         ctx.SenderID,
		SenderName:       ctx.SenderName,
	})
}

// AckBytes acknowledges received bytes from the frontend for flow control.
func (a *Actor) AckBytes(n int) {
	a.mu.RLock()
	intel := a.intelligence
	a.mu.RUnlock()
	if intel != nil {
		intel.FlowControl.Ack(n)
	}
}

// EnqueueDispatch adds a command to the dispatch queue.
func (a *Actor) EnqueueDispatch(entry dispatch.Entry) bool {
	a.mu.RLock()
	intel := a.intelligence
	a.mu.RUnlock()
	if intel == nil {
		return false
	}
	return intel.DispatchQueue.Enqueue(entry)
}

// DrainDispatch attempts to dequeue and execute the next dispatch command.
func (a *Actor) DrainDispatch() {
	a.mu.RLock()
	intel := a.intelligence
	a.mu.RUnlock()
	if intel == nil {
		return
	}

	entry := intel.DispatchQueue.Dequeue()
	if entry == nil {
		return
	}

	if err := a.WriteInput(entry.Data); err != nil {
		intel.DispatchQueue.FailInflight()
		return
	}
	// Ack will be called when the semantic flush completes.
}

// CloseIntelligence shuts down intelligence modules.
func (a *Actor) CloseIntelligence() {
	a.mu.Lock()
	intel := a.intelligence
	a.mu.Unlock()
	if intel == nil {
		return
	}

	intel.SemanticWorker.Send(semantic.Event{Type: semantic.EventShutdown})
	if intel.cancelSemantic != nil {
		intel.cancelSemantic()
	}
	intel.StatusEngine.SetOffline()
}
