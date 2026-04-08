package terminal

import (
	"context"

	"open-kraken/backend/go/internal/session"
	"open-kraken/backend/go/internal/terminal/intelligence"
	"open-kraken/backend/go/internal/terminal/polling"
	"open-kraken/backend/go/internal/terminal/semantic"
)

// pollingBridge adapts the session registry to the polling engine's interfaces.
type pollingBridge struct {
	registry *session.Registry
}

// CollectSnapshots implements polling.SnapshotCollector.
func (b *pollingBridge) CollectSnapshots() []polling.SessionSnapshot {
	actors := b.registry.IntelligentActors()
	out := make([]polling.SessionSnapshot, 0, len(actors))
	for _, a := range actors {
		out = append(out, a.PollSnapshot())
	}
	return out
}

// CollectWorkingSnapshots returns only sessions in Working state.
func (b *pollingBridge) CollectWorkingSnapshots() []polling.SessionSnapshot {
	all := b.CollectSnapshots()
	out := make([]polling.SessionSnapshot, 0)
	for _, s := range all {
		if s.Status.Status == intelligence.StatusWorking {
			out = append(out, s)
		}
	}
	return out
}

// DispatchAction implements polling.ActionDispatcher.
func (b *pollingBridge) DispatchAction(action polling.Action) {
	actor, ok := b.registry.Get(action.TerminalID)
	if !ok {
		return
	}

	intel := actor.IntelligenceModules()
	if intel == nil {
		return
	}

	switch action.Type {
	case polling.ActionSessionUpdate:
		changed, _ := intel.StatusEngine.Evaluate()
		if changed {
			actor.DrainDispatch()
		}

	case polling.ActionSemanticFlush:
		if intel.StatusEngine.EvaluateChat() {
			intel.SemanticWorker.Send(semantic.Event{
				Type:        semantic.EventFlush,
				FlushReason: action.FlushReason,
			})
			intel.StatusEngine.AckChatFlush()
			intel.DispatchQueue.AckInflight()
			actor.DrainDispatch()
		}

	case polling.ActionPostReadyStart:
		if intel.PostReady != nil {
			intel.PostReady.Start()
		}

	case polling.ActionPostReadyStep:
		if intel.PostReady != nil {
			intel.PostReady.Step(nil)
		}
	}
}

// StartPoller starts the polling engine as a background goroutine.
func (s *Service) StartPoller(ctx context.Context) {
	bridge := &pollingBridge{registry: s.registry}
	poller := polling.NewPoller(bridge, bridge)
	s.poller = poller
	go poller.Run(ctx)
}

// TriggerPoll wakes the poller for a specific terminal.
func (s *Service) TriggerPoll(terminalID string) {
	if s.poller != nil {
		s.poller.Trigger(terminalID)
	}
}
