// Package instance implements AgentInstance — the runtime process primitive
// from paper §5.4.2. An AgentInstance is the live, stateful counterpart to
// the static seven-tuple AgentDescriptor: where the descriptor says "what an
// agent type can do", the instance says "what a specific agent is doing right
// now".
//
// AgentInstance mirrors the Unix process model:
//
//   - Identity persists across Step boundaries. The `instance_id` survives
//     transitions through idle and resumed — the L1 context accumulated
//     during previous Steps is available for the next Step assignment.
//   - State is owned by the Agent Runtime, not by the scheduler. The
//     scheduler assigns Steps to specific `instance_id`s, not to abstract
//     (agent_type, provider) pairs.
//   - Lifecycle is independent of any single Step. A Step may fail on one
//     instance, retry on another, and succeed on a third.
//
// The eight-state FSM is enforced in Go and mirrored to the `agent_instances`
// table for crash recovery. Terminal states (`terminated`, `crashed`) cannot
// transition back to live states — a fresh instance must be spawned instead.
//
// The Agent Runtime wraps (but does not replace) the existing session.Actor
// from internal/session. The Actor's 5-state lifecycle is mapped into the
// 8-state AgentInstance FSM so existing terminal-session behaviour keeps
// working while the new scheduler-facing primitives come online.
package instance
