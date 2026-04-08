package polling

import (
	"context"
	"log"
	"time"
)

// SnapshotCollector provides read-only session snapshots.
type SnapshotCollector interface {
	CollectSnapshots() []SessionSnapshot
	CollectWorkingSnapshots() []SessionSnapshot
}

// ActionDispatcher executes polling actions against live sessions.
type ActionDispatcher interface {
	DispatchAction(action Action)
}

// Poller runs the periodic polling loop. It collects snapshots, evaluates
// rules, and dispatches actions.
type Poller struct {
	collector  SnapshotCollector
	dispatcher ActionDispatcher
	triggerCh  chan string // receives terminal IDs for event-driven polling
}

// NewPoller creates a Poller.
func NewPoller(collector SnapshotCollector, dispatcher ActionDispatcher) *Poller {
	return &Poller{
		collector:  collector,
		dispatcher: dispatcher,
		triggerCh:  make(chan string, 64),
	}
}

// Trigger wakes the poller for a specific terminal. Non-blocking.
func (p *Poller) Trigger(terminalID string) {
	select {
	case p.triggerCh <- terminalID:
	default:
		// Channel full — poller will catch up on next tick.
	}
}

// Run starts the polling loop. Blocks until ctx is cancelled.
func (p *Poller) Run(ctx context.Context) {
	// Tick at the guardian interval for Working state decay.
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.pollWorking()
		case terminalID := <-p.triggerCh:
			p.pollTerminal(terminalID)
		}
	}
}

// pollWorking evaluates only sessions in the Working state (optimization).
func (p *Poller) pollWorking() {
	snapshots := p.collector.CollectWorkingSnapshots()
	if len(snapshots) == 0 {
		return
	}
	actions := BuildActions(snapshots)
	for _, a := range actions {
		p.dispatchSafe(a)
	}
}

// pollTerminal evaluates a single terminal by ID (event-driven path).
func (p *Poller) pollTerminal(terminalID string) {
	// Collect all and filter to the target. In a production system,
	// you'd have a CollectByID method, but this works for the MVP.
	snapshots := p.collector.CollectSnapshots()
	var target []SessionSnapshot
	for _, s := range snapshots {
		if s.TerminalID == terminalID {
			target = append(target, s)
			break
		}
	}
	if len(target) == 0 {
		return
	}
	actions := BuildActions(target)
	for _, a := range actions {
		p.dispatchSafe(a)
	}
}

func (p *Poller) dispatchSafe(a Action) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("poller: dispatch panic: %v", r)
		}
	}()
	p.dispatcher.DispatchAction(a)
}
