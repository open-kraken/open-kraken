import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDelta,
  applySnapshot,
  applyStatus,
  applyTerminalRealtimeEvent,
  createTerminalPanelState,
  createTerminalStore,
  resolveAttach,
  selectTerminalPanelViewModel
} from '../features/terminal/terminal-store.ts';

test('snapshot initializes terminal state with authoritative replay output', () => {
  const attached = resolveAttach(createTerminalPanelState(), {
    session: {
      terminalId: 'term_owner_1',
      memberId: 'owner_1',
      workspaceId: 'ws_open_kraken',
      terminalType: 'codex',
      command: 'npm run verify:migration',
      status: 'working'
    },
    snapshot: {
      terminalId: 'term_owner_1',
      seq: 3,
      buffer: {
        history: '$ cd /Users/claire/IdeaProjects/open-kraken\n',
        data: '$ npm run verify:migration\n'
      }
    }
  });

  assert.equal(attached.output.lastSeq, 3);
  assert.equal(
    attached.output.text,
    '$ cd /Users/claire/IdeaProjects/open-kraken\n$ npm run verify:migration\n'
  );
  assert.equal(attached.runtime.connection, 'attached');
});

test('delta appends in seq order after snapshot replay', () => {
  const snapshotState = applySnapshot(createTerminalPanelState(), {
    terminalId: 'term_owner_1',
    seq: 2,
    buffer: {
      history: '$ pwd\n',
      data: '/Users/claire/IdeaProjects/open-kraken\n'
    }
  });

  const nextState = applyDelta(snapshotState, {
    terminalId: 'term_owner_1',
    seq: 3,
    data: 'README.md\n'
  });

  assert.equal(nextState.output.lastSeq, 3);
  assert.equal(
    nextState.output.text,
    '$ pwd\n/Users/claire/IdeaProjects/open-kraken\nREADME.md\n'
  );
  assert.equal(nextState.output.chunks.at(-1)?.source, 'delta');
});

test('stale delta is ignored when seq does not advance', () => {
  const current = applyDelta(
    applySnapshot(createTerminalPanelState(), {
      terminalId: 'term_owner_1',
      seq: 4,
      buffer: {
        data: 'boot\n'
      }
    }),
    {
      terminalId: 'term_owner_1',
      seq: 5,
      data: 'next\n'
    }
  );

  const stale = applyDelta(current, {
    terminalId: 'term_owner_1',
    seq: 5,
    data: 'ignored\n'
  });

  assert.equal(stale, current);
  assert.equal(stale.output.text, 'boot\nnext\n');
});

test('status changes drive terminal panel UI state', () => {
  const runningState = applyStatus(
    applyDelta(
      applySnapshot(createTerminalPanelState(), {
        terminalId: 'term_owner_1',
        seq: 1,
        buffer: {
          data: 'boot\n'
        }
      }),
      {
        terminalId: 'term_owner_1',
        seq: 2,
        data: 'stream\n'
      }
    ),
    {
      terminalId: 'term_owner_1',
      status: 'working',
      seq: 2
    }
  );

  const exitedState = applyStatus(runningState, {
    terminalId: 'term_owner_1',
    status: 'exited',
    seq: 3
  });

  const runningView = selectTerminalPanelViewModel(runningState);
  const exitedView = selectTerminalPanelViewModel(exitedState);

  assert.equal(runningView.uiState, 'attached-output');
  assert.match(runningView.statusBadge, /Working/);
  assert.equal(exitedView.uiState, 'exited');
  assert.match(exitedView.body, /finished/i);
});

test('attach failure surfaces an error state with retry action', async () => {
  const store = createTerminalStore({
    attachSession: async () => {
      throw new Error('attach refused by server');
    }
  });

  await store.attach('term_owner_1');

  const state = store.getState();
  const view = selectTerminalPanelViewModel(state);

  assert.equal(state.runtime.connection, 'error');
  assert.equal(view.uiState, 'error');
  assert.equal(view.primaryAction.kind, 'retry');
  assert.match(view.errorMessage ?? '', /attach refused by server/);
});

test('attach on a different terminal rebinds the panel and old terminal deltas stay ignored', () => {
  const first = resolveAttach(createTerminalPanelState(), {
    session: {
      terminalId: 'term_owner_1',
      memberId: 'owner_1',
      workspaceId: 'ws_open_kraken',
      terminalType: 'codex',
      command: 'npm run verify:migration',
      status: 'working'
    },
    snapshot: {
      terminalId: 'term_owner_1',
      seq: 1,
      buffer: { data: 'first\n' }
    }
  });

  const switched = applyTerminalRealtimeEvent(first, {
    event: 'terminal.attach',
    workspaceId: 'ws_open_kraken',
    terminalId: 'term_member_2',
    session: {
      terminalId: 'term_member_2',
      memberId: 'member_2',
      workspaceId: 'ws_open_kraken',
      terminalType: 'codex',
      command: 'go test ./...',
      status: 'attached'
    }
  });

  const ignoredOldDelta = applyDelta(switched, {
    terminalId: 'term_owner_1',
    seq: 2,
    data: 'ignored\n'
  });

  assert.equal(switched.activeTerminalId, 'term_member_2');
  assert.equal(switched.output.text, '');
  assert.equal(ignoredOldDelta.output.text, '');
  assert.equal(ignoredOldDelta.session?.command, 'go test ./...');
});

test('canonical terminal status updates lifecycle state without rewriting buffered output', () => {
  const state = applyTerminalRealtimeEvent(
    applySnapshot(createTerminalPanelState(), {
      terminalId: 'term_owner_1',
      seq: 3,
      buffer: { data: 'boot\n' }
    }),
    {
      event: 'terminal.status',
      workspaceId: 'ws_open_kraken',
      terminalId: 'term_owner_1',
      status: 'failed',
      seq: 4,
      connectionState: 'error',
      processState: 'failed',
      errorMessage: 'pty crashed'
    }
  );

  assert.equal(state.output.text, 'boot\n');
  assert.equal(state.runtime.connection, 'error');
  assert.equal(state.runtime.process, 'failed');
  assert.equal(state.runtime.error.kind, 'runtime_error');
});
