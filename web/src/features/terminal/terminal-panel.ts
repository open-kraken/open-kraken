type TerminalSession = {
  terminalId: string;
  memberId: string;
  command: string;
  status: string;
  snapshot: {
    seq: number;
    buffer: {
      data: string;
    };
  };
};

export type TerminalPanelView = {
  terminalId: string;
  memberId: string;
  command: string;
  status: string;
  seq: number;
  buffer: string;
};

export const buildTerminalPanelView = ({ terminalSession }: { terminalSession: TerminalSession }): TerminalPanelView => ({
  terminalId: terminalSession.terminalId,
  memberId: terminalSession.memberId,
  command: terminalSession.command,
  status: terminalSession.status,
  seq: terminalSession.snapshot.seq,
  buffer: terminalSession.snapshot.buffer.data.trimEnd()
});

export const renderTerminalPanel = (view: TerminalPanelView): string => {
  return [
    `TerminalPanel:${view.terminalId}`,
    `member=${view.memberId}`,
    `status=${view.status}`,
    `seq=${view.seq}`,
    `command=${view.command}`,
    `buffer=${view.buffer}`
  ].join('\n');
};
