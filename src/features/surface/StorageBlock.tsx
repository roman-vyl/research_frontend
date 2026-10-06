import { formatGb } from "@/features/surface/model";
import type { StorageEntry } from "@/features/surface/useExperimentStorage";

const n = (v: number): string => v.toLocaleString("en-US");

/** Strategies, Engine runs and size on disk of one Experiment. */
export function StorageBlock({ entry }: { entry: StorageEntry | undefined }) {
  if (!entry || entry.status === "loading") return <span className="sx-storage" aria-label="Storage">…</span>;
  if (entry.status === "error") return <span className="sx-storage" aria-label="Storage">—</span>;
  const { rows, engine_runs, size } = entry.data;
  return (
    <span className="sx-storage" aria-label="Storage">
      <span>{n(rows)} strategies</span>
      <span>{n(engine_runs)} Engine runs</span>
      <span>{size ? formatGb(size.bytes) : "size not computed yet"}</span>
      {size && size.missing_runs > 0 && <span>{n(size.missing_runs)} runs missing on disk</span>}
    </span>
  );
}
