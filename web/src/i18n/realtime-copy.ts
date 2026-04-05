/** Maps fixed realtime status strings from the shell to message keys / translated copy. */

export const translateRealtimeDetail = (
  detail: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string => {
  if (detail === 'Realtime disconnected') {
    return t('realtime.detail.disconnected');
  }
  if (detail === 'Connected to workspace stream') {
    return t('realtime.detail.connected');
  }
  const reconnected = /^Reconnected from (.+)$/.exec(detail);
  if (reconnected) {
    return t('realtime.detail.reconnected', { cursor: reconnected[1] });
  }
  return detail;
};

export const translateRealtimeStatusLabel = (
  status: string,
  t: (key: string, params?: Record<string, string | number>) => string
): string => {
  switch (status) {
    case 'connected':
      return t('realtime.status.connected');
    case 'connecting':
      return t('realtime.status.connecting');
    case 'reconnecting':
      return t('realtime.status.reconnecting');
    case 'disconnected':
      return t('realtime.status.disconnected');
    case 'idle':
      return t('realtime.status.idle');
    case 'stale':
      return t('realtime.status.stale');
    default:
      return status;
  }
};
