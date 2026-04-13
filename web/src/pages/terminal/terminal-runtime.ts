import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppShellContextValue } from '@/state/app-shell-store';
import type { RealtimeEnvelope } from '@/realtime/realtime-client';
import {
  applyTerminalRealtimeEvent,
  createTerminalPanelState,
  createTerminalStore,
  resolveAttach
} from '@/features/terminal/terminal-store.ts';
import type {
  TerminalAttachResult,
  TerminalCanonicalRealtimeEvent,
  TerminalPanelState
} from '@/features/terminal/terminal-types.ts';
import { resolveOrCreateMemberSession } from '@/api/terminal';

type TerminalRuntimeApi = {
  attachTerminal: (terminalId: string) => Promise<TerminalAttachResult>;
  subscribe?: (listener: (event: unknown) => void) => () => void;
};

type TerminalRuntimeDeps = {
  apiClient: unknown;
  realtimeClient?: AppShellContextValue['realtimeClient'];
  pushNotification: AppShellContextValue['pushNotification'];
  initialTerminalId: string;
};

type TerminalPanelController = {
  getState: () => TerminalPanelState;
  subscribe: (listener: (state: TerminalPanelState) => void) => () => void;
  attach: () => Promise<TerminalPanelState>;
  attachTo: (terminalId: string) => Promise<TerminalPanelState>;
  retry: () => Promise<TerminalPanelState>;
  toggleFollow: () => TerminalPanelState;
  handleRealtimeEvent: (event: unknown) => Promise<TerminalPanelState>;
};

type TerminalEventEnvelope = {
  type?: string;
  event?: string;
  name?: string;
  payload?: Record<string, unknown>;
  workspaceId?: string;
  memberId?: string;
  subscriptionScope?: {
    terminal?: string[] | boolean;
  };
  resyncRequired?: boolean;
  session?: TerminalAttachResult['session'];
  snapshot?: TerminalAttachResult['snapshot'];
  terminalId?: string;
  seq?: number;
  sequence?: number;
  data?: string;
  rows?: number;
  cols?: number;
  buffer?: Record<string, unknown> | string;
  status?: string;
  connectionState?: 'idle' | 'connecting' | 'attached' | 'disconnected' | 'error';
  processState?: 'idle' | 'running' | 'exited' | 'failed';
  errorMessage?: string | null;
};

type TerminalEnvelopePayload = {
  workspaceId?: string;
  memberId?: string;
  terminalId?: string;
  subscriptionScope?: {
    terminal?: string[] | boolean;
  };
  resyncRequired?: boolean;
  payload?: Record<string, unknown>;
};

const defaultTerminalId = '';

const getTerminalRuntimeApi = (apiClient: unknown): TerminalRuntimeApi => {
  if (!apiClient || typeof apiClient !== 'object') {
    throw new Error('terminal_runtime_api_missing');
  }
  const candidate = apiClient as Record<string, unknown>;
  const attachTerminal = candidate.attachTerminal;
  const subscribe = candidate.subscribe;
  if (typeof attachTerminal !== 'function') {
    throw new Error('terminal_runtime_api_incomplete');
  }
  return {
    attachTerminal: attachTerminal as TerminalRuntimeApi['attachTerminal'],
    subscribe: typeof subscribe === 'function' ? (subscribe as TerminalRuntimeApi['subscribe']) : undefined
  };
};

const getEventName = (event: TerminalEventEnvelope) => event.event ?? event.name ?? null;

const getPayload = (event: TerminalEventEnvelope) => event.payload ?? event;

const isRealtimeEnvelope = (rawEvent: unknown): rawEvent is RealtimeEnvelope<TerminalEnvelopePayload> => {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return false;
  }
  const candidate = rawEvent as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.channel === 'string' &&
    candidate.payload !== undefined &&
    typeof candidate.sequence === 'number'
  );
};

const unwrapRealtimeEnvelope = (rawEvent: unknown): unknown => {
  if (!isRealtimeEnvelope(rawEvent)) {
    return rawEvent;
  }

  const payload = rawEvent.payload ?? {};
  return {
    event: rawEvent.type,
    workspaceId: payload.workspaceId,
    memberId: payload.memberId,
    terminalId: payload.terminalId,
    subscriptionScope: payload.subscriptionScope,
    resyncRequired: payload.resyncRequired,
    ...(payload.payload && typeof payload.payload === 'object' ? payload.payload : {})
  };
};

