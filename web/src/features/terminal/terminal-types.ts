export type TerminalConnectionState =
  | 'idle'
  | 'connecting'
  | 'attached'
  | 'disconnected'
  | 'error';

export type TerminalProcessState = 'idle' | 'running' | 'exited' | 'failed';

export type TerminalPanelUiState =
  | 'empty'
  | 'connecting'
  | 'attached-output'
  | 'exited'
  | 'error';

export type TerminalErrorState =
  | {
      kind: 'none';
      message: null;
      retryable: false;
    }
  | {
      kind: 'attach_failed' | 'runtime_error';
      message: string;
      retryable: true;
    };

export type TerminalSessionMetadata = {
  terminalId: string;
  memberId: string;
  workspaceId: string;
  terminalType: string;
  command: string;
  createdAt: string | null;
  updatedAt: string | null;
  metadata: Record<string, unknown>;
};

export type TerminalOutputChunk = {
  seq: number;
  source: 'snapshot-history' | 'snapshot-buffer' | 'delta';
  text: string;
};

export type TerminalOutputState = {
  chunks: TerminalOutputChunk[];
  text: string;
  followOutput: boolean;
  pendingAutoScroll: boolean;
  lastSeq: number;
  lastSnapshotSeq: number;
};

export type TerminalRuntimeState = {
  connection: TerminalConnectionState;
  process: TerminalProcessState;
  error: TerminalErrorState;
  statusLabel: string;
  lastStatusSeq: number;
};

export type TerminalPanelState = {
  activeTerminalId: string | null;
  session: TerminalSessionMetadata | null;
  output: TerminalOutputState;
  runtime: TerminalRuntimeState;
};

export type TerminalSnapshotEvent = {
  terminalId: string;
  seq: number;
  buffer: {
    history?: string;
    data?: string;
    rows?: number;
    cols?: number;
    cursorRow?: number;
    cursorCol?: number;
  };
};

export type TerminalDeltaEvent = {
  terminalId: string;
  seq: number;
  data: string;
};

export type TerminalStatusEvent = {
  terminalId: string;
  status: string;
  seq?: number;
  errorMessage?: string | null;
};

export type TerminalAttachResult = {
  session: {
    terminalId: string;
    memberId: string;
    workspaceId: string;
    terminalType: string;
    command: string;
    createdAt?: string;
    updatedAt?: string;
    metadata?: Record<string, unknown>;
    status?: string;
  };
  snapshot?: TerminalSnapshotEvent;
};

export type TerminalAttachEvent = {
  event: 'terminal.attach';
  workspaceId: string;
  terminalId: string;
  session: TerminalAttachResult['session'];
};

export type TerminalCanonicalRealtimeEvent =
  | TerminalAttachEvent
  | ({
      event: 'terminal.snapshot';
      workspaceId: string;
    } & TerminalSnapshotEvent)
  | ({
      event: 'terminal.delta';
      workspaceId: string;
    } & TerminalDeltaEvent)
  | ({
      event: 'terminal.status';
      workspaceId: string;
      connectionState: TerminalConnectionState;
      processState: TerminalProcessState;
    } & TerminalStatusEvent);

export type TerminalPanelViewModel = {
  uiState: TerminalPanelUiState;
  title: string;
  statusBadge: string;
  body: string;
  outputText: string;
  showOutput: boolean;
  errorMessage: string | null;
  primaryAction: {
    kind: 'attach' | 'retry';
    label: string;
  };
  followOutput: boolean;
  autoScrollHint: string;
};
