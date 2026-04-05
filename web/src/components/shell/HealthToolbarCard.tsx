import { useCallback, useEffect, useState } from 'react';

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
  const [phase, setPhase] = useState<'loading' | 'ready'>('loading');
  const [summary, setSummary] = useState<string>('Checking…');
  const [detail, setDetail] = useState<string>('Requesting /healthz');
  const [tone, setTone] = useState<HealthTone>('muted');

  const applyResult = useCallback(
    (result: Awaited<ReturnType<typeof fetchHealth>>, opts: { markLoadingEnd: boolean }) => {
      const reachable = result.httpStatus !== 0;
      if (!reachable) {
        setSummary('Offline');
        setDetail('Start the API or proxy /healthz');
        setTone('bad');
        if (opts.markLoadingEnd) {
          setPhase('ready');
        }
        return;
      }
      if (!result.payload) {
        setSummary(`HTTP ${result.httpStatus}`);
        setDetail('Unexpected health payload');
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
        result.payload.warnings?.length ? `${result.payload.warnings.length} warning(s)` : null,
        result.payload.errors?.length ? `${result.payload.errors.length} error(s)` : null
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
    []
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
      className="app-shell__toolbar-card"
      data-shell-slot="health"
      data-health-phase={phase}
      data-health-tone={tone}
    >
      <span className="app-shell__toolbar-label">Backend</span>
      <div className="app-shell__toolbar-health-row">
        <span className="app-shell__toolbar-health-dot" data-tone={tone} aria-hidden />
        <strong>{summary}</strong>
      </div>
      <small>{detail}</small>
    </div>
  );
};
