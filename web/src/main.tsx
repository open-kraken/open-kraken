import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers/AppProviders';
import { AppShell } from '@/app/layouts/AppShell';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { applyTheme, getStoredTheme } from '@/theme/theme';
import '@/components/agent/RoleCard.css';
import '@/styles/theme.css';
import '@/styles/layout.css';
import '@/styles/global.css';
import '@/features/members/member-collab-panel.css';
import '@/features/members/team-member-workbench.css';
import '@/features/nodes/nodes-feature.css';
import '@/features/ledger/ledger-page.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

applyTheme(getStoredTheme());

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AppProviders>
        <AppShell />
      </AppProviders>
    </ThemeProvider>
  </React.StrictMode>
);
