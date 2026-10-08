import { useEffect, useRef, useState } from "react";

import { ApiError, calculateRows, cancelCalculation, getCalculation, planCalculation } from "@/api/client";
import type { CalculationCoords, CalculationJob, CalculationOutcome, CalculationPlan } from "@/api/experiments";

/** Backend request limit of `calculate-plan` / `calculate`, applied to the coords sent. */
export const MAX_CALCULATE_ROWS = 2000;
export const POLL_MS = 2000;

export const NO_MATERIALIZE_HINT = "This Surface cannot be calculated: no materialize in the manifest";

/** Calculate is offered only when the manifest has a `materialize` block; its content is the backend's business. */
export const canCalculate = (manifest: { [key: string]: unknown } | null): boolean =>
  manifest !== null && manifest.materialize !== undefined && manifest.materialize !== null;

/** Why "Calculate (N)" is disabled, or null when it is enabled. */
export function calculateBlocked(available: boolean, n: number): string | null {
  if (!available) return NO_MATERIALIZE_HINT;
  if (n === 0) return "No addressable rows selected";
  if (n > MAX_CALCULATE_ROWS) return `At most ${MAX_CALCULATE_ROWS} rows can be calculated at once`;
  return null;
}

const OUTCOMES: [CalculationOutcome, string][] = [
  ["published", "Published"],
  ["parity_failed", "Parity failed"],
  ["engine_failed", "Engine failed"],
  ["row_stale", "Stale"],
  ["cancelled", "Cancelled"],
  ["pending", "Pending"],
];

const coordsText = (c: CalculationCoords): string =>
  Object.entries(c)
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ");

const errorText = (e: unknown): string =>
  e instanceof ApiError ? `${e.status}: ${e.detail}` : e instanceof Error ? e.message : "Request failed.";

type Phase =
  | { kind: "planning" }
  | { kind: "plan"; plan: CalculationPlan }
  | { kind: "starting"; plan: CalculationPlan }
  /** `attached`: the job was started earlier (409 `job_running`), not by this dialog. */
  | { kind: "running"; jobId: string; job: CalculationJob | null; cancelling: boolean; attached: boolean }
  | { kind: "stale" }
  | { kind: "done"; job: CalculationJob; attached: boolean }
  | { kind: "error"; message: string; retry: boolean };

/** Plan counts as the backend decided them: has run (`has_run`) apart from the other skip reasons. */
export const BUSY_TEXT = "A calculation is already running, please wait.";
export const OTHER_EXPERIMENT_TEXT = "A calculation of another Experiment is running; its progress cannot be shown here. Try again when it ends.";

/** 409 `job_running` with the active job id: follow that job instead of reporting an error. */
function busyPhase(e: unknown): Phase | null {
  if (!(e instanceof ApiError) || e.code !== "job_running") return null;
  if (typeof e.details.job_id === "string") return { kind: "running", jobId: e.details.job_id, job: null, cancelling: false, attached: true };
  return { kind: "error", message: `${BUSY_TEXT} ${e.detail}`, retry: true };
}

export function planCounts(plan: CalculationPlan): { selected: number; calculable: number; hasRun: number; other: Map<string, number> } {
  let hasRun = 0;
  const other = new Map<string, number>();
  for (const r of plan.rows) {
    if (r.status === "calculable") continue;
    const reason = r.reason ?? "skipped";
    if (reason === "has_run") hasRun += 1;
    else other.set(reason, (other.get(reason) ?? 0) + 1);
  }
  return { selected: plan.rows.length, calculable: plan.calculable_count, hasRun, other };
}

type DialogProps = {
  experimentId: string;
  rows: CalculationCoords[];
  notAddressable: number;
  onClose: () => void;
  /** Called once when the job ends (completed, cancelled or failed). */
  onFinished: (job: CalculationJob) => void;
};

