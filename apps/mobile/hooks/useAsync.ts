import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface AsyncState<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Carrega dados assíncronos e recarrega quando a tela volta a ficar em foco
 * (ex.: ao retornar de um formulário).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList, options: { refreshOnFocus?: boolean } = {}): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fnRef.current();
      if (mounted.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refreshOnFocus = options.refreshOnFocus ?? true;
  useFocusEffect(
    useCallback(() => {
      if (refreshOnFocus) void refresh();
    }, [refresh, refreshOnFocus]),
  );

  useEffect(() => {
    if (!refreshOnFocus) void refresh();
  }, [refresh, refreshOnFocus]);

  return { data, error, loading, refresh };
}
