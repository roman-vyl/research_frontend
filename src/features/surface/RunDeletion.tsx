import { useEffect, useState } from "react";

import { ApiError, deleteRuns, planRunDeletion } from "@/api/client";
import type { RunDeletionPlan, RunDeletionResult } from "@/api/experiments";
import { formatGb, type SelectionRuns } from "@/features/surface/model";
import { calculateBlocked } from "@/features/surface/RunCalculation";

type BarProps = {
  selection: SelectionRuns;
  /** In select mode a plain click toggles a cell and a plain drag adds a rectangle. */
  selectMode: boolean;
  onSelectMode: (on: boolean) => void;
  onSelectPassing: () => void;
  onSelectNotPassing: () => void;
  onClear: () => void;
  onDelete: () => void;
  /** The manifest has a `materialize` block. */
  calculable: boolean;
  onCalculate: () => void;
};

/**
 * Selection tools, "Delete runs (R)" (R = distinct run ids) and "Calculate (N)" (N = addressable rows; the backend
 * plan decides which of them can be calculated).
 */
export function SelectionBar({
  selection,
  selectMode,
  onSelectMode,
  onSelectPassing,
  onSelectNotPassing,
  onClear,
  onDelete,
  calculable,
  onCalculate,
}: BarProps) {
  const r = selection.runIds.length;
  const n = selection.calcCoords.length;
  const calcHint = selection.cells > 0 ? calculateBlocked(calculable, n) : null;
  return (
    <div className="sx-panel sx-selbar" role="group" aria-label="Selection">
      <span className="sx-fsum">
        {selection.cells} cells selected · {r} runs · {selection.withoutRun} cells without run
      </span>
      <button
        type="button"
        className={`sx-fbtn${selectMode ? " sx-on" : ""}`}
        aria-pressed={selectMode}
        onClick={() => onSelectMode(!selectMode)}
      >
        {selectMode ? "Done selecting" : "Select cells"}
      </button>
      <button type="button" className="sx-fbtn" onClick={onSelectPassing}>Select passing</button>
      <button type="button" className="sx-fbtn" onClick={onSelectNotPassing}>Select not passing</button>
      <button type="button" className="sx-fbtn" onClick={onClear} disabled={selection.cells === 0}>Clear</button>
      <button type="button" className="sx-fbtn sx-danger" onClick={onDelete} disabled={r === 0}>
        Delete runs ({r})
      </button>
      <button
        type="button"
        className="sx-fbtn"
        onClick={onCalculate}
        disabled={calculateBlocked(calculable, n) !== null}
        title={calcHint ?? undefined}
      >
        Calculate ({n})
      </button>
      {calcHint && <span className="sx-note" role="note">{calcHint}</span>}
      {selection.notAddressable > 0 && <span className="sx-note">{selection.notAddressable} rows not addressable</span>}
      <span className="sx-note">
        {selectMode
          ? "Click toggles a cell, drag selects a rectangle. Esc or Done selecting returns clicks to details."
          : "Select cells to pick by click; Ctrl/Cmd+click toggles a cell, Shift+drag selects a rectangle."}
      </span>
    </div>
  );
}

const REASONS: Record<string, string> = {
  invalid_run_id: "invalid run id",
  not_in_experiment: "not in this Experiment",
  shared_with_other_experiment: "used by another Experiment",
  not_a_directory: "not a directory",
};

type Phase =
  | { kind: "planning" }
  | { kind: "plan"; plan: RunDeletionPlan }
  | { kind: "deleting"; plan: RunDeletionPlan }
  | { kind: "stale" }
  | { kind: "done"; result: RunDeletionResult }
  | { kind: "error"; message: string; plan: RunDeletionPlan | null };

const errorText = (e: unknown): string =>
  e instanceof ApiError ? `${e.status}: ${e.detail}` : e instanceof Error ? e.message : "Request failed.";

type DialogProps = {
  experimentId: string;
  runIds: string[];
  onClose: () => void;
  onDeleted: (result: RunDeletionResult) => void;
};

