package realtime

import (
	"errors"
	"fmt"
)

var ErrCursorExpired = errors.New("cursor outside replay window")
var ErrCursorAhead = errors.New("cursor ahead of server head")

type SubscribeRequest struct {
	WorkspaceID string
	Families    []string
	ChannelIDs  []string
	TerminalIDs []string
	MemberIDs   []string
	Cursor      string
}

type SubscribeResult struct {
	Mode           string
	ResyncRequired bool
	Events         []Event
	LatestCursor   string
	Subscription   *Subscription
}

type Subscription struct {
	Events <-chan Event

	events chan Event
	filter filter
	state  subscriptionState
	hub    *Hub
}

type subscriptionState struct {
	lastDelivered uint64
	lastAcked     uint64
}

func (s *Subscription) Ack(cursor string) error {
	seq, err := ParseCursor(cursor)
	if err != nil {
		return err
	}
	if seq > s.state.lastDelivered {
		return fmt.Errorf("ack cursor %s exceeds delivered cursor %s", cursor, NewCursor(s.state.lastDelivered))
	}
	s.state.lastAcked = seq
	return nil
}

func (s *Subscription) Close() {
	s.hub.unsubscribe(s)
}
