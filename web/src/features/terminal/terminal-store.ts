import type {
  TerminalCanonicalRealtimeEvent,
  TerminalAttachResult,
  TerminalDeltaEvent,
  TerminalPanelState,
  TerminalPanelViewModel,
  TerminalProcessState,
  TerminalSnapshotEvent,
  TerminalStatusEvent
} from './terminal-types.ts';

const noError = {
  kind: 'none',
  message: null,
  retryable: false
} as const;

const createOutputState = () => ({
  chunks: [],
  text: '',
  followOutput: true,
  pendingAutoScroll: false,
  lastSeq: 0,
  lastSnapshotSeq: 0
});

export const createTerminalPanelState = (overrides = {}) =>
  structuredClone({
    activeTerminalId: null,
    session: null,
    output: createOutputState(),
    runtime: {
      connection: 'idle',
      process: 'idle',
      error: noError,
      statusLabel: 'Idle',
      lastStatusSeq: 0
    },
    ...overrides
  }) as TerminalPanelState;

const resetForTerminal = (state: TerminalPanelState, terminalId: string): TerminalPanelState => ({
  ...createTerminalPanelState({
    output: {
      ...createOutputState(),
      followOutput: state.output.followOutput
    }
  }),
  activeTerminalId: terminalId
});

const supportsTerminal = (state: TerminalPanelState, terminalId: string) =>
  state.activeTerminalId === null || state.activeTerminalId === terminalId;

const statusLabel = (status: string) =>
  status
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');

