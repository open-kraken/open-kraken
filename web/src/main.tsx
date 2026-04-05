import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers/AppProviders';
import { AppShell } from '@/app/layouts/AppShell';
import '@/components/agent/RoleCard.css';
import '@/styles/theme.css';
import '@/styles/layout.css';
import '@/styles/global.css';
import '@/features/members/member-collab-panel.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppProviders>
      <AppShell />
    </AppProviders>
  </React.StrictMode>
);
