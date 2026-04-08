package dispatch

import (
	"testing"
	"time"
)

func TestQueueEnqueueDequeue(t *testing.T) {
	q := NewQueue()
	ok := q.Enqueue(Entry{Data: "hello", MessageID: "m1", QueuedAt: time.Now()})
	if !ok {
		t.Fatal("expected enqueue success")
	}
	if q.Len() != 1 {
		t.Fatalf("expected len 1, got %d", q.Len())
	}

	entry := q.Dequeue()
	if entry == nil {
		t.Fatal("expected entry")
	}
	if entry.Data != "hello" {
		t.Fatalf("expected 'hello', got %q", entry.Data)
	}
	if !q.IsInflight() {
		t.Fatal("expected inflight after dequeue")
	}
}

func TestQueueInflightBlocks(t *testing.T) {
	q := NewQueue()
	q.Enqueue(Entry{Data: "first", MessageID: "m1"})
	q.Enqueue(Entry{Data: "second", MessageID: "m2"})

	q.Dequeue() // takes first, sets inflight

	// Second should not be dequeued while inflight.
	entry := q.Dequeue()
	if entry != nil {
		t.Fatal("expected nil while inflight")
	}

	q.AckInflight()
	entry = q.Dequeue()
	if entry == nil || entry.Data != "second" {
		t.Fatal("expected 'second' after ack")
	}
}

func TestQueueDedup(t *testing.T) {
	q := NewQueue()
	q.Enqueue(Entry{Data: "hello", MessageID: "m1"})
	ok := q.Enqueue(Entry{Data: "hello again", MessageID: "m1"})
	if ok {
		t.Fatal("expected dedup rejection")
	}
	if q.Len() != 1 {
		t.Fatalf("expected len 1 after dedup, got %d", q.Len())
	}
}

func TestQueueLimit(t *testing.T) {
	q := NewQueue()
	for i := 0; i < 32; i++ {
		q.Enqueue(Entry{Data: "msg"})
	}
	ok := q.Enqueue(Entry{Data: "overflow"})
	if ok {
		t.Fatal("expected queue full rejection")
	}
}

func TestDequeueBatch(t *testing.T) {
	q := NewQueue()
	q.Enqueue(Entry{Data: "first", MessageID: "m1"})
	q.Enqueue(Entry{Data: "second", MessageID: "m2"})
	q.Enqueue(Entry{Data: "third", MessageID: "m3"})

	batch := q.DequeueBatch()
	if len(batch) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(batch))
	}
	if q.Len() != 0 {
		t.Fatalf("expected empty queue after batch, got %d", q.Len())
	}
	if !q.IsInflight() {
		t.Fatal("expected inflight after batch")
	}
}

func TestMergeBatchData(t *testing.T) {
	entries := []Entry{
		{Data: "first"},
		{Data: "second"},
		{Data: "third"},
	}
	merged := MergeBatchData(entries)
	expected := "first\n\nsecond\n\nthird"
	if merged != expected {
		t.Fatalf("expected %q, got %q", expected, merged)
	}
}

func TestMergeBatchDataSingle(t *testing.T) {
	entries := []Entry{{Data: "only"}}
	if MergeBatchData(entries) != "only" {
		t.Fatal("single entry should not have separator")
	}
}
