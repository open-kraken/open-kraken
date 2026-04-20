package verifier

import (
	"context"
	"sync"
)

// Registry resolves a Verifier for a given (regime, workload_class)
// pair. Keeping this separate from Verifier itself lets the scheduler
// look up a handler without knowing which concrete implementation will
// answer — the same decoupling pattern we used for cws.Catalog.
type Registry interface {
	// Lookup returns the Verifier registered for this (regime,
	// workload_class) key, or (nil, false) if no verifier applies.
	//
	// A Registry MAY return a wildcard-matching Verifier when the
	// precise key has no row — implementations make this policy
	// explicit via registration (see StaticRegistry.Register /
	// RegisterDefault).
	Lookup(regime, workloadClass string) (Verifier, bool)
}

// StaticRegistry is an in-process Registry populated at startup. Thread-
// safe; Register / RegisterDefault may be called concurrently with
// Lookup.
type StaticRegistry struct {
	mu          sync.RWMutex
	byKey       map[regKey]Verifier
	byRegime    map[string]Verifier // per-regime default
	globalDef   Verifier            // applies when nothing else matches
}

// regKey uniquely identifies a precise (regime, workload_class) row.
type regKey struct {
	Regime        string
	WorkloadClass string
}

// NewStaticRegistry constructs an empty StaticRegistry.
func NewStaticRegistry() *StaticRegistry {
	return &StaticRegistry{
		byKey:    make(map[regKey]Verifier),
		byRegime: make(map[string]Verifier),
	}
}

// Register attaches v to the precise (regime, workload_class) key.
// Overwrites any existing registration.
func (r *StaticRegistry) Register(regime, workloadClass string, v Verifier) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byKey[regKey{Regime: regime, WorkloadClass: workloadClass}] = v
}

// RegisterDefault attaches v as the fallback for every workload_class
// under regime. Lookup returns it when no precise row exists.
func (r *StaticRegistry) RegisterDefault(regime string, v Verifier) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.byRegime[regime] = v
}

// RegisterGlobalDefault sets the verifier that fires when neither a
// precise row nor a per-regime default exists. Use sparingly — a
// careless global default can over-reward arms that should be judged
// more strictly.
func (r *StaticRegistry) RegisterGlobalDefault(v Verifier) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.globalDef = v
}

// Lookup implements Registry.
func (r *StaticRegistry) Lookup(regime, workloadClass string) (Verifier, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if v, ok := r.byKey[regKey{Regime: regime, WorkloadClass: workloadClass}]; ok {
		return v, true
	}
	if v, ok := r.byRegime[regime]; ok {
		return v, true
	}
	if r.globalDef != nil {
		return r.globalDef, true
	}
	return nil, false
}

// NilRegistry is a Registry that never returns a match. Use it as the
// zero-value "no verification configured" placeholder so calling code
// does not need a nil-check on the Registry reference.
type NilRegistry struct{}

// Lookup implements Registry. Always returns (nil, false).
func (NilRegistry) Lookup(_, _ string) (Verifier, bool) { return nil, false }

// --- Compile-time interface checks ---
var (
	_ Registry = (*StaticRegistry)(nil)
	_ Registry = NilRegistry{}
)

// NoSignalResult is returned by NoopVerifier and by any Verifier that
// wants to explicitly decline without erroring. Expressed as a variable
// rather than a function so it's trivially composable.
var NoSignalResult = Result{Signal: NoSignal, Reason: "verifier declined"}

// ctxNotApplicable is unused but kept as a reminder: Verifiers that
// return ErrNotApplicable are indistinguishable from "no verifier
// registered" at the call site. If a future change wants to surface the
// difference, thread the error through Lookup rather than adding it to
// Verify's contract.
var _ context.Context = context.Background()