export const normalizeTerminalRealtimeEvent = (
  rawEvent: unknown
): { type: 'ignored' } | { type: 'attach-result'; result: TerminalAttachResult } | { type: 'event'; event: TerminalCanonicalRealtimeEvent } => {
  const candidateEvent = unwrapRealtimeEnvelope(rawEvent);

  if (!candidateEvent || typeof candidateEvent !== 'object') {
    return { type: 'ignored' };
  }

  const event = candidateEvent as TerminalEventEnvelope;
  const eventName = getEventName(event);
  const payload = getPayload(event) as TerminalEventEnvelope;

  switch (eventName) {
    case 'handshake.accepted':
      return { type: 'ignored' };
    case 'terminal.attach':
      if (!payload.session || !payload.terminalId) {
        return { type: 'ignored' };
      }
      return {
        type: 'event',
        event: {
          event: 'terminal.attach',
          workspaceId: String(payload.workspaceId ?? ''),
          terminalId: payload.terminalId,
          session: payload.session
        }
      };
    case 'terminal.snapshot':
      if (!payload.terminalId || typeof payload.buffer !== 'string') {
        return { type: 'ignored' };
      }
      return {
        type: 'event',
        event: {
          event: 'terminal.snapshot',
          workspaceId: String(payload.workspaceId ?? ''),
          terminalId: payload.terminalId,
          seq: payload.seq ?? 0,
          buffer: {
            data: payload.buffer,
            rows: payload.rows ?? 24,
            cols: payload.cols ?? 80
          }
        }
      };
    case 'terminal.delta':
      if (!payload.terminalId || typeof (payload.sequence ?? payload.seq) !== 'number' || typeof payload.data !== 'string') {
        return { type: 'ignored' };
      }
      return {
        type: 'event',
        event: {
          event: 'terminal.delta',
          workspaceId: String(payload.workspaceId ?? ''),
          terminalId: payload.terminalId,
          seq: payload.sequence ?? payload.seq ?? 0,
          data: payload.data
        }
      };
    case 'terminal.status':
      if (!payload.terminalId) {
        return { type: 'ignored' };
      }
      return {
        type: 'event',
        event: {
          event: 'terminal.status',
          workspaceId: String(payload.workspaceId ?? ''),
          terminalId: payload.terminalId,
          status:
            payload.status ??
            (payload.processState === 'exited' ? 'exited' : payload.processState === 'failed' ? 'failed' : 'attached'),
          seq: payload.sequence ?? payload.seq,
          errorMessage: payload.errorMessage ?? null,
          connectionState: payload.connectionState ?? 'attached',
          processState: payload.processState ?? 'idle'
        }
      };
    default:
      return { type: 'ignored' };
  }
};

const shouldResyncForDeltaGap = (state: TerminalPanelState, event: TerminalCanonicalRealtimeEvent) => {
  if (event.event !== 'terminal.delta') {
    return false;
  }
  if (state.activeTerminalId !== event.terminalId) {
    return false;
  }
  return state.output.lastSeq > 0 && event.seq > state.output.lastSeq + 1;
};

/**
 * Adapt the raw backend attach response into the shape expected by
 * the terminal store (`TerminalAttachResult`).
 *
 * Backend returns:  `{ snapshot: { sessionId, buffer, rows, cols, seq, ... }, deltas, status }`
 * Frontend expects: `{ session: { terminalId, memberId, ... }, snapshot?: { ... } }`
 */
const adaptAttachResponse = (
  raw: Record<string, unknown>,
  terminalId: string,
  memberId: string
): TerminalAttachResult => {
  const snap = (raw.snapshot ?? {}) as Record<string, unknown>;
  const sessionId = String(snap.sessionId ?? raw.sessionId ?? terminalId);
  return {
    session: {
      terminalId: sessionId,
      memberId,
      workspaceId: String(snap.workspaceId ?? ''),
      terminalType: 'pty',
      command: String(raw.command ?? 'bash'),
      status: String(snap.terminalStatus ?? 'attached'),
    },
    snapshot: snap.buffer !== undefined
      ? {
          terminalId: sessionId,
          seq: Number(snap.seq ?? 0),
          buffer: {
            data: String(snap.buffer ?? ''),
            rows: Number(snap.rows ?? 24),
            cols: Number(snap.cols ?? 80),
          },
        }
      : undefined,
  };
};

