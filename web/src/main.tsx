import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers/AppProviders';
import { AppShell } from '@/app/layouts/AppShell';
import { AuthProvider } from '@/auth/AuthProvider';
import { AuthGate } from '@/auth/AuthGate';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { applyTheme, getStoredTheme } from '@/theme/theme';
import { I18nProvider } from '@/i18n/I18nProvider';
import '@/styles/tailwind.css';
import '@/styles/kraken.css';
import '@/styles/theme.css';
import '@/styles/layout.css';
import '@/styles/global.css';
import '@/auth/login.css';
import '@/features/members/member-collab-panel.css';
import '@/features/members/team-member-workbench.css';
import '@/styles/features.css';
import '@/styles/polish.css';
import '@/styles/chat-lark.css';
import '@/styles/members-page.css';
import '@/styles/terminal-page.css';
import '@/styles/page-panels.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found.');
}

applyTheme(getStoredTheme());

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <I18nProvider>
          <AuthGate>
            <AppProviders>
              <AppShell />
            </AppProviders>
          </AuthGate>
        </I18nProvider>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);
