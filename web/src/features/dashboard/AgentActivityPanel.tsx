/**
 * AgentActivityPanel lists each agent's current status, active task,
 * and cumulative token usage for the reporting period (T09).
 */

import type { AgentActivity } from '@/types/token';

export type AgentActivityPanelProps = {
  activities: AgentActivity[];
};

const STATUS_COLOR: Record<string, string> = {
  running: '#16a34a',
  working: '#16a34a',
  idle: '#6b7280',
  offline: '#dc2626',
  error: '#dc2626',
  success: '#3b82f6'
};

const getStatusColor = (status: string): string =>
  STATUS_COLOR[status.toLowerCase()] ?? '#6b7280';

/**
 * AgentActivityPanel
 * Table of agents with their current status, task, and token breakdown.
 *
 * @param activities - Array of AgentActivity items to render.
 */
export const AgentActivityPanel = ({ activities }: AgentActivityPanelProps) => {
  if (activities.length === 0) {
    return (
      <div style={{ color: '#6b7280', padding: '24px', textAlign: 'center' }}>
        No agent activity to display.
      </div>
    );
  }

  return (
    <div className="agent-activity-panel" style={{ overflowX: 'auto' }}>
      <table
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}
        aria-label="Agent activity and token usage"
      >
        <thead>
          <tr style={{ borderBottom: '1px solid #374151', color: '#9ca3af', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Agent</th>
            <th style={{ padding: '8px 12px' }}>Status</th>
            <th style={{ padding: '8px 12px' }}>Current task</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Input tokens</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Output tokens</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cost (USD)</th>
          </tr>
        </thead>
        <tbody>
          {activities.map((activity) => (
            <tr
              key={activity.memberId}
              style={{ borderBottom: '1px solid #1f2937' }}
              data-member-id={activity.memberId}
            >
              <td style={{ padding: '10px 12px', fontWeight: 500 }}>{activity.memberName}</td>
              <td style={{ padding: '10px 12px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.8rem',
                    color: getStatusColor(activity.status)
                  }}
                >
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      backgroundColor: getStatusColor(activity.status),
                      flexShrink: 0
                    }}
                  />
                  {activity.status}
                </span>
              </td>
              <td style={{ padding: '10px 12px', color: '#9ca3af', maxWidth: '200px' }}>
                <span
                  title={activity.currentTask}
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {activity.currentTask ?? '—'}
                </span>
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d1d5db' }}>
                {activity.tokenStats.inputTokens.toLocaleString()}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#d1d5db' }}>
                {activity.tokenStats.outputTokens.toLocaleString()}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                {activity.tokenStats.totalTokens.toLocaleString()}
              </td>
              <td style={{ padding: '10px 12px', textAlign: 'right', color: '#9ca3af' }}>
                ${activity.tokenStats.cost.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
