import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

type HealthPayload = {
  status?: string;
  service?: string;
  requestId?: string;
  warnings?: Array<{ name?: string; reason?: string }>;
  errors?: Array<{ name?: string; reason?: string }>;
};

type HealthTone = 'ok' | 'warn' | 'bad' | 'muted';

const fetchHealth = async (): Promise<{ ok: boolean; payload: HealthPayload | null; httpStatus: number }> => {
  try {
    const response = await fetch('/healthz', { method: 'GET', headers: { accept: 'application/json' } });
    const httpStatus = response.status;
    if (!response.ok) {
      return { ok: false, payload: null, httpStatus };
    }
    const payload = (await response.json()) as HealthPayload;
    return { ok: payload.status === 'ok', payload, httpStatus };
  } catch {
    return { ok: false, payload: null, httpStatus: 0 };
  }
};

const toneFor = (args: {
  httpStatus: number;
  payload: HealthPayload | null;
  reachable: boolean;
}): HealthTone => {
  if (!args.reachable) {
    return 'bad';
  }
  if (!args.payload) {
    return 'warn';
  }
  if (args.payload.status !== 'ok') {
    return 'bad';
  }
  if ((args.payload.warnings?.length ?? 0) > 0) {
    return 'warn';
  }
  return 'ok';
};

export const HealthToolbarCard = () => {
  const { t } = useI18n();
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [summary, setSummary] = useState<string>(() => t('health.checking'));
  const [detail, setDetail] = useState<string>(() => t('health.requesting'));
  const [tone, setTone] = useState<HealthTone>('muted');

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof fetchHealth>>, opts: { markLoadingEnd: boolean }) => {
      const reachable = result.httpStatus !== 0;
      if (!reachable) {
        setSummary(t('health.offline'));
        setDetail(t('health.startApi'));
        setTone('bad');
        if (opts.markLoadingEnd) {
          setPhase('ready');
        }
        return;
      }
      if (!result.payload) {
        setSummary(`HTTP ${result.httpStatus}`);
        setDetail(t('health.unexpectedPayload'));
        setTone('warn');
        if (opts.markLoadingEnd) {
          setPhase('ready');
        }
        return;
      }

      const label = result.payload.status ?? 'unknown';
      setSummary(label);
      const bits = [
        result.payload.service ? result.payload.service : null,
        result.payload.requestId ? result.payload.requestId : null,
        result.payload.warnings?.length ? t('health.warnings', { n: result.payload.warnings.length }) : null,
        result.payload.errors?.length ? t('health.errors', { n: result.payload.errors.length }) : null
      ]
        .filter(Boolean)
        .join(' · ');
      setDetail(bits || `HTTP ${result.httpStatus}`);

      const nextTone = toneFor({ httpStatus: result.httpStatus, payload: result.payload, reachable });
      setTone(nextTone);
      if (opts.markLoadingEnd) {
        setPhase('ready');
      }
    },
    [t]
  );

  const refresh = useCallback(
    async (mode: 'initial' | 'silent') => {
      if (mode === 'initial') {
        setPhase('loading');
      }
      const result = await fetchHealth();
      applyResult(result, { markLoadingEnd: mode === 'initial' });
      if (mode === 'silent') {
        setPhase('ready');
      }
    },
    [applyResult]
  );

  useEffect(() => {
    void refresh('initial');
    const id = window.setInterval(() => {
      void refresh('silent');
    }, 30000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div
      className="app-shell__toolbar-chip app-shell__toolbar-chip--health"
      data-shell-slot="health"
      data-health-phase={phase}
      data-health-tone={tone}
      title={detail}
    >
      <span className="sr-only">{t('health.label')}</span>
      <span className="app-shell__toolbar-health-dot" data-tone={tone} aria-hidden />
      <span className="app-shell__toolbar-chip-health-text">{summary}</span>
    </div>
  );
};
