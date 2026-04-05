# Realtime Contract

## Scope

This document fixes the open-kraken Go backend realtime vocabulary for chat, terminal, presence, and roadmap events. All new realtime producers and consumers under `/Users/claire/IdeaProjects/open-kraken` must reuse these names and payload boundaries instead of inventing parallel terms.

## Sync Guard Bindings

- Sync guard: `npm run verify:contract-sync`
- Migration gate: `npm run verify:migration`
- Runtime gate: `npm run verify:runtime`
- HTTP/WS peer: `/Users/claire/IdeaProjects/open-kraken/docs/api/http-websocket-contract.md`
- Authz/runtime peer: `/Users/claire/IdeaProjects/open-kraken/docs/backend/authz-enforcement-and-go-env.md`

## Event Envelope

Every websocket or stream frame uses one envelope:

```json
{
  "cursor": "rt_00000000000000000042",
  "name": "terminal.delta",
  "workspaceId": "ws_123",
  "channelId": "conv_9",
  "memberId": "member_2",
  "terminalId": "term_4",
  "occurredAt": "2026-04-03T10:00:00Z",
  "payload": {}
}
```

- `cursor`: monotonic server-issued event cursor. Format is `rt_` plus zero-padded decimal sequence.
- `name`: dotted semantic event name. Producers must not introduce aliases such as `changed`, `ready`, or `output.snapshot` outside the names below.
- `workspaceId`: required on every event.
- `channelId`: used by chat events.
- `memberId`: used by presence events and member-scoped terminal views.
- `terminalId`: used by terminal events.

## Canonical Event Names

### Chat

- `chat.snapshot`: initial conversation snapshot payload.
- `chat.delta`: append-only message or chunk delta.
- `chat.message.status.changed`: delivery status for a single message. Allowed status values are `sending`, `sent`, `failed`.
- `chat.updated`: non-message conversation metadata change.

### Terminal

- `terminal.attach`: viewer/session attach acknowledgement.
- `terminal.snapshot`: full terminal buffer plus current states.
- `terminal.delta`: ordered output stream unit. Sequence in payload is terminal-local and must increase by one for a given terminal.
- `terminal.status`: lifecycle status change. This event always carries both `connectionState` and `processState`.

### Presence

- `presence.snapshot`: full member presence snapshot for a workspace or filtered member set.
- `presence.delta`: targeted member presence replacement.
- `presence.status`: explicit member state transition.
- `presence.updated`: heartbeat refresh. This updates online freshness only and must not be used as a synonym for terminal status.

### Roadmap

- `roadmap.snapshot`: current roadmap materialized state.
- `roadmap.delta`: item-level insert/update/remove delta.
- `roadmap.status`: persistence or sync state.
- `roadmap.updated`: version-level roadmap update notification.

## Boundary Rules

### Snapshot vs delta vs status vs updated

- `snapshot` is a read model replacement and may be used for first subscribe, full refresh, or resync after cursor loss.
- `delta` is an ordered incremental mutation. Consumers must apply it after the latest accepted snapshot.
- `status` is operational state, not content mutation. It reports health, readiness, connection, persistence, or single-message delivery state.
- `updated` is a coarse metadata notification when the resource changed but a typed delta is either unnecessary or too expensive.

### Terminal State Separation

- `connectionState` describes observer connectivity only. Allowed examples: `detached`, `attaching`, `attached`, `reconnecting`.
- `processState` describes the PTY/runtime lifecycle only. Allowed examples: `starting`, `running`, `exited`, `failed`.
- `terminal.attach` acknowledges that a client session attached to the stream.
- `terminal.snapshot` includes both states because initial rendering must know whether the viewer is connected and whether the process still exists.
- `terminal.delta` never changes lifecycle state by itself.
- `terminal.status` is the only place where connection and process lifecycle transitions are announced together.
- A single browser websocket connection has exactly one active terminal live stream at a time. Sending a later `terminal.attach` for a different terminal replaces the previous terminal filter on that connection.
- Switching terminals is not additive. Producers must treat the newest `terminal.attach` on the connection as the authoritative active terminal selection.

### Frontend Seq / Replay Rules

- `terminal.snapshot.payload.seq` is the terminal-local high-water mark included in the snapshot buffer.
- Frontend consumers must replace the rendered buffer on accepted `terminal.snapshot`, set `lastSeq = snapshot.seq`, and discard any later `terminal.delta` whose `seq <= lastSeq`.
- Frontend consumers must not append stale replay chunks after a newer snapshot. A snapshot with lower `seq` than the current local `lastSeq` must be ignored.
- `terminal.status` may carry the same or higher `seq` as the output stream. Status can update runtime badges, but it must not rewind output state.
- On terminal switch within one websocket connection, the frontend must reset active-terminal-local seq tracking to the newly attached terminal and ignore further deltas from the previously active terminal.

### Presence vs Terminal Status

- Presence answers whether a member is online and recently heartbeating.
- `terminalStatus` inside presence payloads is a summarized read model field for UI badges only.
- Terminal session truth stays in `terminal.*` events.
- `presence.updated` refreshes `presenceState` freshness and timestamp; it must not silently encode terminal attach/detach or process exit.

## Subscribe / Replay / Ack / Reconnect

### Subscribe request

Clients subscribe with:

```json
{
  "workspaceId": "ws_123",
  "memberIds": ["member_2"],
  "terminalIds": ["term_4"],
  "cursor": "rt_00000000000000000042"
}
```

- `cursor` omitted or empty: server returns `snapshot` mode with the latest matching snapshot events.
- `cursor` present and still within the replay window: server returns `replay` mode with all matching events strictly after that cursor.
- `cursor` older than the replay window: server falls back to `snapshot` mode and sets `resyncRequired=true`.
- malformed cursors are rejected as invalid client state.
- future cursors are rejected when the current process has already established a cursor head.
- after service restart with no persisted replay head, any non-empty cursor is treated as out-of-window and forces snapshot resync instead of durable replay.

### Cursor and replay window

- Cursor shape is `rt_<20-digit decimal sequence>`.
- The server allows breakpoint resume only while the requested cursor remains inside the in-memory replay window.
- The current implementation keeps a bounded replay buffer sized by service configuration.
- If the client reconnects after the window has rolled past its cursor, the server does not attempt partial replay from storage. It returns the latest snapshots instead.

### Ack

- Clients may ack the highest delivered cursor they have durably applied.
- Ack is monotonic per subscription and cannot exceed the highest delivered cursor.
- Reconnect should send the last acked cursor, not the last merely received cursor.

### Reconnect outcomes

- In-window reconnect: replay buffered events after the acked cursor.
- Out-of-window reconnect: full resync through snapshots, then continue on live stream.
- Unknown future cursor: reject as invalid client state.
- Terminal reconnect uses terminal-local `seq` on top of websocket `cursor`: first apply `terminal.snapshot`, then append only `terminal.delta` frames with strictly larger terminal-local `seq`.
- When a client switches from terminal A to terminal B on the same websocket connection, the server sends terminal B attach payloads first and then starts forwarding only terminal B live events from the current websocket cursor forward.

## Current Test Gate

The current backend test gate proves:

- initial subscription returns snapshots
- disconnect and reconnect replays buffered events
- old cursor falls back to snapshot resync
- terminal deltas keep publish order
- websocket terminal attach can switch the active live terminal stream on one connection
- presence snapshot and heartbeat updates stay distinct from terminal status
