import { useCallback, useEffect, useRef, useState } from "react";

import { fetchJournalStrategyInstances, type JournalStrategyInstance } from "@/api/journal";
import {
  fetchRuntimeStrategyInstances,
  fetchRuntimeStrategyStates,
  deleteRuntimeStrategy,
  setRuntimeStrategyEnabled,
  RuntimeDeleteError,
  RuntimeCommandError,
  RuntimeEnabledError,
  RuntimeListError,
  sendRuntimeCommand,
  type RuntimeOperatorCommand,
  type RuntimeListErrorKind,
  type RuntimeStrategyInstance,
  type RuntimeStrategyList,
  type RuntimeStrategyState,
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

const STATE_REFRESH_MS = 10_000;

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

const DELETE_REFUSAL_TEXT: Record<string, string> = {
  still_enabled: "This strategy is enabled. Disable it first.",
  position_open: "This strategy has an open position and cannot be deleted.",
  recovery_pending: "This strategy is recovering an order or position and cannot be deleted yet.",
  cycle_not_settled: "This strategy's trade cycle has just ended. Try again after the next bar.",
  cancel_not_confirmed: "The entry order could not be confirmed cancelled on the exchange. The strategy was not deleted.",
  abi_unavailable: "The exchange gateway did not answer. The strategy was not deleted.",
  instance_busy: "The strategy is processing a bar. Try again in a moment.",
  file_changed: "The strategy file was changed while deleting. Nothing was changed. Try again.",
  trash_name_taken: "Runtime could not move the strategy file to the trash. Nothing was changed. Try again.",
  move_failed: "Runtime could not move the strategy file to the trash. Nothing was changed. Try again.",
  strategy_instance_not_found: "Runtime no longer has this strategy. Refresh the list.",
  catalog_unavailable: "Runtime cannot read the strategy files. Nothing was changed.",
};

const COMMAND_REFUSAL_TEXT: Record<string, string> = {
  no_position: "There is no open position or entry order to act on any more. Nothing was changed.",
  recovery_pending: "This strategy is recovering an order or position. Nothing was changed. Try again later.",
  cycle_not_settled: "This strategy's trade cycle has just ended. Nothing was changed. Try again after the next bar.",
  position_open: "The entry order has already filled, so the strategy is in a position. Nothing was changed.",
  cancel_not_confirmed: "The entry order could not be confirmed cancelled on the exchange. The strategy stays enabled.",
  abi_unavailable: "The exchange gateway did not answer. Nothing was changed.",
  instance_busy: "The strategy is processing a bar. Nothing was changed. Try again in a moment.",
  file_changed: "The strategy file was changed meanwhile. Try again and check the card.",
  identity_changed: "The strategy file no longer matches this strategy. Refresh the list.",
  write_failed: "Runtime could not write the strategy file. Check the card before trying again.",
  strategy_instance_not_found: "Runtime no longer has this strategy. Refresh the list.",
  catalog_unavailable: "Runtime cannot read the strategy files. Nothing was changed.",
  not_ready: "Runtime is not ready. Nothing was changed.",
};

const CLOSE_NOT_CONFIRMED_TEXT =
  "The exchange did not confirm the close. Runtime is still completing it, and the strategy is already disabled. Check the card in a minute.";

function commandRefusalText(command: RuntimeOperatorCommand, err: unknown): string {
  if (!(err instanceof RuntimeCommandError)) return GENERIC_REFUSAL;
  if (command === "close-position" && err.httpStatus === 502) return CLOSE_NOT_CONFIRMED_TEXT;
  const reason = err.reason;
  return (
    (reason !== null && Object.hasOwn(COMMAND_REFUSAL_TEXT, reason) ? COMMAND_REFUSAL_TEXT[reason] : undefined) ??
    GENERIC_REFUSAL
  );
}

function deleteRefusalText(reason: string | null): string {
  return (
    (reason !== null && Object.hasOwn(DELETE_REFUSAL_TEXT, reason) ? DELETE_REFUSAL_TEXT[reason] : undefined) ??
    GENERIC_REFUSAL
  );
}

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

function commandFor(state: RuntimeStrategyState | undefined): RuntimeOperatorCommand | null {
  if (state?.trade_state === "in_position") return "close-position";
  if (state?.trade_state === "entry_pending") return "cancel-entry-orders";
  return null;
}

function tradeMarks(state: RuntimeStrategyState | undefined): string[] {
  if (!state) return [];
  const marks: string[] = [];
  const side = state.side ? ` · ${state.side.toUpperCase()}` : "";
  if (state.trade_state === "in_position") marks.push(`IN POSITION${side}`);
  if (state.trade_state === "entry_pending") marks.push(`ENTRY ORDER${side}`);
  if (state.recovery_pending) marks.push(`RECOVERY · ${state.recovery_pending.toUpperCase()}`);
  return marks;
}

export function RuntimeDashboard() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [selected, setSelected] = useState<RuntimeStrategyInstance | null>(null);
  const [journal, setJournal] = useState<ReadonlyMap<string, JournalStrategyInstance> | null>(null);
  const generation = useRef(0);
  const [states, setStates] = useState<ReadonlyMap<string, RuntimeStrategyState> | null>(null);
  const [statesFailed, setStatesFailed] = useState(false);
  const statesInFlight = useRef(false);
  const [switching, setSwitching] = useState<ReadonlySet<string>>(new Set());
  const [refusal, setRefusal] = useState<{ text: string; instanceId: string; kind: "switch" | "delete" | "command" } | null>(null);
  const [confirming, setConfirming] = useState<RuntimeStrategyInstance | null>(null);
  const [commanding, setCommanding] = useState<{ s: RuntimeStrategyInstance; command: RuntimeOperatorCommand } | null>(
    null,
  );
  const switchRefs = useRef(new Map<string, HTMLButtonElement>());
  const trashRefs = useRef(new Map<string, HTMLButtonElement>());
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const okRef = useRef<HTMLButtonElement | null>(null);

  // Runtime's stored trade state; a failure leaves the cards without marks. One read at a time.
  const loadStates = useCallback(() => {
    if (statesInFlight.current) return;
    statesInFlight.current = true;
    fetchRuntimeStrategyStates().then(
      (rows) => {
        statesInFlight.current = false;
        setStates(new Map(rows.map((r) => [r.strategy_instance_id, r])));
        setStatesFailed(false);
      },
      () => {
        statesInFlight.current = false;
        setStates(null);
        setStatesFailed(true);
      },
    );
  }, []);

  // `keepList`: a refresh after a switch re-reads in place; the cards stay mounted so the page keeps its scroll position
  const load = useCallback((keepList = false) => {
    const mine = ++generation.current;
    if (!keepList) setPhase({ kind: "loading" });
    loadStates();
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
  }, [loadStates]);

  useEffect(() => {
    load();
    return () => {
      generation.current += 1; // a response that arrives after the tab was left is ignored
    };
  }, [load]);

  // every 10 s while the tab is visible; nothing is sent while it is hidden
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") loadStates();
    };
    const timer = window.setInterval(tick, STATE_REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [loadStates]);

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
            kind: "switch",
          });
        },
      );
    },
    [load],
  );

  const closeConfirm = useCallback(() => {
    setConfirming((cur) => {
      if (cur) trashRefs.current.get(cur.strategy_instance_id)?.focus();
      return null;
    });
  }, []);

  const confirmDelete = useCallback(
    (s: RuntimeStrategyInstance) => {
      setConfirming(null);
      setSwitching((prev) => new Set(prev).add(s.strategy_instance_id));
      deleteRuntimeStrategy(s.strategy_instance_id).then(
        () => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          load(true);
        },
        (err: unknown) => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          setRefusal({
            text: deleteRefusalText(err instanceof RuntimeDeleteError ? err.reason : null),
            instanceId: s.strategy_instance_id,
            kind: "delete",
          });
        },
      );
    },
    [load],
  );

  const confirmCommand = useCallback(
    (s: RuntimeStrategyInstance, command: RuntimeOperatorCommand) => {
      setCommanding(null);
      setSwitching((prev) => new Set(prev).add(s.strategy_instance_id));
      sendRuntimeCommand(s.strategy_instance_id, command).then(
        () => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          load(true);
        },
        (err: unknown) => {
          setSwitching((prev) => withoutId(prev, s.strategy_instance_id));
          setRefusal({ text: commandRefusalText(command, err), instanceId: s.strategy_instance_id, kind: "command" });
          // a refusal may still follow a changed state (disabled strategy): show the real one
          load(true);
        },
      );
    },
    [load],
  );

  const closeRefusal = useCallback(() => {
    setRefusal((cur) => {
      if (cur && cur.kind !== "command")
        (cur.kind === "delete" ? trashRefs : switchRefs).current.get(cur.instanceId)?.focus();
      return null;
    });
  }, []);

  useEffect(() => {
    if (refusal) okRef.current?.focus();
  }, [refusal]);

  useEffect(() => {
    if (confirming || commanding) cancelRef.current?.focus();
  }, [confirming, commanding]);

  const busy = phase.kind === "loading";
  const list = phase.kind === "ready" ? phase.list : null;
  const total = list?.strategy_instances.length ?? 0;
  const enabled = list?.strategy_instances.filter((s) => s.enabled).length ?? 0;
  const inPosition = states ? [...states.values()].filter((x) => x.trade_state === "in_position").length : 0;
  const entryOrders = states ? [...states.values()].filter((x) => x.trade_state === "entry_pending").length : 0;
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
            {states && <span className="sx-chip">{inPosition} in position</span>}
            {states && <span className="sx-chip">{entryOrders} entry order</span>}
          </div>
        )}

        {list && states && (
          <p className="sx-note">Marks show Runtime's state as of each strategy's last processed bar.</p>
        )}

        {list && statesFailed && (
          <p className="sx-note" role="status">
            Trade state unavailable{" "}
            <button type="button" className="sx-fbtn" onClick={loadStates}>
              Retry
            </button>
          </p>
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
                        {tradeMarks(states?.get(s.strategy_instance_id)).map((m) => (
                          <div key={m} className="rt-meta sx-num">
                            {m}
                          </div>
                        ))}
                        {journal && (
                          <div className="rt-meta sx-num">
                            {journal.has(s.strategy_instance_id)
                              ? `Last evaluated ${formatUtc(journal.get(s.strategy_instance_id)!.last_bar_open_time_ms)}`
                              : "No evaluations yet"}
                          </div>
                        )}
                      </button>
                      <div className="rt-card-foot">
                        {commandFor(states?.get(s.strategy_instance_id)) && (
                          <button
                            type="button"
                            className="sx-fbtn rt-danger"
                            disabled={switching.has(s.strategy_instance_id)}
                            onClick={() => setCommanding({ s, command: commandFor(states?.get(s.strategy_instance_id))! })}
                          >
                            {commandFor(states?.get(s.strategy_instance_id)) === "close-position"
                              ? "Close position"
                              : "Cancel entry order"}
                          </button>
                        )}
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
                        <button
                          type="button"
                          className="rt-trash"
                          aria-label={`Delete: ${cardName(s.source_path)}`}
                          title={s.enabled ? "Disable it first." : "Delete this strategy"}
                          disabled={s.enabled || switching.has(s.strategy_instance_id)}
                          ref={(el) => {
                            if (el) trashRefs.current.set(s.strategy_instance_id, el);
                            else trashRefs.current.delete(s.strategy_instance_id);
                          }}
                          onClick={() => setConfirming(s)}
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                          </svg>
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

        {confirming && (
          <div className="rt-dialog-backdrop">
            <div
              className="sx-panel rt-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-label="Delete strategy"
              onKeyDown={(e) => {
                if (e.key === "Escape") closeConfirm();
              }}
            >
              <p className="rt-dialog-text">
                Delete {cardName(confirming.source_path)}? Runtime moves its file to the trash folder. Nothing is erased.
              </p>
              <div className="rt-dialog-actions">
                <button type="button" className="sx-fbtn" ref={cancelRef} onClick={closeConfirm}>
                  Cancel
                </button>
                <button type="button" className="sx-fbtn rt-danger" onClick={() => confirmDelete(confirming)}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {commanding && (
          <div className="rt-dialog-backdrop">
            <div
              className="sx-panel rt-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-label={commanding.command === "close-position" ? "Close position" : "Cancel entry order"}
              onKeyDown={(e) => {
                if (e.key === "Escape") setCommanding(null);
              }}
            >
              <p className="rt-dialog-text">
                {commanding.command === "close-position"
                  ? `Close the position of ${cardName(commanding.s.source_path)}? It will be closed at market and its stop and take orders cancelled. The strategy will be disabled.`
                  : `Cancel the entry order of ${cardName(commanding.s.source_path)}? The resting order will be cancelled. The strategy will be disabled.`}
              </p>
              <div className="rt-dialog-actions">
                <button type="button" className="sx-fbtn" ref={cancelRef} onClick={() => setCommanding(null)}>
                  Back
                </button>
                <button
                  type="button"
                  className="sx-fbtn rt-danger"
                  onClick={() => confirmCommand(commanding.s, commanding.command)}
                >
                  {commanding.command === "close-position" ? "Close position" : "Cancel entry order"}
                </button>
              </div>
            </div>
          </div>
        )}

        {refusal && (
          <div className="rt-dialog-backdrop">
            <div
              className="sx-panel rt-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-label={
                refusal.kind === "delete"
                  ? "Strategy was not deleted"
                  : refusal.kind === "command"
                    ? "Command did not complete"
                    : "Strategy was not switched"
              }
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