const processFromStatus = (status: string): TerminalProcessState => {
  switch (status) {
    case 'working':
    case 'running':
    case 'attached':
      return 'running';
    case 'exited':
    case 'completed':
      return 'exited';
    case 'error':
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
};

const appendOutput = (
  state: TerminalPanelState,
  chunk: { seq: number; source: 'delta'; text: string }
) => {
  if (!chunk.text) {
    return state;
  }
  return {
    ...state,
    output: {
      ...state.output,
      chunks: [...state.output.chunks, chunk],
      text: `${state.output.text}${chunk.text}`,
      pendingAutoScroll: state.output.followOutput,
      lastSeq: chunk.seq
    }
  };
};

const replaceOutputFromSnapshot = (
  state: TerminalPanelState,
  snapshot: TerminalSnapshotEvent
) => {
  const chunks = [];
  const history = snapshot.buffer.history ?? '';
  const data = snapshot.buffer.data ?? '';
  if (history) {
    chunks.push({
      seq: snapshot.seq,
      source: 'snapshot-history' as const,
      text: history
    });
  }
  if (data) {
    chunks.push({
      seq: snapshot.seq,
      source: 'snapshot-buffer' as const,
      text: data
    });
  }

  return {
    ...state,
    output: {
      ...state.output,
      chunks,
      text: `${history}${data}`,
      pendingAutoScroll: state.output.followOutput,
      lastSeq: snapshot.seq,
      lastSnapshotSeq: snapshot.seq
    }
  };
};

export const beginAttach = (
  state: TerminalPanelState,
  terminalId: string
): TerminalPanelState => ({
  ...state,
  activeTerminalId: terminalId,
  runtime: {
    ...state.runtime,
    connection: 'connecting',
    error: noError,
    statusLabel: 'Connecting'
  }
});

export const resolveAttach = (
  state: TerminalPanelState,
  result: TerminalAttachResult
): TerminalPanelState => {
  const baseState =
    state.activeTerminalId && state.activeTerminalId !== result.session.terminalId
      ? resetForTerminal(state, result.session.terminalId)
      : state;
  if (!supportsTerminal(baseState, result.session.terminalId)) {
    return baseState;
  }

  let nextState: TerminalPanelState = {
    ...baseState,
    activeTerminalId: result.session.terminalId,
    session: {
      terminalId: result.session.terminalId,
      memberId: result.session.memberId,
      workspaceId: result.session.workspaceId,
      terminalType: result.session.terminalType,
      command: result.session.command,
      createdAt: result.session.createdAt ?? null,
      updatedAt: result.session.updatedAt ?? null,
      metadata: result.session.metadata ?? {}
    },
    runtime: {
      ...baseState.runtime,
      connection: 'attached',
      process: processFromStatus(result.session.status ?? 'attached'),
      error: noError,
      statusLabel: statusLabel(result.session.status ?? 'attached')
    }
  };

  // Attach refreshes session metadata first, then lets snapshot replace replayable output.
  if (result.snapshot) {
    nextState = applySnapshot(nextState, result.snapshot);
  }

  return nextState;
};

export const failAttach = (
  state: TerminalPanelState,
  error: unknown
): TerminalPanelState => ({
  ...state,
  runtime: {
    ...state.runtime,
    connection: 'error',
    process: 'idle',
    error: {
      kind: 'attach_failed',
      message: error instanceof Error ? error.message : String(error),
      retryable: true
    },
    statusLabel: 'Attach Failed'
  }
});

// Snapshot is authoritative replay input. A newer snapshot fully replaces output.
export const applySnapshot = (
  state: TerminalPanelState,
  snapshot: TerminalSnapshotEvent
): TerminalPanelState => {
  if (!supportsTerminal(state, snapshot.terminalId) || snapshot.seq < state.output.lastSeq) {
    return state;
  }

  return replaceOutputFromSnapshot(
    {
      ...state,
      activeTerminalId: snapshot.terminalId,
      runtime: {
        ...state.runtime,
        connection: 'attached',
        error: noError,
        statusLabel:
          state.runtime.statusLabel === 'Connecting' ? 'Attached' : state.runtime.statusLabel
      }
    },
    snapshot
  );
};

// Delta is append-only. Stale or duplicate seq values are ignored.
export const applyDelta = (
  state: TerminalPanelState,
  delta: TerminalDeltaEvent
): TerminalPanelState => {
  if (!supportsTerminal(state, delta.terminalId) || delta.seq <= state.output.lastSeq) {
    return state;
  }
  return appendOutput(
    {
      ...state,
      activeTerminalId: delta.terminalId,
      runtime: {
        ...state.runtime,
        connection: 'attached',
        error: noError
      }
    },
    { seq: delta.seq, source: 'delta', text: delta.data }
  );
};

// Status only mutates runtime state. Optional seq blocks older status updates from rewinding state.
export const applyStatus = (
  state: TerminalPanelState,
  event: TerminalStatusEvent
): TerminalPanelState => {
  if (!supportsTerminal(state, event.terminalId)) {
    return state;
  }
  if (typeof event.seq === 'number' && event.seq <= state.runtime.lastStatusSeq) {
    return state;
  }

  const nextProcess = processFromStatus(event.status);
  const nextConnection =
    nextProcess === 'failed'
      ? 'error'
      : nextProcess === 'exited'
        ? 'disconnected'
        : state.runtime.connection === 'connecting'
          ? 'attached'
          : state.runtime.connection;

  return {
    ...state,
    activeTerminalId: event.terminalId,
    runtime: {
      ...state.runtime,
      connection: nextConnection,
      process: nextProcess,
      error:
        nextProcess === 'failed'
          ? {
              kind: 'runtime_error',
              message: event.errorMessage ?? 'Terminal session failed.',
              retryable: true
            }
          : noError,
      statusLabel: statusLabel(event.status),
      lastStatusSeq: event.seq ?? state.runtime.lastStatusSeq
    }
  };
};

export const applyTerminalRealtimeEvent = (
  state: TerminalPanelState,
  event: TerminalCanonicalRealtimeEvent
): TerminalPanelState => {
  switch (event.event) {
    case 'terminal.attach':
      return resolveAttach(state, {
        session: event.session
      });
    case 'terminal.snapshot':
      return applySnapshot(state, event);
    case 'terminal.delta':
      return applyDelta(state, event);
    case 'terminal.status': {
      const nextState = applyStatus(state, event);
      return {
        ...nextState,
        runtime: {
          ...nextState.runtime,
          connection: event.connectionState,
          process: event.processState
        }
      };
    }
  }
};

export const setFollowOutput = (
  state: TerminalPanelState,
  followOutput: boolean
): TerminalPanelState => ({
  ...state,
  output: {
    ...state.output,
    followOutput,
    pendingAutoScroll: followOutput ? state.output.pendingAutoScroll : false
  }
});

export const acknowledgeAutoScroll = (state: TerminalPanelState): TerminalPanelState => ({
  ...state,
  output: {
    ...state.output,
    pendingAutoScroll: false
  }
});

export const selectTerminalPanelViewModel = (
  state: TerminalPanelState
): TerminalPanelViewModel => {
  const hasOutput = state.output.text.length > 0;
  const hasError = state.runtime.error.kind !== 'none';

  let uiState: TerminalPanelViewModel['uiState'] = 'empty';
  let body = 'Attach a terminal session to start streaming output.';

  if (hasError) {
    uiState = 'error';
    body = state.runtime.error.message ?? 'Terminal session failed.';
  } else if (state.runtime.connection === 'connecting') {
    uiState = 'connecting';
    body = 'Connecting to the terminal session and waiting for snapshot replay.';
  } else if (state.runtime.process === 'exited') {
    uiState = 'exited';
    body = hasOutput
      ? 'Session finished. Output remains available for review.'
      : 'Session exited before output arrived.';
  } else if (hasOutput) {
    uiState = 'attached-output';
    body = 'Live output is attached. New chunks append in seq order.';
  }

  return {
    uiState,
    title: state.session?.command ?? 'Terminal Session',
    statusBadge: `${state.runtime.statusLabel} / ${state.runtime.connection}`,
    body,
    outputText: state.output.text,
    showOutput: hasOutput,
    errorMessage: hasError ? state.runtime.error.message : null,
    primaryAction:
      hasError || state.runtime.connection === 'error'
        ? { kind: 'retry', label: 'Retry Attach' }
        : { kind: 'attach', label: 'Attach Session' },
    followOutput: state.output.followOutput,
    autoScrollHint: state.output.followOutput ? 'Following output' : 'Follow paused'
  };
};

export const createTerminalStore = ({
  attachSession
}: {
  attachSession?: (terminalId: string) => Promise<TerminalAttachResult>;
} = {}) => {
  let state = createTerminalPanelState();
  const listeners = new Set<(nextState: TerminalPanelState) => void>();

  const update = (nextState: TerminalPanelState) => {
    state = nextState;
    for (const listener of listeners) {
      listener(state);
    }
    return state;
  };

  return {
    getState() {
      return state;
    },
    subscribe(listener: (nextState: TerminalPanelState) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    replaceState(nextState: TerminalPanelState) {
      return update(nextState);
    },
    beginAttach(terminalId: string) {
      return update(beginAttach(state, terminalId));
    },
    async attach(terminalId: string) {
      update(beginAttach(state, terminalId));
      if (!attachSession) {
        return state;
      }
      try {
        const result = await attachSession(terminalId);
        return update(resolveAttach(state, result));
      } catch (error) {
        return update(failAttach(state, error));
      }
    },
    retryAttach() {
      if (!state.activeTerminalId) {
        return state;
      }
      return this.attach(state.activeTerminalId);
    },
    applySnapshot(event: TerminalSnapshotEvent) {
      return update(applySnapshot(state, event));
    },
    applyDelta(event: TerminalDeltaEvent) {
      return update(applyDelta(state, event));
    },
    applyStatus(event: TerminalStatusEvent) {
      return update(applyStatus(state, event));
    },
    setFollowOutput(followOutput: boolean) {
      return update(setFollowOutput(state, followOutput));
    },
    acknowledgeAutoScroll() {
      return update(acknowledgeAutoScroll(state));
    }
  };
};
