/**
 * "To Runtime": writes the candidate's stored spec snapshot into the Strategy Runtime catalog as a new file with
 * `enabled: false`. Everything shown here describes that file in the catalog directory, never the state of Runtime.
 */
import { useState } from "react";

import { ApiError } from "@/api/client";
import type { Candidate, RuntimeExportResult } from "@/api/candidates";
import { exportToRuntime } from "@/features/candidates/store";

export type ExportRule = { canExport: boolean; hint: string };

/** Whether the row may be exported, and the hint that says why not. */
export function exportRule(c: Candidate): ExportRule {
  if (c.strategy_spec_snapshot?.source !== "run_request") {
    return { canExport: false, hint: "no strategy spec: this point has no stored run spec" };
  }
  const runtime = c.current?.runtime;
  if (!runtime) return { canExport: false, hint: "Runtime catalog is unavailable" };
  if (runtime.present === false) return { canExport: true, hint: "Create a switched-off deployment file in the Runtime catalog" };
  if ("duplicate" in runtime) {
    return { canExport: false, hint: `several files with this spec are in the Runtime catalog: ${runtime.files.join(", ")}` };
  }
  return { canExport: false, hint: `already in the Runtime catalog: ${runtime.file}` };
}

/** The catalog mark of a row: only what `current.runtime` says about a file; nothing for "no file" or "unknown". */
export function CatalogMark({ c }: { c: Candidate }) {
  const runtime = c.current?.runtime;
  if (!runtime || runtime.present === false) return null;
  if ("duplicate" in runtime) {
    return (
      <span className="sx-badge sx-badge-warn" title={runtime.files.join(", ")}>
        Runtime duplicate: {runtime.files.join(", ")}
      </span>
    );
  }
  return (
    <span className="sx-badge" title={runtime.file}>
      In Runtime catalog · {runtime.enabled ? "On" : "Off"}
    </span>
  );
}

const names = (v: unknown): string =>
  Array.isArray(v) && v.length > 0 ? v.filter((x): x is string => typeof x === "string").join(", ") : "";

/** Message for a failed export, chosen by the service error code. */
export function exportErrorText(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : "Request failed.";
  const failed = (why: string) => `Nothing was exported: ${why}`;
  switch (e.code) {
    case "no_strategy_spec":
      return failed("this candidate has no stored strategy spec.");
    case "runtime_duplicate": {
      const files = names(e.details.files);
      return failed(`a file with the same spec is already in the Runtime catalog${files ? `: ${files}` : ""}.`);
    }
    case "runtime_file_exists": {
      const file = typeof e.details.file === "string" ? e.details.file : "";
      return failed(`a file${file ? ` named ${file}` : ""} already exists in the Runtime catalog.`);
    }
    case "runtime_export_busy":
      return failed("another export is in progress. Try again.");
    case "runtime_catalog_unconfigured":
    case "runtime_catalog_unavailable":
      return failed("the Runtime catalog is unavailable.");
    case "runtime_write_failed":
    case "runtime_publish_failed":
    case "runtime_invalid_name":
      return failed(e.detail);
    default:
      return e.detail;
  }
}

type Phase =
  | { kind: "confirm" }
  | { kind: "exporting" }
  | { kind: "done"; result: RuntimeExportResult }
  | { kind: "error"; message: string };

/** Confirmation, request, result. The request has no body and the dialog cannot be closed while it runs. */
export function ExportDialog({ candidate, onClose }: { candidate: Candidate; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "confirm" });

  const confirm = () => {
    setPhase({ kind: "exporting" });
    exportToRuntime(candidate.candidate_id).then(
      (result) => setPhase({ kind: "done", result }),
      (e) => setPhase({ kind: "error", message: exportErrorText(e) }),
    );
  };

  return (
    <div className="sx-modal-back">
      <div className="sx-panel sx-modal" role="dialog" aria-modal="true" aria-label="To Runtime">
        <h3>To Runtime</h3>
        {(phase.kind === "confirm" || phase.kind === "exporting") && (
          <>
            <p>
              Research will create a new deployment file for candidate <code>{candidate.candidate_id}</code> in the Strategy
              Runtime catalog.
            </p>
            <p className="sx-note">
              The file holds the strategy spec stored when this point was starred, not the current research configuration.
              It is created switched off (<code>enabled: false</code>). Research never changes, enables or deletes it
              afterwards.
            </p>
          </>
        )}
        {phase.kind === "done" && (
          <>
            <p>
              Exported as <code>{phase.result.file}</code>, switched off.
            </p>
            {phase.result.journal === "failed" && (
              <p className="sx-note">The file was created, but the journal line was not written.</p>
            )}
          </>
        )}
        {phase.kind === "error" && <p role="alert" className="sx-error">{phase.message}</p>}
        <div className="sx-modal-actions">
          {(phase.kind === "confirm" || phase.kind === "exporting") && (
            <button type="button" className="sx-fbtn" disabled={phase.kind === "exporting"} onClick={confirm}>
              {phase.kind === "exporting" ? "Exporting…" : "Create switched-off file"}
            </button>
          )}
          <button type="button" className="sx-fbtn" onClick={onClose} disabled={phase.kind === "exporting"}>
            {phase.kind === "confirm" || phase.kind === "exporting" ? "Cancel" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
