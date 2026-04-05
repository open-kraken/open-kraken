export const buildTerminalPanelView = ({ terminalSession }) => ({
  terminalId: terminalSession.terminalId,
  memberId: terminalSession.memberId,
  command: terminalSession.command,
  status: terminalSession.status,
  seq: terminalSession.snapshot.seq,
  buffer: terminalSession.snapshot.buffer.data.trimEnd()
});

export const renderTerminalPanel = (view) => {
  return [
    `TerminalPanel:${view.terminalId}`,
    `member=${view.memberId}`,
    `status=${view.status}`,
    `seq=${view.seq}`,
    `command=${view.command}`,
    `buffer=${view.buffer}`
  ].join('\n');
};