/** Server plan, plain confirm, job progress with cancel, result. */
export function CalculateDialog({ experimentId, rows, notAddressable, onClose, onFinished }: DialogProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "planning" });
  const [attempt, setAttempt] = useState(0);
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    let cancelled = false;
    setPhase({ kind: "planning" });
    planCalculation(experimentId, rows)
      .then((plan) => !cancelled && setPhase({ kind: "plan", plan }))
      .catch((e) => !cancelled && setPhase(busyPhase(e) ?? { kind: "error", message: errorText(e), retry: true }));
    return () => {
      cancelled = true;
    };
  }, [experimentId, rows, attempt]);

  const jobId = phase.kind === "running" ? phase.jobId : null;
  const attached = phase.kind === "running" && phase.attached;
  useEffect(() => {
    if (jobId === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = () => {
      getCalculation(experimentId, jobId)
        .then((job) => {
          if (stopped) return;
          if (job.state === "running") {
            setPhase((p) => (p.kind === "running" ? { ...p, job } : p));
            timer = setTimeout(poll, POLL_MS);
          } else {
            setPhase({ kind: "done", job, attached });
            finished.current(job);
          }
        })
        .catch((e) => {
          if (stopped) return;
          // The status route answers 404 for a job of another Experiment.
          if (attached && e instanceof ApiError && e.status === 404) setPhase({ kind: "error", message: OTHER_EXPERIMENT_TEXT, retry: true });
          else setPhase({ kind: "error", message: errorText(e), retry: false });
        });
    };
    timer = setTimeout(poll, attached ? 0 : POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [experimentId, jobId, attached]);

  const start = (plan: CalculationPlan) => {
    setPhase({ kind: "starting", plan });
    calculateRows(experimentId, rows, plan.plan_token)
      .then((r) => setPhase({ kind: "running", jobId: r.job_id, job: null, cancelling: false, attached: false }))
      .catch((e) => {
        if (e instanceof ApiError && e.code === "plan_stale") setPhase({ kind: "stale" });
        else setPhase(busyPhase(e) ?? { kind: "error", message: errorText(e), retry: true });
      });
  };

  const cancel = (id: string) => {
    setPhase((p) => (p.kind === "running" ? { ...p, cancelling: true } : p));
    cancelCalculation(experimentId, id).catch((e) => setPhase({ kind: "error", message: errorText(e), retry: false }));
  };

  const plan = phase.kind === "plan" || phase.kind === "starting" ? phase.plan : null;
  const counts = plan ? planCounts(plan) : null;
  const job = phase.kind === "running" ? phase.job : phase.kind === "done" ? phase.job : null;
  const failedRows = phase.kind === "done" ? phase.job.rows.filter((r) => r.outcome === "parity_failed" || r.outcome === "engine_failed") : [];

  return (
    <div className="sx-modal-back">
      <div className="sx-panel sx-modal" role="dialog" aria-modal="true" aria-label="Calculate runs">
        <h3>Calculate runs</h3>
        {phase.kind === "planning" && <p className="sx-note">Planning…</p>}
        {counts && (
          <>
            <dl className="sx-plan" aria-label="Plan">
              <div><dt>Selected</dt><dd>{counts.selected}</dd></div>
              <div><dt>Calculable</dt><dd>{counts.calculable}</dd></div>
              <div><dt>Has run</dt><dd>{counts.hasRun}</dd></div>
              <div><dt>Other skipped</dt><dd>{[...counts.other.values()].reduce((a, b) => a + b, 0)}</dd></div>
            </dl>
            {counts.other.size > 0 && (
              <ul className="sx-pt-list" aria-label="Skipped">
                {[...counts.other.entries()].map(([reason, n]) => (
                  <li key={reason}>{n} skipped: {reason}</li>
                ))}
              </ul>
            )}
            {notAddressable > 0 && <p className="sx-note">{notAddressable} selected rows are not addressable and were not sent.</p>}
            <p className="sx-note">
              Each calculable row gets a new Engine run. A row is published only when the Engine reproduces its stored
              metrics; otherwise it stays unchanged.
            </p>
          </>
        )}
        {phase.kind === "running" && (
          <>
            {phase.attached && <p className="sx-note" role="status">{BUSY_TEXT}</p>}
            <p className="sx-note" aria-live="polite">
              {phase.cancelling ? "Cancelling…" : "Calculating…"} Closing this window does not cancel the job.
            </p>
            {job && <OutcomeCounts job={job} />}
          </>
        )}
        {phase.kind === "stale" && (
          <p role="alert" className="sx-error">The table or the selection changed since the plan. Nothing was calculated.</p>
        )}
        {phase.kind === "error" && <p role="alert" className="sx-error">{phase.message}</p>}
        {phase.kind === "done" && (
          <>
            <p className="sx-note">Job {phase.job.state}.{phase.job.error ? ` ${phase.job.error}` : ""}</p>
            <OutcomeCounts job={phase.job} />
            {phase.job.backup && <p className="sx-note">Backup: {phase.job.backup}</p>}
            {failedRows.length > 0 && (
              <ul className="sx-pt-list" aria-label="Failed rows">
                {failedRows.slice(0, 50).map((r) => (
                  <li key={r.position}>
                    {coordsText(r.coords)}: {r.outcome === "parity_failed" ? "parity failed" : "Engine failed"}
                    {r.parity?.map((d) => ` · ${d.column} stored ${d.expected}, Engine ${d.actual}`).join("")}
                    {r.message ? ` · ${r.message}` : ""}
                  </li>
                ))}
                {failedRows.length > 50 && <li>…and {failedRows.length - 50} more</li>}
              </ul>
            )}
          </>
        )}
        <div className="sx-modal-actions">
          {(phase.kind === "stale" || (phase.kind === "error" && phase.retry) || (phase.kind === "done" && phase.attached)) && (
            <button type="button" className="sx-fbtn" onClick={() => setAttempt((a) => a + 1)}>New plan</button>
          )}
          {plan && (
            <button
              type="button"
              className="sx-fbtn"
              disabled={phase.kind !== "plan" || plan.calculable_count === 0}
              onClick={() => start(plan)}
            >
              {phase.kind === "starting" ? "Starting…" : `Calculate ${plan.calculable_count} rows`}
            </button>
          )}
          {phase.kind === "running" && (
            <button type="button" className="sx-fbtn sx-danger" disabled={phase.cancelling} onClick={() => cancel(phase.jobId)}>
              Cancel job
            </button>
          )}
          <button type="button" className="sx-fbtn" onClick={onClose} disabled={phase.kind === "starting"}>
            {phase.kind === "done" || phase.kind === "running" ? "Close" : "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OutcomeCounts({ job }: { job: CalculationJob }) {
  return (
    <dl className="sx-plan" aria-label="Outcome">
      {OUTCOMES.filter(([k]) => k !== "pending" || job.state === "running").map(([k, label]) => (
        <div key={k}><dt>{label}</dt><dd>{job.counts[k] ?? 0}</dd></div>
      ))}
    </dl>
  );
}
