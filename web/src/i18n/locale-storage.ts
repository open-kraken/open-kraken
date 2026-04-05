export const LOCALE_STORAGE_KEY = 'open-kraken:locale';

export type AppLocale = 'en' | 'zh' | 'ja';

export const APP_LOCALES: AppLocale[] = ['en', 'zh', 'ja'];

export const readStoredLocale = (): AppLocale => {
  if (typeof window === 'undefined') {
    return 'en';
  }
  const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  if (raw === 'zh' || raw === 'ja' || raw === 'en') {
    return raw;
  }
  return 'en';
};

export const writeStoredLocale = (locale: AppLocale) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
};

export const htmlLangFor = (locale: AppLocale): string => {
  if (locale === 'zh') {
    return 'zh-CN';
  }
  return locale;
};
