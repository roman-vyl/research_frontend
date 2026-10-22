import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJournalStrategyInstances, type JournalStrategyInstance } from "@/api/journal";
import {
  fetchRuntimeStrategyInstances,
  setRuntimeStrategyEnabled,
  RuntimeEnabledError,
  RuntimeListError,
  type RuntimeListErrorKind,
  type RuntimeStrategyInstance,
  type RuntimeStrategyList,
} from "@/api/runtime";
import { RuntimeChartPanel } from "@/features/runtime/RuntimeChartPanel";
import "@/features/surface/surface.css";
import "@/features/runtime/runtime.css";

const ERROR_TEXT: Record<RuntimeListErrorKind, string> = {
  not_ready: "Runtime is not ready",
  catalog_unavailable: "Runtime catalog is unavailable",
  runtime_error: "Runtime returned an error",
  unreachable: "Runtime is not reachable",
};

const GENERIC_REFUSAL = "Runtime did not answer correctly. Nothing was changed.";

const REFUSAL_TEXT: Record<string, string> = {
  position_open: "This strategy has an open position and cannot be disabled.",
  recovery_pending: "This strategy is recovering an order or position and cannot be disabled yet.",
  cycle_not_settled: "This strategy's trade cycle has just ended. Try again after the next bar.",
  cancel_not_confirmed: "The entry order could not be confirmed cancelled on the exchange. The strategy stays enabled.",
  abi_unavailable: "The exchange gateway did not answer. The strategy stays enabled.",
  instance_busy: "The strategy is processing a bar. Try again in a moment.",
  file_changed: "The strategy file was changed while switching. Nothing was changed. Try again.",
  write_failed: "Runtime could not write the strategy file. Nothing was changed. Try again.",
  strategy_instance_not_found: "Runtime no longer has this strategy. Refresh the list.",
  catalog_unavailable: "Runtime cannot read the strategy files. Nothing was changed.",
};

function refusalText(reason: string | null): string {
  return (reason !== null && Object.hasOwn(REFUSAL_TEXT, reason) ? REFUSAL_TEXT[reason] : undefined) ?? GENERIC_REFUSAL;
}

type Phase =
  | { kind: "loading" }
  | { kind: "ready"; list: RuntimeStrategyList }
  | { kind: "error"; error: RuntimeListErrorKind };

function formatUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

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

function withoutId(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

export function RuntimeDashboard() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [selected, setSelected] = useState<RuntimeStrategyInstance | null>(null);
  const [journal, setJournal] = useState<ReadonlyMap<string, JournalStrategyInstance> | null>(null);
  const generation = useRef(0);
  const [switching, setSwitching] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<{ text: string; instanceId: string } | null>(null);
  const switchRefs = useRef(new Map<string, HTMLButtonElement>());
  const okRef = useRef<HTMLButtonElement | null>(null);

  // `keepList`: a refresh after a switch re-reads in place; the cards stay mounted so the page keeps its scroll position
  const load = useCallback((keepList = false) => {
    const mine = ++generation.current;
    if (!keepList) setPhase({ kind: "loading" });
    // the cards' "Last evaluated" line; a Journal failure leaves the cards as they were
    fetchJournalStrategyInstances().then(
      (rows) => {
        if (generation.current === mine) setJournal(new Map(rows.map((r) => [r.strategy_instance_id, r])));
      },
      () => {
        if (generation.current === mine) setJournal(null);
      },
    );
    fetchRuntimeStrategyInstances().then(
      (list) => {
        if (generation.current !== mine) return;
        setPhase({ kind: "ready", list });
        // the selection survives a refresh while its strategy is still listed
        setSelected((prev) =>
          prev === null
            ? null
            : (list.strategy_instances.find((s) => s.strategy_instance_id === prev.strategy_instance_id) ?? null),
        );
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

  const toggle = useCallback(
    (s: RuntimeStrategyInstance) => {
      setSwitching((prev) => new Set(prev).add(s.strategy_instance_id));
      setRuntimeStrategyEnabled(s.strategy_instance_id, !s.enabled).then(
        () => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          load(true);
        },
        (err: unknown) => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          setRefusal({
            text: refusalText(err instanceof RuntimeEnabledError ? err.reason : null),
            instanceId: s.strategy_instance_id,
          });
        },
      );
    },
    [load],
  );

  const closeRefusal = useCallback(() => {
    setRefusal((cur) => {
      if (cur) switchRefs.current.get(cur.instanceId)?.focus();
      return null;
    });
  }, []);

  useEffect(() => {
    if (refusal) okRef.current?.focus();
  }, [refusal]);

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
          <button type="button" className="sx-fbtn" onClick={() => load()} disabled={busy}>
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
            <button type="button" className="sx-fbtn" onClick={() => load()}>
              Retry
            </button>
          </div>
        )}

        {list && total === 0 && noDiagnostics && (
          <p className="sx-note">No strategies in the Runtime catalog</p>
        )}

        {(list && total > 0) || selected !== null ? (
          <div className="rt-split">
            {list && total > 0 && (
              <ul className="rt-grid" aria-label="Strategies">
                {list.strategy_instances.map((s) => {
                  const isSelected = selected?.strategy_instance_id === s.strategy_instance_id;
                  return (
                    <li key={s.strategy_instance_id} className="sx-panel rt-card" data-selected={isSelected ? "true" : "false"}>
                      <button
                        type="button"
                        className="rt-card-btn"
                        aria-pressed={isSelected}
                        onClick={() => setSelected(s)}
                      >
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
                        {journal && (
                          <div className="rt-meta sx-num">
                            {journal.has(s.strategy_instance_id)
                              ? `Last evaluated ${formatUtc(journal.get(s.strategy_instance_id)!.last_bar_open_time_ms)}`
                              : "No evaluations yet"}
                          </div>
                        )}
                      </button>
                      <div className="rt-card-foot">
                        <button
                          type="button"
                          role="switch"
                          className="rt-switch"
                          aria-checked={s.enabled}
                          aria-label={`Enabled: ${cardName(s.source_path)}`}
                          disabled={switching.has(s.strategy_instance_id)}
                          ref={(el) => {
                            if (el) switchRefs.current.set(s.strategy_instance_id, el);
                            else switchRefs.current.delete(s.strategy_instance_id);
                          }}
                          onClick={() => toggle(s)}
                        >
                          <span className="rt-switch-knob" aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <RuntimeChartPanel
              strategyName={selected ? cardName(selected.source_path) : null}
              strategyInstanceId={selected ? selected.strategy_instance_id : null}
              market={selected ? { symbol: selected.instrument, timeframe: selected.base_timeframe } : null}
            />
          </div>
        ) : null}

        {list && <Diagnostics list={list} />}

        {refusal && (
          <div className="rt-dialog-backdrop">
            <div
              className="sx-panel rt-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-label="Strategy was not switched"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeRefusal();
              }}
            >
              <p className="rt-dialog-text">{refusal.text}</p>
              <button type="button" className="sx-fbtn" ref={okRef} onClick={closeRefusal}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
