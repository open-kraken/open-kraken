package stepLease

import (
	"context"
	"errors"
	"fmt"
	"path"
	"strings"
	"time"

	clientv3 "go.etcd.io/etcd/client/v3"
)

// EtcdLease is the production Lease backend. It uses etcd v3 native leases
// (server-side TTL) and compare-and-swap transactions to enforce exclusive
// assignment across a distributed fleet of FlowScheduler instances.
type EtcdLease struct {
	cli        *clientv3.Client
	keyPrefix  string // e.g. "/kraken/leases/step/"
	watchPath  string
	watchReady chan struct{} // closed once the background watch loop is running
}

// EtcdConfig configures an EtcdLease instance.
type EtcdConfig struct {
	Endpoints   []string
	DialTimeout time.Duration
	// KeyPrefix defaults to "/kraken/leases/step/" if empty.
	KeyPrefix string
}

// NewEtcdLease connects to an etcd cluster and returns a Lease backend.
// The caller retains ownership of the context only for the initial dial.
func NewEtcdLease(ctx context.Context, cfg EtcdConfig) (*EtcdLease, error) {
	if len(cfg.Endpoints) == 0 {
		return nil, errors.New("stepLease.NewEtcdLease: no endpoints")
	}
	dialTimeout := cfg.DialTimeout
	if dialTimeout == 0 {
		dialTimeout = 5 * time.Second
	}
	prefix := cfg.KeyPrefix
	if prefix == "" {
		prefix = "/kraken/leases/step/"
	}
	if !strings.HasSuffix(prefix, "/") {
		prefix += "/"
	}

	cli, err := clientv3.New(clientv3.Config{
		Endpoints:   cfg.Endpoints,
		DialTimeout: dialTimeout,
		Context:     ctx,
	})
	if err != nil {
		return nil, fmt.Errorf("stepLease: etcd dial: %w", err)
	}
	return &EtcdLease{
		cli:        cli,
		keyPrefix:  prefix,
		watchPath:  strings.TrimSuffix(prefix, "/"),
		watchReady: make(chan struct{}),
	}, nil
}

// Acquire performs a compare-and-swap: the lease key must not exist (version == 0)
// before it is inserted with a bound etcd lease ID. This guarantees that at most
// one node holds the step at any time.
func (e *EtcdLease) Acquire(ctx context.Context, stepID, nodeID string, ttl time.Duration) (*Handle, error) {
	lease, err := e.cli.Grant(ctx, int64(ttl.Seconds()))
	if err != nil {
		return nil, fmt.Errorf("stepLease.Acquire: grant: %w", err)
	}
	key := path.Join(e.keyPrefix, stepID)
	txn := e.cli.Txn(ctx).
		If(clientv3.Compare(clientv3.Version(key), "=", 0)).
		Then(clientv3.OpPut(key, nodeID, clientv3.WithLease(lease.ID)))

	resp, err := txn.Commit()
	if err != nil {
		// Revoke the wasted lease; we still tried to grant one.
		_, _ = e.cli.Revoke(context.Background(), lease.ID)
		return nil, fmt.Errorf("stepLease.Acquire: txn: %w", err)
	}
	if !resp.Succeeded {
		// Another node already holds the step.
		_, _ = e.cli.Revoke(context.Background(), lease.ID)
		return nil, ErrAlreadyHeld
	}

	return &Handle{
		StepID:    stepID,
		NodeID:    nodeID,
		ExpiresAt: time.Now().Add(ttl),
		opaque:    lease.ID,
	}, nil
}

// Keepalive extends the TTL of an existing lease. This is a one-shot renewal;
// callers that want continuous renewal should run this in a loop or use the
// etcd client's KeepAlive channel directly.
func (e *EtcdLease) Keepalive(ctx context.Context, h *Handle, ttl time.Duration) error {
	id, ok := h.opaque.(clientv3.LeaseID)
	if !ok {
		return fmt.Errorf("stepLease.Keepalive: wrong backend for handle")
	}
	_, err := e.cli.KeepAliveOnce(ctx, id)
	if err != nil {
		return ErrLeaseExpired
	}
	h.ExpiresAt = time.Now().Add(ttl)
	return nil
}

// Release revokes the etcd lease cleanly. This causes the holder key to be
// deleted immediately so the Watch listener observes the completion.
func (e *EtcdLease) Release(ctx context.Context, h *Handle) error {
	id, ok := h.opaque.(clientv3.LeaseID)
	if !ok {
		return nil
	}
	_, err := e.cli.Revoke(ctx, id)
	if err != nil {
		return fmt.Errorf("stepLease.Release: revoke: %w", err)
	}
	return nil
}

// Watch subscribes to DELETE events on the lease prefix. Every key deletion
// that is not paired with an explicit Release (which still triggers a DELETE,
// but the step will already be in a terminal AEL state by that point) is
// surfaced as an ExpiryEvent so the FlowScheduler can react.
//
// Note: etcd delivers DELETE for both Release and TTL expiry. Distinguishing
// the two from the watch alone is not possible; the FlowScheduler must cross-
// reference the AEL: if the Step is already in a terminal state, this was a
// clean release and no reassignment is needed.
func (e *EtcdLease) Watch(ctx context.Context) (<-chan ExpiryEvent, error) {
	out := make(chan ExpiryEvent, 32)
	watchChan := e.cli.Watch(ctx, e.watchPath, clientv3.WithPrefix())
	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case resp, ok := <-watchChan:
				if !ok {
					// Watch channel closed — propagate a synthetic signal so
					// callers can decide whether to re-subscribe.
					return
				}
				if err := resp.Err(); err != nil {
					// Compaction or other recoverable errors. The FlowScheduler
					// should call T4ExpiryBackupScanner periodically to catch
					// any missed expiries from these gaps.
					continue
				}
				for _, ev := range resp.Events {
					if ev.Type != clientv3.EventTypeDelete {
						continue
					}
					key := string(ev.Kv.Key)
					stepID := strings.TrimPrefix(key, e.keyPrefix)
					select {
					case out <- ExpiryEvent{StepID: stepID, Reason: "expired"}:
					case <-ctx.Done():
						return
					}
				}
			}
		}
	}()
	return out, nil
}

// Close tears down the etcd client connection.
func (e *EtcdLease) Close() error {
	if e.cli != nil {
		return e.cli.Close()
	}
	return nil
}
