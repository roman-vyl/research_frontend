import { useEffect, useRef, useState } from "react";

import {
  fetchExperimentManifest,
  fetchExperimentResults,
  fetchExperiments,
} from "@/api/client";
import type { ExperimentManifest, ExperimentRegistryEntry } from "@/api/experiments";
import { toRows, type Row } from "@/features/surface/model";

export type Slice = { rows: Row[]; provenance: string | null };

export type ExperimentData = {
  registry: ExperimentRegistryEntry[] | null;
  manifest: ExperimentManifest | null;
  /** The control that selects a slice (first non-grid control of the first view) and its options. */
  outer: { id: string; options: number[] } | null;
  slice: Slice | null;
  loading: boolean;
  error: string | null;
};

const message = (e: unknown): string => (e instanceof Error ? e.message : "Request failed.");

/**
 * Loads the registry, the selected Experiment's manifest and one filtered slice of its results.
 * The full result table is never requested: the options of the outer control come from a
 * single-column probe, then the slice is requested filtered by the chosen value.
 */
export function useExperimentData(experimentId: string | null, outerValue: number | null): ExperimentData & {
  outerId: string | null;
} {
  const [registry, setRegistry] = useState<ExperimentRegistryEntry[] | null>(null);
  const [manifest, setManifest] = useState<ExperimentManifest | null>(null);
  const [options, setOptions] = useState<number[] | null>(null);
  const [slice, setSlice] = useState<Slice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cache = useRef(new Map<string, Slice>());

  useEffect(() => {
    let cancelled = false;
    fetchExperiments()
      .then((r) => !cancelled && setRegistry(r.experiments))
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const outerId = (() => {
    const view = manifest?.result_schema.view[0];
    return view?.controls.find((c) => c !== "grid") ?? null;
  })();

  useEffect(() => {
    setManifest(null);
    setOptions(null);
    setSlice(null);
    setError(null);
    cache.current.clear();
    if (experimentId === null) return;
    let cancelled = false;
    setLoading(true);
    fetchExperimentManifest(experimentId)
      .then((m) => !cancelled && setManifest(m))
      .catch((e) => !cancelled && (setError(message(e)), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [experimentId]);

  useEffect(() => {
    if (experimentId === null || manifest === null || outerId === null) return;
    let cancelled = false;
    fetchExperimentResults({ experimentId, filters: {}, columns: [outerId] })
      .then((r) => {
        if (cancelled) return;
        const vals = new Set<number>();
        for (const v of r.data[0] ?? []) if (typeof v === "number") vals.add(v);
        setOptions([...vals].sort((a, b) => a - b));
      })
      .catch((e) => !cancelled && (setError(message(e)), setLoading(false)));
    return () => {
      cancelled = true;
    };
  }, [experimentId, manifest, outerId]);

  useEffect(() => {
    if (experimentId === null || outerId === null || outerValue === null) return;
    const key = `${experimentId}|${outerId}|${outerValue}`;
    const hit = cache.current.get(key);
    if (hit) {
      setSlice(hit);
      setLoading(false);
      return;
    }
    const ctl = new AbortController();
    setLoading(true);
    fetchExperimentResults({ experimentId, filters: { [outerId]: outerValue }, signal: ctl.signal })
      .then((r) => {
        const s: Slice = { rows: toRows(r), provenance: r.provenance?.value ?? null };
        cache.current.set(key, s);
        setSlice(s);
        setLoading(false);
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        setError(message(e));
        setLoading(false);
      });
    return () => ctl.abort();
  }, [experimentId, outerId, outerValue]);

  return {
    registry,
    manifest,
    outer: outerId && options ? { id: outerId, options } : null,
    outerId,
    slice,
    loading,
    error,
  };
}
