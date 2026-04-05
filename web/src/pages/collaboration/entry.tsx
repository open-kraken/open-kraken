import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../styles/theme.css';
import '../../styles/layout.css';
import '../../components/agent/RoleCard.css';
import { CollaborationOverviewPage } from './CollaborationOverviewPage';
import type { RoleCardProps } from '../../components/agent/RoleCard';

const members: RoleCardProps[] = [
  {
    avatarInitial: 'CL',
    name: 'Claire',
    role: 'owner',
    status: 'running',
    summary: 'Coordinating the migration cutover and reviewing final acceptance gates.'
  },
  {
    avatarInitial: 'OP',
    name: 'Ops Lead',
    role: 'supervisor',
    status: 'idle',
    summary: 'Watching deployments, health checks, and environment readiness for the new root.'
  },
  {
    avatarInitial: 'PL',
    name: 'Planner',
    role: 'assistant',
    status: 'success',
    summary: 'Freezing interface contracts and keeping cross-team sequencing aligned.'
  },
  {
    avatarInitial: 'RN',
    name: 'Runner',
    role: 'member',
    status: 'error',
    summary: 'Highlighting blockers before merge instead of burying them inside generic status text.'
  }
];

const rootNode = document.getElementById('root');
if (!rootNode) {
  throw new Error('Missing #root mount point for CollaborationOverviewPage.');
}

createRoot(rootNode).render(
  <React.StrictMode>
    <CollaborationOverviewPage members={members} />
  </React.StrictMode>
);
