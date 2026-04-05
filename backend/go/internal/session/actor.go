package session

import (
	"context"
	"fmt"
	"io"
	"strings"
	"sync"
	"time"

	"open-kraken/backend/go/internal/pty"
	"open-kraken/backend/go/internal/realtime"
)

const maxRetainedDeltas = 256

type Publisher interface {
	Publish(event realtime.Event) realtime.Event
}

// Actor owns the terminal state machine.
// Allowed transitions:
//
//	idle -> starting by service create
//	starting -> attached by subscriber attach
//	starting/attached -> running by process output or accepted input/dispatch
//	starting/attached/running -> exited by process exit or explicit close
//	starting/attached/running -> error by process failure
//	exited/error are terminal and never transition again
type Actor struct {
	mu          sync.RWMutex
	info        SessionInfo
	process     pty.Process
	publisher   Publisher
	buffer      string
	rows        uint16
	cols        uint16
	cursor      Cursor
	cancel      context.CancelFunc
	subscribers map[string]uint64
	deltas      []DeltaPayload
	processExit *ProcessExit
}

func NewActor(ctx context.Context, req CreateRequest, process pty.Process, publisher Publisher) *Actor {
	childCtx, cancel := context.WithCancel(ctx)
	now := time.Now().UTC()
	actor := &Actor{
		info: SessionInfo{
			SessionID:    req.SessionID,
			MemberID:     req.MemberID,
			WorkspaceID:  req.WorkspaceID,
			TerminalType: req.TerminalType,
			Command:      req.Command,
			Status:       StatusIdle,
			KeepAlive:    req.KeepAlive,
			Metadata:     req.Metadata,
			CreatedAt:    now,
			UpdatedAt:    now,
		},
		process:     process,
		publisher:   publisher,
		rows:        req.Rows,
		cols:        req.Cols,
		cancel:      cancel,
		subscribers: make(map[string]uint64),
	}
	actor.transitionLocked(StatusStarting)
	actor.publishStatus("")
	go actor.run(childCtx)
	return actor
}

func (a *Actor) ID() string          { return a.info.SessionID }
func (a *Actor) MemberID() string    { return a.info.MemberID }
func (a *Actor) WorkspaceID() string { return a.info.WorkspaceID }

func (a *Actor) Info() SessionInfo {
	a.mu.RLock()
	defer a.mu.RUnlock()
	info := a.info
	info.SubscriberCount = len(a.subscribers)
	return info
}

