import type { ExperimentManifest, ExperimentRegistryEntry } from "@/api/experiments";

const UNIT_SKIP = new Set(["columns", "candidate_id", "geometry_grid_unit"]);

/** Experiment title block: eyebrow, title and the manifest's units note. */
export function SurfaceHeader({ entry, manifest }: { entry: ExperimentRegistryEntry | null; manifest: ExperimentManifest | null }) {
  const units = manifest?.units && typeof manifest.units === "object" ? (manifest.units as Record<string, unknown>) : null;
  const unitRows = units
    ? Object.entries(units).filter(([k, v]) => !UNIT_SKIP.has(k) && typeof v === "string")
    : [];
  return (
    <>
      <header>
        <div className="sx-eyebrow">
          {entry ? `${entry.ticker} · ${entry.anchor} · Research Evidence` : "Research Evidence"}
          {typeof manifest?.test_id === "string" ? ` — ${manifest.test_id}` : ""}
        </div>
        <h1>{entry?.title ?? "Experiment"}</h1>
      </header>
      {unitRows.length > 0 && (
        <div className="sx-units">
          <b>Units.</b>{" "}
          {unitRows.map(([k, v]) => (
            <span key={k}>
              <b>{k}</b> = {String(v)}.{" "}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
