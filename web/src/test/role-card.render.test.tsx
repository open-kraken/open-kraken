import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { CollaborationOverviewPage } from '../pages/collaboration/CollaborationOverviewPage';
import type { RoleCardProps } from '../components/agent/RoleCard';

const members: RoleCardProps[] = [
  {
    avatarInitial: 'CL',
    name: 'Claire',
    role: 'owner',
    status: 'running',
    summary: 'Reviewing the migration checkpoint gate.'
  },
  {
    avatarInitial: 'PL',
    name: 'Planner',
    role: 'assistant',
    status: 'success',
    summary: 'Closing the current contract review round.'
  },
  {
    avatarInitial: 'RN',
    name: 'Runner',
    role: 'member',
    status: 'error',
    summary: 'Escalating a blocked dependency before merge.'
  }
];

test('collaboration overview page consumes layout shell and role-card state contracts', () => {
  const markup = renderToStaticMarkup(<CollaborationOverviewPage members={members} />);

  assert.match(markup, /collaboration-overview-page__shell/);
  assert.match(markup, /collaboration-overview-page__grid/);
  assert.match(markup, /data-role="owner"/);
  assert.match(markup, /data-status="running"/);
  assert.match(markup, /role-card__avatar/);
  assert.match(markup, /role-card__status/);
  assert.match(markup, /Blocked/);
});

test('visual contract documentation and styles pin exact breakpoints and role/status feedback hooks', () => {
  const docs = readFileSync(new URL('../../../docs/frontend/visual-system.md', import.meta.url), 'utf8');
  const layoutCss = readFileSync(new URL('../styles/layout.css', import.meta.url), 'utf8');
  const roleCardCss = readFileSync(new URL('../components/agent/RoleCard.css', import.meta.url), 'utf8');

  assert.match(docs, /mobile < 640px.*1 column/i);
  assert.match(docs, /tablet 640-1023px.*2 columns/i);
  assert.match(docs, /desktop >= 1024px.*4 columns/i);
  assert.match(layoutCss, /@media \(max-width: 1023px\)/);
  assert.match(layoutCss, /@media \(max-width: 639px\)/);
  assert.match(roleCardCss, /data-role="owner"/);
  assert.match(roleCardCss, /data-status="running"/);
});
