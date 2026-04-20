package cws

import (
	"errors"
	"time"
)

// Regime mirrors paper §5.2.2. It is declared here as a string type so
// cws does not depend on the ael package — downstream consumers
// translate to/from ael.StepRegime at the edge.
type Regime string

const (
	RegimeOpaque     Regime = "OPAQUE"
	RegimeVerifiable Regime = "VERIFIABLE"
	RegimeProxied    Regime = "PROXIED"
)

// IsValid reports whether r is one of the three declared regimes.
func (r Regime) IsValid() bool {
	switch r {
	case RegimeOpaque, RegimeVerifiable, RegimeProxied:
		return true
	}
	return false
}

// ArmKey is the tuple the UCB-1 algorithm treats as a single lever.
// scheduling_arm_stats has this exact primary key.
type ArmKey struct {
	AgentType     string
	Provider      string
	WorkloadClass string
	Regime        Regime
}

// IsZero reports whether all identifying fields are empty.
func (k ArmKey) IsZero() bool {
	return k.AgentType == "" && k.Provider == "" && k.WorkloadClass == "" && k.Regime == ""
}

// Arm is a view of an ArmKey with its running statistics. Pulls of zero
// signals the arm has never been selected — the selector treats it as
// +∞ in the UCB comparison so exploration covers every arm at least once.
type Arm struct {
	Key          ArmKey
	Pulls        int64
	RewardSum    float64
	RewardSqSum  float64
	LastUpdated  time.Time
}

// Mean returns the running average reward. Returns 0 for an arm that has
// never been pulled.
func (a Arm) Mean() float64 {
	if a.Pulls <= 0 {
		return 0
	}
	return a.RewardSum / float64(a.Pulls)
}

// Variance returns a biased estimate of per-arm reward variance. Used
// only for diagnostic logging / Layer-3 annotation priority, not for the
// UCB calculation itself.
func (a Arm) Variance() float64 {
	if a.Pulls <= 1 {
		return 0
	}
	mean := a.Mean()
	return (a.RewardSqSum / float64(a.Pulls)) - mean*mean
}

// Candidate is an arm offered to the selector as a legal choice for a
// given (regime, workload_class). Think of it as a Catalog row.
type Candidate = ArmKey

// --- Errors ---

// ErrNoCandidates is returned by Selector.Pick when the candidate slice
// is empty. Callers should treat this as a configuration error.
var ErrNoCandidates = errors.New("cws: no candidates to choose from")

// ErrInvalidRegime is returned when a non-OPAQUE / VERIFIABLE / PROXIED
// value reaches the selector.
var ErrInvalidRegime = errors.New("cws: invalid regime")

// ErrInvalidReward is returned when a reward outside [0, 1] is recorded.
var ErrInvalidReward = errors.New("cws: reward must be in [0, 1]")