// Attach supports multiple subscribers. Re-attaching the same subscriber ID is
// idempotent: it updates the watermark and replays the retained gap from AfterSeq.
// Exited sessions still return a frozen snapshot and status; unknown sessions are
// rejected by Service before reaching the actor.
func (a *Actor) Attach(req AttachRequest) (AttachEnvelope, error) {
	if strings.TrimSpace(req.SubscriberID) == "" {
		return AttachEnvelope{}, fmt.Errorf("subscriberId is required")
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	if a.info.Status == StatusIdle || a.info.Status == StatusStarting {
		a.transitionLocked(StatusAttached)
	}

	deltas := a.collectDeltasLocked(req.SubscriberID, req.AfterSeq)
	a.subscribers[req.SubscriberID] = a.info.Seq
	a.info.SubscriberCount = len(a.subscribers)
	envelope := AttachEnvelope{
		Snapshot: SnapshotPayload{
			SessionID:      a.info.SessionID,
			SubscriberID:   req.SubscriberID,
			Seq:            a.info.Seq,
			Rows:           a.rows,
			Cols:           a.cols,
			Cursor:         a.cursor,
			TerminalStatus: a.info.Status,
			ProcessExit:    a.copyProcessExitLocked(),
			Buffer:         a.buffer,
		},
		Deltas: deltas,
		Status: a.statusPayloadLocked(req.SubscriberID),
	}
	return envelope, nil
}

func (a *Actor) WriteInput(data string) error {
	if data == "" {
		return nil
	}
	a.mu.Lock()
	if a.isFrozenLocked() {
		a.mu.Unlock()
		return fmt.Errorf("session is not writable in status %s", a.info.Status)
	}
	if a.info.Status == StatusStarting || a.info.Status == StatusAttached {
		a.transitionLocked(StatusRunning)
	}
	a.mu.Unlock()
	_, err := a.process.Write([]byte(data))
	return err
}

func (a *Actor) Dispatch(data string, ctx DispatchContext) error {
	a.mu.RLock()
	payload := DispatchPayload{
		SessionID:      a.info.SessionID,
		Seq:            a.info.Seq,
		Data:           data,
		TerminalStatus: a.info.Status,
		Context:        ctx,
	}
	a.mu.RUnlock()
	a.publisher.Publish(realtime.Event{
		Name:        EventDispatch,
		TerminalID:  payload.SessionID,
		MemberID:    a.info.MemberID,
		WorkspaceID: a.info.WorkspaceID,
		Payload:     payload,
	})
	return a.WriteInput(data)
}

func (a *Actor) Resize(cols, rows uint16) error {
	a.mu.Lock()
	a.cols = cols
	a.rows = rows
	a.info.UpdatedAt = time.Now().UTC()
	a.mu.Unlock()
	return a.process.Resize(cols, rows)
}

func (a *Actor) Close() error {
	a.cancel()
	a.mu.Lock()
	if !a.isFrozenLocked() {
		a.processExit = &ProcessExit{}
		a.transitionLocked(StatusExited)
	}
	a.mu.Unlock()
	a.publishStatus("")
	return a.process.Close()
}

func (a *Actor) run(ctx context.Context) {
	outputDone := make(chan struct{})
	go func() {
		defer close(outputDone)
		buf := make([]byte, 4096)
		for {
			n, err := a.process.Read(buf)
			if n > 0 {
				a.handleOutput(string(buf[:n]))
			}
			if err != nil {
				if err != io.EOF && ctx.Err() == nil {
					a.handleError(err)
				}
				return
			}
		}
	}()

	select {
	case <-ctx.Done():
	case exit := <-a.process.Wait():
		a.handleExit(exit)
	}
	<-outputDone
}

func (a *Actor) handleOutput(data string) {
	a.mu.Lock()
	if a.isFrozenLocked() {
		a.mu.Unlock()
		return
	}
	if a.info.Status != StatusRunning {
		a.transitionLocked(StatusRunning)
	}
	a.info.Seq++
	a.info.UpdatedAt = time.Now().UTC()
	a.buffer += data
	a.advanceCursorLocked(data)
	delta := DeltaPayload{
		SessionID:      a.info.SessionID,
		Seq:            a.info.Seq,
		Data:           data,
		Cursor:         a.cursor,
		TerminalStatus: a.info.Status,
		ProcessExit:    a.copyProcessExitLocked(),
	}
	a.deltas = append(a.deltas, delta)
	if len(a.deltas) > maxRetainedDeltas {
		a.deltas = append([]DeltaPayload(nil), a.deltas[len(a.deltas)-maxRetainedDeltas:]...)
	}
	a.mu.Unlock()

	a.publisher.Publish(realtime.Event{
		Name:        EventDelta,
		TerminalID:  delta.SessionID,
		MemberID:    a.info.MemberID,
		WorkspaceID: a.info.WorkspaceID,
		Payload: realtime.TerminalDeltaPayload{
			TerminalID: delta.SessionID,
			Sequence:   delta.Seq,
			Data:       delta.Data,
		},
	})
	a.publishStatus("")
}

func (a *Actor) handleExit(exit pty.Exit) {
	a.mu.Lock()
	if a.isFrozenLocked() {
		a.mu.Unlock()
		return
	}
	a.processExit = &ProcessExit{Code: exit.Code, Signal: exit.Signal}
	a.transitionLocked(StatusExited)
	a.mu.Unlock()
	a.publishStatus("")
}

func (a *Actor) handleError(err error) {
	a.mu.Lock()
	if a.isFrozenLocked() {
		a.mu.Unlock()
		return
	}
	a.processExit = &ProcessExit{Signal: err.Error()}
	a.transitionLocked(StatusError)
	a.mu.Unlock()
	a.publishStatus("")
}

func (a *Actor) collectDeltasLocked(subscriberID string, afterSeq uint64) []DeltaPayload {
	out := make([]DeltaPayload, 0, len(a.deltas))
	for _, item := range a.deltas {
		if item.Seq <= afterSeq {
			continue
		}
		copyItem := item
		copyItem.SubscriberID = subscriberID
		out = append(out, copyItem)
	}
	return out
}

func (a *Actor) advanceCursorLocked(data string) {
	a.cursor.Row += uint16(strings.Count(data, "\n"))
	if idx := strings.LastIndex(data, "\n"); idx >= 0 {
		a.cursor.Col = uint16(len(data) - idx - 1)
		return
	}
	a.cursor.Col += uint16(len(data))
}

func (a *Actor) transitionLocked(next Status) {
	if a.isFrozenLocked() {
		return
	}
	a.info.Status = next
	a.info.UpdatedAt = time.Now().UTC()
}

func (a *Actor) isFrozenLocked() bool {
	return a.info.Status == StatusExited || a.info.Status == StatusError
}

func (a *Actor) copyProcessExitLocked() *ProcessExit {
	if a.processExit == nil {
		return nil
	}
	copyExit := *a.processExit
	return &copyExit
}

func (a *Actor) statusPayloadLocked(subscriberID string) StatusPayload {
	return StatusPayload{
		SessionID:      a.info.SessionID,
		SubscriberID:   subscriberID,
		Seq:            a.info.Seq,
		TerminalStatus: a.info.Status,
		ProcessExit:    a.copyProcessExitLocked(),
	}
}

func (a *Actor) publishStatus(subscriberID string) {
	a.mu.RLock()
	payload := a.statusPayloadLocked(subscriberID)
	memberID := a.info.MemberID
	workspaceID := a.info.WorkspaceID
	connectionState := a.connectionStateLocked(subscriberID)
	processState := ProcessState(a.info.Status)
	a.mu.RUnlock()
	a.publisher.Publish(realtime.Event{
		Name:        EventStatus,
		TerminalID:  payload.SessionID,
		MemberID:    memberID,
		WorkspaceID: workspaceID,
		Payload: realtime.TerminalStatusPayload{
			TerminalID:      payload.SessionID,
			ConnectionState: connectionState,
			ProcessState:    processState,
			Reason:          statusReason(payload.TerminalStatus),
		},
	})
}

func (a *Actor) connectionStateLocked(subscriberID string) string {
	if subscriberID != "" || len(a.subscribers) > 0 {
		return "attached"
	}
	return "detached"
}

func statusReason(status Status) string {
	switch status {
	case StatusStarting:
		return "process_starting"
	case StatusAttached:
		return "subscriber_attached"
	case StatusRunning:
		return "process_running"
	case StatusExited:
		return "process_exited"
	case StatusError:
		return "process_failed"
	default:
		return ""
	}
}
