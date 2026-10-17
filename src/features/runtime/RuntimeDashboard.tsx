import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchRuntimeStrategyInstances,
  RuntimeListError,
  type RuntimeListErrorKind,
  type RuntimeStrategyList,
} from "@/api/runtime";
import "@/features/surface/surface.css";
import "@/features/runtime/runtime.css";

const ERROR_TEXT: Record<RuntimeListErrorKind, string> = {
  not_ready: "Runtime is not ready",
  catalog_unavailable: "Runtime catalog is unavailable",
  runtime_error: "Runtime returned an error",
  unreachable: "Runtime is not reachable",
};

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; list: RuntimeStrategyList }
  | { kind: "error"; error: RuntimeListErrorKind };

/** Card title: the spec file name without its `.json` suffix. */
function cardName(sourcePath: string): string {
  return sourcePath.replace(/\.json$/, "");
}

function Diagnostics({ list }: { list: RuntimeStrategyList }) {
  if (list.invalid_files.length === 0 && list.duplicate_identities.length === 0) return null;
  return (
    <section className="sx-panel rt-diag" aria-label="Catalog warnings">
      <h2 className="rt-diag-title">These files are not in the list above</h2>
      <ul className="rt-diag-list">
        {list.invalid_files.map((f) => (
          <li key={`invalid:${f.source_path}`} title={f.error_message ?? undefined}>
            <span className="sx-num">{f.source_path}</span> · {f.error_code}
          </li>
        ))}
        {list.duplicate_identities.map((d) => (
          <li key={`duplicate:${d.strategy_instance_id}`}>
            <span className="sx-num">{d.strategy_instance_id}</span> · same strategy in{" "}
            <span className="sx-num">{d.source_paths.join(", ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RuntimeDashboard() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const generation = useRef(0);

  const load = useCallback(() => {
    const mine = ++generation.current;
    setPhase({ kind: "loading" });
    fetchRuntimeStrategyInstances().then(
      (list) => {
        if (generation.current === mine) setPhase({ kind: "ready", list });
      },
      (err: unknown) => {
        if (generation.current !== mine) return;
        setPhase({ kind: "error", error: err instanceof RuntimeListError ? err.kind : "runtime_error" });
      },
    );
  }, []);

  useEffect(() => {
    load();
    return () => {
      generation.current += 1; // a response that arrives after the tab was left is ignored
    };
  }, [load]);

  const busy = phase.kind === "loading";
  const list = phase.kind === "ready" ? phase.list : null;
  const total = list?.strategy_instances.length ?? 0;
  const enabled = list?.strategy_instances.filter((s) => s.enabled).length ?? 0;
  const noDiagnostics = !list || (list.invalid_files.length === 0 && list.duplicate_identities.length === 0);

  return (
    <section className="sx" aria-label="Runtime Dashboard">
      <div className="sx-wrap">
        <header className="rt-head">
          <div className="rt-head-text">
            <div className="sx-eyebrow">Runtime</div>
            <h1>Runtime Dashboard</h1>
            <p className="sx-sub">Strategies registered in the Strategy Runtime catalog.</p>
          </div>
          <button type="button" className="sx-fbtn" onClick={load} disabled={busy}>
            Refresh
          </button>
        </header>

        {list && (
          <div className="rt-summary" aria-label="Summary">
            <span className="rt-count sx-num">
              {total} {total === 1 ? "strategy" : "strategies"}
            </span>
            <span className="sx-chip">{enabled} enabled</span>
            <span className="sx-chip">{total - enabled} disabled</span>
          </div>
        )}

        {phase.kind === "loading" && (
          <p className="sx-note" role="status">
            Loading…
          </p>
        )}

        {phase.kind === "error" && (
          <div className="sx-panel rt-error">
            <p role="alert" className="sx-error">
              {ERROR_TEXT[phase.error]}
            </p>
            <button type="button" className="sx-fbtn" onClick={load}>
              Retry
            </button>
          </div>
        )}

        {list && total === 0 && noDiagnostics && (
          <p className="sx-note">No strategies in the Runtime catalog</p>
        )}

        {list && total > 0 && (
          <ul className="rt-grid" aria-label="Strategies">
            {list.strategy_instances.map((s) => (
              <li key={s.strategy_instance_id} className="sx-panel rt-card">
                <div className="rt-card-top">
                  <span className="rt-name">{cardName(s.source_path)}</span>
                  <span className="rt-state" data-enabled={s.enabled ? "true" : "false"}>
                    <span className="rt-dot" aria-hidden="true" />
                    {s.enabled ? "ENABLED" : "DISABLED"}
                  </span>
                </div>
                <div className="rt-meta sx-num">
                  {s.strategy_id} · {s.instrument} · {s.base_timeframe}
                </div>
                <div className="rt-id sx-num">{s.strategy_instance_id}</div>
              </li>
            ))}
          </ul>
        )}

        {list && <Diagnostics list={list} />}
      </div>
    </section>
  );
}
