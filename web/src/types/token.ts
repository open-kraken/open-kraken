/**
 * Domain types for Token consumption tracking and Agent activity (T09).
 * Used by the dashboard to surface per-member and per-node usage.
 */

/**
 * Aggregated token consumption for a member over a reporting period.
 * nodeId is optional — absent when the member has no assigned node.
 */
export interface TokenStats {
  memberId: string;
  memberName: string;
  nodeId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Estimated cost in USD. */
  cost: number;
  /** ISO date range or label (e.g. "2026-04-05" or "last_7d"). */
  period: string;
}

/**
 * Snapshot of a single agent's current activity and cumulative token usage.
 * Drives the AgentActivityPanel row rendering.
 */
export interface AgentActivity {
  memberId: string;
  memberName: string;
  /** Terminal / execution status (maps to CollaborationStatus values). */
  status: string;
  /** Short description of the task the agent is currently executing. */
  currentTask?: string;
  tokenStats: TokenStats;
}
