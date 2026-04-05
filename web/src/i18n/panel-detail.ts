import {
  DEFAULT_READONLY_REASON_EN,
  INVALID_JSON_DETAIL_EN
} from '@/features/roadmap-project-data/store';

export const translatePanelDetail = (
  detail: string | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string => {
  if (!detail) {
    return '';
  }
  if (detail === DEFAULT_READONLY_REASON_EN) {
    return t('store.readonlyDefault');
  }
  if (detail === INVALID_JSON_DETAIL_EN) {
    return t('store.invalidJson');
  }
  return detail;
};
