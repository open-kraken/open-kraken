import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptsTerminalHash, decodeTerminalHash } from '@/pages/terminal/terminal-route-utils';

test('terminal route accepts persisted backend session ids in the URL hash', () => {
  assert.equal(acceptsTerminalHash('2a5f0c42-5b7e-48f3-9072-7d1460cbe50d'), true);
  assert.equal(acceptsTerminalHash('session-1'), true);
  assert.equal(acceptsTerminalHash('term_owner_1'), true);
  assert.equal(acceptsTerminalHash('../not-a-session'), false);
});

test('terminal route decodes encoded session ids from the URL hash', () => {
  assert.equal(decodeTerminalHash('#session%3Aprimary'), 'session:primary');
  assert.equal(decodeTerminalHash('#term_owner_1'), 'term_owner_1');
});