/** Dry run, typed confirmation, irreversible delete, result. */
export function DeleteRunsDialog({ experimentId, runIds, onClose, onDeleted }: DialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "planning" });
  const [typed, setTyped] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "planning" });
    setTyped("");
    planRunDeletion(experimentId, runIds)
      .then((plan) => !cancelled && setPhase({ kind: "plan", plan }))
      .catch((e) => !cancelled && setPhase({ kind: "error", message: errorText(e), plan: null }));
    return () => {
      cancelled = true;
    };
  }, [experimentId, runIds, attempt]);

  const confirm = (plan: RunDeletionPlan) => {
    setPhase({ kind: "deleting", plan });
    deleteRuns(experimentId, runIds, plan.plan_token)
      .then((result) => {
        setPhase({ kind: "done", result });
        onDeleted(result);
      })
      .catch((e) =>
        setPhase(e instanceof ApiError && e.status === 409 ? { kind: "stale" } : { kind: "error", message: errorText(e), plan }),
      );
  };

  const plan = phase.kind === "plan" || phase.kind === "deleting" ? phase.plan : null;
  const canConfirm = phase.kind === "plan" && plan !== null && plan.run_count > 0 && typed.trim() === String(plan.run_count);
  const skipped = new Map<string, number>();
  for (const s of plan?.skipped ?? []) skipped.set(s.reason, (skipped.get(s.reason) ?? 0) + 1);

  return (
    <div className="sx-modal-back">
      <div className="sx-panel sx-modal" role="dialog" aria-modal="true" aria-label="Delete runs">
        <h3>Delete runs</h3>
        {phase.kind === "planning" && <p className="sx-note">Planning…</p>}
        {plan && (
          <>
            <dl className="sx-plan">
              <div><dt>Runs</dt><dd>{plan.run_count}</dd></div>
              <div><dt>Files</dt><dd>{plan.file_count}</dd></div>
              <div><dt>Size</dt><dd>{formatGb(plan.bytes)}</dd></div>
              <div><dt>Already absent</dt><dd>{plan.already_absent}</dd></div>
            </dl>
            {skipped.size > 0 && (
              <ul className="sx-pt-list" aria-label="Skipped">
                {[...skipped.entries()].map(([reason, n]) => (
                  <li key={reason}>{n} skipped: {REASONS[reason] ?? reason}</li>
                ))}
              </ul>
            )}
            <p className="sx-note">
              This cannot be undone. Run folders are deleted and their run_id is cleared in the result table, which is
              rewritten; metrics stay. No script may be writing the same table meanwhile.
            </p>
            <label className="sx-frow">
              Type {plan.run_count} to confirm{" "}
              <input
                aria-label="Run count"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={phase.kind !== "plan" || plan.run_count === 0}
              />
            </label>
          </>
        )}
        {phase.kind === "stale" && (
          <p role="alert" className="sx-error">The table or the selection changed since the plan. Nothing was deleted.</p>
        )}
        {phase.kind === "error" && <p role="alert" className="sx-error">{phase.message}</p>}
        {phase.kind === "done" && (
          <dl className="sx-plan" aria-label="Deleted">
            <div><dt>Deleted</dt><dd>{phase.result.deleted}</dd></div>
            <div><dt>Already absent</dt><dd>{phase.result.already_absent}</dd></div>
            <div><dt>Freed</dt><dd>{formatGb(phase.result.bytes)}</dd></div>
            <div><dt>Backup</dt><dd>{phase.result.backup}</dd></div>
          </dl>
        )}
        <div className="sx-modal-actions">
          {(phase.kind === "stale" || (phase.kind === "error" && phase.plan === null)) && (
            <button type="button" className="sx-fbtn" onClick={() => setAttempt((a) => a + 1)}>New plan</button>
          )}
          {plan && (
            <button
              type="button"
              className="sx-fbtn sx-danger"
              disabled={!canConfirm}
              onClick={() => plan && confirm(plan)}
            >
              {phase.kind === "deleting" ? "Deleting…" : `Delete ${plan.run_count} runs`}
            </button>
          )}
          <button type="button" className="sx-fbtn" onClick={onClose} disabled={phase.kind === "deleting"}>
            {phase.kind === "done" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
