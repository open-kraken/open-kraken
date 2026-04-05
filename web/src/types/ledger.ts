/**
 * Central ledger — append-only audit events for command / action retrospectives.
 */

export type LedgerEventType =
  | 'terminal.command'
  | 'llm.call'
  | 'tool.run'
  | 'deploy'
  | 'git.operation'
  | string;

export type LedgerEvent = {
  id: string;
  workspaceId: string;
  teamId: string;
  memberId: string;
  nodeId: string;
  eventType: LedgerEventType;
  summary: string;
  correlationId: string;
  sessionId: string;
  context: Record<string, unknown>;
  timestamp: string;
};

export type LedgerEventsResponse = {
  items: LedgerEvent[];
  total: number;
};
