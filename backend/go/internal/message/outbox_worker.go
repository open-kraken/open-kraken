package message

import (
	"context"
	"log"
	"time"
)

// DispatchFunc is called by the outbox worker to deliver a message to a
// terminal session. It receives the outbox task and should return an error
// if delivery fails.
type DispatchFunc func(ctx context.Context, task OutboxTask) error

// OutboxWorker polls the outbox store and delivers pending tasks.
type OutboxWorker struct {
	store    *OutboxStore
	dispatch DispatchFunc
	msgSvc   *Service
}

// NewOutboxWorker creates an outbox worker.
func NewOutboxWorker(store *OutboxStore, dispatch DispatchFunc, msgSvc *Service) *OutboxWorker {
	return &OutboxWorker{
		store:    store,
		dispatch: dispatch,
		msgSvc:   msgSvc,
	}
}

// Run starts the outbox polling loop. It blocks until ctx is cancelled.
func (w *OutboxWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(OutboxPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.poll(ctx)
		}
	}
}

func (w *OutboxWorker) poll(ctx context.Context) {
	tasks, err := w.store.ClaimDue(ctx, OutboxClaimLimit)
	if err != nil {
		log.Printf("outbox: claim error: %v", err)
		return
	}

	for _, task := range tasks {
		if err := w.dispatch(ctx, task); err != nil {
			attempts := task.Attempts + 1
			if markErr := w.store.MarkFailed(ctx, task.MessageID, attempts, err.Error()); markErr != nil {
				log.Printf("outbox: mark failed error: %v", markErr)
			}
			// If max attempts reached, update the original message status to failed.
			if attempts >= OutboxMaxAttempts && w.msgSvc != nil {
				_ = w.msgSvc.UpdateStatus(ctx, task.MessageID, StatusFailed)
			}
			continue
		}

		if err := w.store.MarkSent(ctx, task.MessageID); err != nil {
			log.Printf("outbox: mark sent error: %v", err)
		}
		// Update the original message status: sent (dispatched to terminal),
		// then delivered once the terminal acknowledges.
		if w.msgSvc != nil {
			_ = w.msgSvc.UpdateStatus(ctx, task.MessageID, StatusDelivered)
		}
	}
}
