import { useCallback, useEffect, useRef, useState } from "react";

import { fetchExperimentStorage } from "@/api/client";
import type { ExperimentRegistryEntry, ExperimentStorage } from "@/api/experiments";

export type StorageEntry = { status: "loading" } | { status: "ok"; data: ExperimentStorage } | { status: "error" };

const PICKER_CONCURRENCY = 2;

/**
 * Storage block data, kept for the session by `experiment_id`. The picker asks only for cached sizes
 * (at most two requests at a time, once per Experiment); opening an Experiment asks to compute its size.
 */
export function useExperimentStorage(
  registry: ExperimentRegistryEntry[] | null,
  experimentId: string | null,
): { storage: Record<string, StorageEntry | undefined>; drop: (experimentId: string) => void } {
  const [storage, setStorage] = useState<Record<string, StorageEntry | undefined>>({});
  const requested = useRef(new Set<string>());
  const [dropToken, setDropToken] = useState(0);

  const put = (id: string, entry: StorageEntry) => setStorage((s) => ({ ...s, [id]: entry }));

  useEffect(() => {
    if (experimentId !== null || registry === null) return;
    const ids = registry.map((e) => e.experiment_id).filter((id) => !requested.current.has(id));
    if (ids.length === 0) return;
    const queue = [...ids];
    const done = new Set<string>();
    for (const id of ids) {
      requested.current.add(id);
      put(id, { status: "loading" });
    }
    let cancelled = false;
    const worker = async () => {
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        try {
          const data = await fetchExperimentStorage(id, "cached");
          if (cancelled) return;
          done.add(id);
          put(id, { status: "ok", data });
        } catch {
          if (cancelled) return;
          done.add(id);
          put(id, { status: "error" });
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(PICKER_CONCURRENCY, queue.length) }, worker));
    return () => {
      cancelled = true;
      // Unfinished ones are asked again on the next picker visit.
      for (const id of ids) if (!done.has(id)) requested.current.delete(id);
    };
  }, [registry, experimentId, dropToken]);

  useEffect(() => {
    if (experimentId === null) return;
    let cancelled = false;
    requested.current.add(experimentId);
    setStorage((s) => (s[experimentId]?.status === "ok" ? s : { ...s, [experimentId]: { status: "loading" } }));
    fetchExperimentStorage(experimentId, "compute")
      .then((data) => !cancelled && put(experimentId, { status: "ok", data }))
      .catch(() => !cancelled && setStorage((s) => (s[experimentId]?.status === "ok" ? s : { ...s, [experimentId]: { status: "error" } })));
    return () => {
      cancelled = true;
    };
  }, [experimentId, dropToken]);

  const drop = useCallback((id: string) => {
    requested.current.delete(id);
    setStorage((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
    setDropToken((t) => t + 1);
  }, []);

  return { storage, drop };
}
