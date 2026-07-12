// apps/frontend/src/lib/useRequest.ts

import { useCallback, useEffect, useState } from "react";
import { ApiError, toApiError } from "./apiClient";

export interface RequestState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

interface SettledState<T> {
  tick: number;
  data: T | null;
  error: ApiError | null;
}

/**
 * Loads data on mount and whenever `reload()` is called. `load` must have a
 * stable identity (a module-level function or a `useCallback` result).
 *
 * `loading` is derived by comparing the requested tick with the last settled
 * one, so the effect never has to set state synchronously; previous data
 * stays visible while a reload is in flight.
 */
export function useRequest<T>(load: () => Promise<T>): RequestState<T> {
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState<SettledState<T>>({ tick: -1, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    load().then(
      (data) => {
        if (!cancelled) setSettled({ tick, data, error: null });
      },
      (error: unknown) => {
        if (!cancelled) setSettled({ tick, data: null, error: toApiError(error) });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [load, tick]);

  const reload = useCallback(() => setTick((current) => current + 1), []);

  const loading = settled.tick !== tick;

  return {
    data: settled.data,
    error: loading ? null : settled.error,
    loading,
    reload,
  };
}
