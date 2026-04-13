package instance

import "fmt"

// State is one of the eight AgentInstance lifecycle states defined in paper §5.4.3.
type State string

const (
	StateCreated    State = "created"
	StateScheduled  State = "scheduled"
	StateRunning    State = "running"
	StateIdle       State = "idle"
	StateSuspended  State = "suspended"
	StateResumed    State = "resumed"
	StateTerminated State = "terminated"
	StateCrashed    State = "crashed"
)

// TransitionError is returned when a proposed transition is not allowed.
type TransitionError struct {
	From State
	To   State
}

func (e *TransitionError) Error() string {
	return fmt.Sprintf("instance fsm: invalid transition %s → %s", e.From, e.To)
}

// The FSM follows paper §5.4.3 Figure:
//
//                  ┌─────────┐
//                  │ created │
//                  └────┬────┘
//                       │ (pool assignment)
//                  ┌────▼──────┐
//                  │ scheduled │
//                  └────┬──────┘
//                       │ (Step assigned)
//            ┌──────────▼──────────┐
//  ┌─────────│       running       │─────────┐
//  │         └──────────┬──────────┘         │
//  │(Policy             │ (Step commit T2)   │(provider error /
//  │ intercept)   ┌─────▼──────┐             │ watchdog timeout)
//  │              │    idle    │             │
//  │              └──┬──────┬──┘             │
//  │   (next Step)   │      │ (idle timeout) │
//  │         ┌───────┘      │                │
//  │         │         ┌────▼──────────┐     │
//  ┌───▼──────┐  │         │  terminated   │     │
//  │suspended │  │         └───────────────┘     │
//  └────┬─────┘  │                               │
//       │        │                          ┌────▼───┐
//       │(resume)│                          │ crashed│
//  ┌────▼──────┐ │                          └────────┘
//  │  resumed  │─┘
//  └───────────┘

var transitions = map[State]map[State]struct{}{
	StateCreated: {
		StateScheduled:  {},
		StateTerminated: {}, // abort during spawn
	},
	StateScheduled: {
		StateRunning:    {}, // Step dispatched
		StateIdle:       {}, // pool reaping before first step (unusual but legal)
		StateTerminated: {},
	},
	StateRunning: {
		StateIdle:      {}, // T2 commit path
		StateSuspended: {}, // Policy Plane approval gate
		StateCrashed:   {}, // provider error / watchdog timeout
	},
	StateIdle: {
		StateRunning:    {}, // next Step assigned — identity persists
		StateTerminated: {}, // idle timeout reaper
		StateCrashed:    {}, // unexpected backend failure while idle
	},
	StateSuspended: {
		StateResumed:    {}, // approval granted
		StateTerminated: {}, // operator abort during approval wait
		StateCrashed:    {},
	},
	StateResumed: {
		StateRunning:    {}, // continue from checkpoint
		StateCrashed:    {},
		StateTerminated: {},
	},
	// terminated and crashed are absorbing.
}

// Validate returns nil iff `from → to` is allowed.
func Validate(from, to State) error {
	if from == to {
		return nil // idempotent no-op
	}
	allowed, ok := transitions[from]
	if !ok {
		return &TransitionError{From: from, To: to}
	}
	if _, ok := allowed[to]; !ok {
		return &TransitionError{From: from, To: to}
	}
	return nil
}

// IsTerminal reports whether s is a terminal state.
func IsTerminal(s State) bool {
	return s == StateTerminated || s == StateCrashed
}

// IsIdleOrScheduled reports whether the instance can accept a new Step assignment.
func IsIdleOrScheduled(s State) bool {
	return s == StateIdle || s == StateScheduled
}
