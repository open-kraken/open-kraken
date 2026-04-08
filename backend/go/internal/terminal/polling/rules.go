package polling

import (
	"open-kraken/backend/go/internal/terminal/intelligence"
)

// BuildActions evaluates all polling rules against the given snapshots and
// returns the actions to execute. This is the core decision engine.
func BuildActions(snapshots []SessionSnapshot) []Action {
	var actions []Action
	for _, snap := range snapshots {
		actions = append(actions, evaluateSession(snap)...)
	}
	return actions
}

func evaluateSession(snap SessionSnapshot) []Action {
	var actions []Action

	// Rule 1: Working → Online silence timeout.
	if snap.Status.Status == intelligence.StatusWorking {
		// The StatusEngine.Evaluate() handles the actual timeout check.
		// Here we signal the poller to call Evaluate.
		actions = append(actions, Action{
			Type:       ActionSessionUpdate,
			TerminalID: snap.TerminalID,
		})
	}

	// Rule 2: Chat flush when output has stabilized.
	if snap.Status.ChatPending {
		actions = append(actions, Action{
			Type:        ActionSemanticFlush,
			TerminalID:  snap.TerminalID,
			FlushReason: "chat_pending",
		})
	}

	// Rule 3: Post-ready advancement.
	if snap.PostReady.State == "starting" && snap.PostReady.QueueLen > 0 {
		actions = append(actions, Action{
			Type:       ActionPostReadyStep,
			TerminalID: snap.TerminalID,
		})
	}

	// Rule 4: Connecting → start post-ready.
	if snap.Status.Status == intelligence.StatusConnecting && snap.ShellReady &&
		snap.PostReady.State == "idle" {
		actions = append(actions, Action{
			Type:       ActionPostReadyStart,
			TerminalID: snap.TerminalID,
		})
	}

	return actions
}
