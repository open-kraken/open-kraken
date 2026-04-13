package ael

import "fmt"

// The FSM validator enforces state monotonicity (Lemma 5.1 in the paper).
// Any transition that is not explicitly listed here is rejected before a
// database UPDATE is issued. Terminal states ("succeeded", "failed", "cancelled",
// "expired") are absorbing: they have no outgoing edges, which is the
// structural property UCB-1 convergence depends on (Proposition 5.1).
//
// Note on Step "expired": it is a sink from the Step's point of view (the
// instance that held the lease cannot commit to succeeded anymore), but the
// FlowScheduler may create a fresh Step record for retry — a separate row, not
// a state transition on the original Step.

// FSMError is returned when a proposed state transition is not valid.
type FSMError struct {
	Entity string
	From   string
	To     string
}

func (e *FSMError) Error() string {
	return fmt.Sprintf("ael fsm: invalid %s transition %s → %s", e.Entity, e.From, e.To)
}

// --- Run FSM ---

var runTransitions = map[RunState]map[RunState]struct{}{
	RunPending: {
		RunRunning:   {},
		RunCancelled: {},
	},
	RunRunning: {
		RunSucceeded: {},
		RunFailed:    {},
		RunCancelled: {},
	},
	// Terminal states have no outgoing edges — do not add entries for them.
}

// ValidateRunTransition returns nil if `from → to` is allowed.
func ValidateRunTransition(from, to RunState) error {
	if from == to {
		return nil // idempotent no-op is allowed; repository layer may still reject based on version
	}
	allowed, ok := runTransitions[from]
	if !ok {
		return &FSMError{Entity: "run", From: string(from), To: string(to)}
	}
	if _, ok := allowed[to]; !ok {
		return &FSMError{Entity: "run", From: string(from), To: string(to)}
	}
	return nil
}

// IsRunTerminal reports whether s is a terminal run state.
func IsRunTerminal(s RunState) bool {
	switch s {
	case RunSucceeded, RunFailed, RunCancelled:
		return true
	}
	return false
}

// --- Flow FSM ---

var flowTransitions = map[FlowState]map[FlowState]struct{}{
	FlowPending: {
		FlowAssigned:  {},
		FlowCancelled: {},
	},
	FlowAssigned: {
		FlowRunning:   {},
		FlowPending:   {}, // reassignment on scheduler failure
		FlowCancelled: {},
	},
	FlowRunning: {
		FlowSucceeded: {},
		FlowFailed:    {},
		FlowCancelled: {},
	},
}

// ValidateFlowTransition returns nil if `from → to` is allowed.
func ValidateFlowTransition(from, to FlowState) error {
	if from == to {
		return nil
	}
	allowed, ok := flowTransitions[from]
	if !ok {
		return &FSMError{Entity: "flow", From: string(from), To: string(to)}
	}
	if _, ok := allowed[to]; !ok {
		return &FSMError{Entity: "flow", From: string(from), To: string(to)}
	}
	return nil
}

// IsFlowTerminal reports whether s is a terminal flow state.
func IsFlowTerminal(s FlowState) bool {
	switch s {
	case FlowSucceeded, FlowFailed, FlowCancelled:
		return true
	}
	return false
}

// --- Step FSM (paper Appendix A.2) ---

var stepTransitions = map[StepState]map[StepState]struct{}{
	StepPending: {
		StepLeased:    {}, // T1 lease issuance (etcd CAS succeeded → PG mirror)
		StepCancelled: {}, // parent Run cancelled
	},
	StepLeased: {
		StepRunning: {}, // assigned node begins execution
		StepPending: {}, // T4 lease expiry — return to pool
		StepExpired: {}, // lease expired beyond retry budget
	},
	StepRunning: {
		StepSucceeded: {}, // T2 commit path
		StepFailed:    {}, // unrecoverable adapter error
		StepPending:   {}, // T4 mid-execution lease expiry
		StepCancelled: {}, // operator abort / budget exhaustion
		StepExpired:   {},
	},
}

// ValidateStepTransition returns nil if `from → to` is allowed.
func ValidateStepTransition(from, to StepState) error {
	if from == to {
		return nil
	}
	allowed, ok := stepTransitions[from]
	if !ok {
		return &FSMError{Entity: "step", From: string(from), To: string(to)}
	}
	if _, ok := allowed[to]; !ok {
		return &FSMError{Entity: "step", From: string(from), To: string(to)}
	}
	return nil
}

// IsStepTerminal reports whether s is a terminal step state.
// "expired" is terminal for this specific Step row (a new Step row is created
// for any retry attempt; see scheduler Reassign logic).
func IsStepTerminal(s StepState) bool {
	switch s {
	case StepSucceeded, StepFailed, StepCancelled, StepExpired:
		return true
	}
	return false
}

// --- SideEffect FSM ---
//
// SideEffect transitions are constrained because a committed side-effect means
// external state has been irreversibly changed. The validator prevents moving
// from 'committed' back to any other state.

var sideEffectTransitions = map[SideEffectState]map[SideEffectState]struct{}{
	SEPending: {
		SEExecuting: {},
		SESkipped:   {},
	},
	SEExecuting: {
		SECommitted: {}, // T2 commits atomically with the parent Step
		SEFailed:    {},
	},
}

// ValidateSideEffectTransition returns nil if `from → to` is allowed.
func ValidateSideEffectTransition(from, to SideEffectState) error {
	if from == to {
		return nil
	}
	allowed, ok := sideEffectTransitions[from]
	if !ok {
		return &FSMError{Entity: "side_effect", From: string(from), To: string(to)}
	}
	if _, ok := allowed[to]; !ok {
		return &FSMError{Entity: "side_effect", From: string(from), To: string(to)}
	}
	return nil
}

// IsSideEffectTerminal reports whether s is a terminal side-effect state.
func IsSideEffectTerminal(s SideEffectState) bool {
	switch s {
	case SECommitted, SEFailed, SESkipped:
		return true
	}
	return false
}
