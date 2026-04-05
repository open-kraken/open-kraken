import { escapeHtml, getRealtimeStateMeta } from './contracts.mjs';

export const buildRealtimeStatusPlaceholderView = ({ realtimeState }) => {
  const meta = getRealtimeStateMeta(realtimeState);
  return {
    state: meta.key,
    label: meta.label,
    tone: meta.tone,
    affectsComposer: meta.affectsComposer,
    blocksComposer: meta.blocksComposer
  };
};

export const renderRealtimeStatusPlaceholder = (view) => `<div class="chat-realtime-status chat-realtime-status--${escapeHtml(view.tone)}" data-realtime-state="${escapeHtml(view.state)}" data-affects-composer="${String(view.affectsComposer)}" data-blocks-composer="${String(view.blocksComposer)}">
  <span class="chat-realtime-status__label">${escapeHtml(view.label)}</span>
</div>`;