export const createTerminalPanelController = ({
  apiClient,
  realtimeClient,
  pushNotification,
  initialTerminalId
}: TerminalRuntimeDeps): TerminalPanelController => {
  const runtimeApi = getTerminalRuntimeApi(apiClient);
  const store = createTerminalStore({
    attachSession: async (terminalId) => {
      const memberId = terminalId.startsWith('term_') ? terminalId.slice(5) : terminalId;
      const sessionId = await resolveOrCreateMemberSession('ws_open_kraken', memberId);
      const raw = await runtimeApi.attachTerminal(sessionId);
      return adaptAttachResponse(raw as Record<string, unknown>, sessionId, memberId);
    }
  });

  const requestResync = async (terminalId: string, reason: string) => {
    const memberId = terminalId.startsWith('term_') ? terminalId.slice(5) : terminalId;
    const sessionId = await resolveOrCreateMemberSession('ws_open_kraken', memberId);
    const raw = await runtimeApi.attachTerminal(sessionId);
    const result = adaptAttachResponse(raw as Record<string, unknown>, sessionId, memberId);
    const current = store.getState();
    pushNotification({
      tone: 'warning',
      title: 'Terminal resync requested',
      detail: `Terminal ${terminalId} requested a fresh attach because ${reason}.`
    });
    return store.replaceState(
      resolveAttach(
        createTerminalPanelState({
          output: {
            ...current.output,
            chunks: [],
            text: '',
            pendingAutoScroll: current.output.followOutput,
            lastSeq: 0,
            lastSnapshotSeq: 0
          }
        }),
        result
      )
    );
  };

  return {
    getState() {
      return store.getState();
    },
    subscribe(listener) {
      return store.subscribe(listener);
    },
    attach() {
      return store.attach(store.getState().activeTerminalId ?? initialTerminalId);
    },
    attachTo(terminalId: string) {
      return store.attach(terminalId);
    },
    async retry() {
      return Promise.resolve(store.retryAttach());
    },
    toggleFollow() {
      const state = store.getState();
      return store.setFollowOutput(!state.output.followOutput);
    },
    async handleRealtimeEvent(rawEvent) {
      const envelope = unwrapRealtimeEnvelope(rawEvent);
      const activeTerminalId = store.getState().activeTerminalId;
      if (envelope && typeof envelope === 'object') {
        const handshake = envelope as TerminalEventEnvelope;
        if (handshake.event === 'handshake.accepted' && handshake.resyncRequired && activeTerminalId) {
          return requestResync(activeTerminalId, 'handshake requested snapshot resync');
        }
      }

      const normalized = normalizeTerminalRealtimeEvent(rawEvent);
      if (normalized.type === 'ignored') {
        return store.getState();
      }
      if (normalized.type === 'attach-result') {
        return store.replaceState(resolveAttach(store.getState(), normalized.result));
      }

      if (shouldResyncForDeltaGap(store.getState(), normalized.event)) {
        return requestResync(
          normalized.event.terminalId,
          `delta seq gap (${store.getState().output.lastSeq} -> ${normalized.event.event === 'terminal.delta' ? normalized.event.seq : 'unknown'})`
        );
      }

      const nextState = applyTerminalRealtimeEvent(store.getState(), normalized.event);
      return store.replaceState(nextState);
    }
  };
};

export const applyControllerAttachResult = (
  state: TerminalPanelState,
  result: TerminalAttachResult
) => resolveAttach(state, result);

export const useTerminalPanelRuntime = ({
  apiClient,
  realtimeClient,
  pushNotification,
  initialTerminalId = defaultTerminalId
}: TerminalRuntimeDeps) => {
  const controller = useMemo(
    () =>
      createTerminalPanelController({
        apiClient,
        realtimeClient,
        pushNotification,
        initialTerminalId
      }),
    [apiClient, initialTerminalId, pushNotification, realtimeClient]
  );
  const [state, setState] = useState<TerminalPanelState>(() => controller.getState());

  useEffect(() => controller.subscribe(setState), [controller]);

  useEffect(() => {
    const runtimeApi = getTerminalRuntimeApi(apiClient);
    void controller.attach();
    if (realtimeClient) {
      const subscription = realtimeClient.subscribe('workspace', (event) => {
        void controller.handleRealtimeEvent(event).then(setState);
      });
      return () => subscription.unsubscribe();
    }
    if (runtimeApi.subscribe) {
      return runtimeApi.subscribe((event) => {
        void controller.handleRealtimeEvent(event).then(setState);
      });
    }
    return undefined;
  }, [apiClient, controller, realtimeClient]);

  const attach = useCallback(() => controller.attach(), [controller]);
  const attachTo = useCallback((terminalId: string) => controller.attachTo(terminalId), [controller]);
  const retry = useCallback(() => controller.retry(), [controller]);
  const toggleFollow = useCallback(() => controller.toggleFollow(), [controller]);

  return {
    state,
    attach,
    attachTo,
    retry,
    toggleFollow
  };
};
