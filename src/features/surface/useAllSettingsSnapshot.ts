import { useEffect, useRef, useState } from "react";

import { fetchExperimentResults } from "@/api/client";
import type { ExperimentResults } from "@/api/experiments";
import { covers } from "@/features/surface/allSettings";

export type AllSettingsSnapshot = {
  snap: ExperimentResults | null;
  loading: boolean;
  error: string | null;
};

const message = (e: unknown): string => (e instanceof Error ? e.message : "Request failed.");

/**
 * One columnar snapshot of the whole result table for "All settings". Nothing is requested while `columns`
 * is null. A snapshot that already holds every needed column is reused; otherwise the WHOLE needed set is
 * requested again in one response (columns of different responses are never joined by row index).
 * A new Experiment or `version` (reload, run deletion, Calculate) drops the snapshot.
 */
export function useAllSettingsSnapshot(experimentId: string | null, columns: string[] | null, version: number): AllSettingsSnapshot {
  const [snap, setSnap] = useState<ExperimentResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loaded = useRef<{ key: string; columns: string[] } | null>(null);

  useEffect(() => {
    loaded.current = null;
    setSnap(null);
    setError(null);
  }, [experimentId, version]);

  const wanted = columns ? columns.join(",") : null;
  useEffect(() => {
    if (experimentId === null || columns === null || wanted === null) return;
    const key = `${experimentId}|${version}`;
    const have = loaded.current;
    if (have && have.key === key && covers(have.columns, columns)) return;
    const ctl = new AbortController();
    setLoading(true);
    setError(null);
    fetchExperimentResults({ experimentId, filters: {}, columns, signal: ctl.signal })
      .then((r) => {
        loaded.current = { key, columns: r.columns };
        setSnap(r);
        setLoading(false);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError(message(e));
        setLoading(false);
      });
    return () => ctl.abort();
    // `wanted` stands for `columns`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, wanted, version]);

  return { snap, loading, error };
}
