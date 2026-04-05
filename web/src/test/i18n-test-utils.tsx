import type { PropsWithChildren } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';

/** Wrap components that call useI18n() (and shell theme hooks) in tests (SSR or renderToStaticMarkup). */
export const TestI18n = ({ children }: PropsWithChildren) => (
  <ThemeProvider>
    <I18nProvider>{children}</I18nProvider>
  </ThemeProvider>
);
