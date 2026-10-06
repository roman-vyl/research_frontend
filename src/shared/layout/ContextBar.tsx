import { useWorkbenchReport } from "@/shared/context/WorkbenchContext";

/**
 * LEGACY: the run dropdown lists the newest runs only and is no longer part of the target
 * navigation (Surface -> point -> Open run). Kept for now as a candidate for future removal.
 */
const SHOW_LEGACY_RUN_DROPDOWN = false;

export function ContextBar() {
  const { symbol, timeframe, instanceId, runs, selectedRunId, setSelectedRunId } =
    useWorkbenchReport();

  if (!instanceId) {
    return null;
  }

  return (
    <header className="context-bar">
      <div className="context-bar__brand">Research Workbench</div>
      <div className="context-bar__fields">
        <label className="context-field">
          <span>Symbol</span>
          <strong>{symbol}</strong>
        </label>
        <label className="context-field">
          <span>Timeframe</span>
          <strong>{timeframe}</strong>
        </label>
        {SHOW_LEGACY_RUN_DROPDOWN ? (
          <label className="context-field context-field--grow">
            <span>Run</span>
            <select
              value={selectedRunId ?? ""}
              onChange={(e) => setSelectedRunId(e.target.value)}
            >
              {runs.map((run) => (
                <option key={run.run_id} value={run.run_id}>
                  {run.run_id}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="context-field context-field--grow">
            <span>Run</span>
            <strong>{selectedRunId}</strong>
          </div>
        )}
        <label className="context-field">
          <span>Instance</span>
          <strong>{instanceId}</strong>
        </label>
      </div>
    </header>
  );
}
