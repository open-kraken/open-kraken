import { useState, useCallback } from 'react';

export type AsyncLoadState = 'idle' | 'loading' | 'success' | 'error';

export type AsyncStore<T> = {
  data: T;
  loadState: AsyncLoadState;
  errorMessage: string | null;
  load: () => Promise<void>;
};

/**
 * Generic hook for async data loading with load/error/data lifecycle.
 * Reduces boilerplate across stores that follow the same pattern.
 */
export const useAsyncStore = <T>(initialData: T, loadFn: () => Promise<T>): AsyncStore<T> => {
  const [data, setData] = useState<T>(initialData);
  const [loadState, setLoadState] = useState<AsyncLoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    setErrorMessage(null);
    try {
      const result = await loadFn();
      setData(result);
      setLoadState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Load failed');
      setLoadState('error');
    }
  }, [loadFn]);

  return { data, loadState, errorMessage, load };
};
