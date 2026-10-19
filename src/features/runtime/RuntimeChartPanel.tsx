import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ENTRY_PACKAGE_APPLIED,
  fetchJournalEvents,
  fetchJournalStrategyInstances,
  LIVE_ENTRY_EVALUATED,
  OPEN_TRADE_EVALUATED,
  PROTECTION_APPLIED,
  TRADE_CYCLE_CLOSED,
  TRADE_CYCLE_OPENED,
} from "@/api/journal";
import { RuntimeCandleChart } from "@/features/runtime/RuntimeCandleChart";
import {
  loadRuntimeMarket,
  RuntimeChartError,
  type RuntimeChartErrorKind,
  type RuntimeMarket,
  type RuntimeMarketData,
} from "@/features/runtime/runtimeMarket";
import { buildAppliedOrders, type AppliedOrders } from "@/features/runtime/runtimeAppliedOrders";
import {
  buildAppliedProtection,
  buildOpenTradeProjection,
  type AppliedProtection,
  type OpenTradeProjection,
} from "@/features/runtime/runtimeOpenTrade";
import { buildProjection, type Projection } from "@/features/runtime/runtimeProjection";
import { buildTradeCycles, type TradeCycles } from "@/features/runtime/runtimeTradeCycles";

const ERROR_TEXT: Record<RuntimeChartErrorKind, string> = {
  unsupported_timeframe: "This timeframe is not supported by the chart",
  bounds: "Market bounds are unavailable",
  candles: "Candles are unavailable",
};

type Status = "loading" | "ready" | "error";
type ProjectionPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "ready";
      projection: Projection;
      applied: AppliedOrders;
      cycles: TradeCycles;
      openTrade: OpenTradeProjection;
      protection: AppliedProtection;
    }
  | { kind: "unavailable" };

/** "2 closed (SL 1, TP 1)": only the reasons that occur. */
function closedText(cycles: TradeCycles): string {
  const parts = [
    ["SL", cycles.closedStopLoss],
    ["TP", cycles.closedTakeProfit],
    ["other", cycles.closedOther],
  ]
    .filter(([, n]) => (n as number) > 0)
    .map(([label, n]) => `${label} ${n}`);
  return parts.length > 0 ? `${cycles.closedCount} closed (${parts.join(", ")})` : `${cycles.closedCount} closed`;
}

function formatUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * The candles depend on the market (symbol + timeframe) only. The projection lines depend on the
 * selected strategy: selecting another strategy of the same market loads only that strategy's
 * journal events, never candles.
 */
export function RuntimeChartPanel({
  strategyName,
  strategyInstanceId,
  market,
}: {
  strategyName: string | null;
  strategyInstanceId: string | null;
  market: RuntimeMarket | null;
}) {
  const [phase, setPhase] = useState<ProjectionPhase>({ kind: "idle" });
  const [projectionRetry, setProjectionRetry] = useState(0);
  const [data, setData] = useState<RuntimeMarketData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [errorKind, setErrorKind] = useState<RuntimeChartErrorKind>("candles");
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const symbol = market?.symbol ?? null;
  const timeframe = market?.timeframe ?? null;

  const load = useCallback((symbol: string, timeframe: string) => {
    controller.current?.abort();
    const ctl = new AbortController();
    controller.current = ctl;
    const mine = ++generation.current;
    setStatus("loading");
    loadRuntimeMarket({ symbol, timeframe }, ctl.signal).then(
      (result) => {
        if (generation.current !== mine) return;
        setData(result);
        setStatus("ready");
      },
      (err: unknown) => {
        if (generation.current !== mine || ctl.signal.aborted) return;
        setErrorKind(err instanceof RuntimeChartError ? err.kind : "candles");
        setStatus("error");
      },
    );
  }, []);

  useEffect(() => {
    setData(null);
    if (symbol === null || timeframe === null) {
      generation.current += 1;
      controller.current?.abort();
      controller.current = null;
      return;
    }
    load(symbol, timeframe);
    return () => {
      generation.current += 1;
      controller.current?.abort();
    };
  }, [symbol, timeframe, load]);

  // Events of one strategy for the bars of the candle window, of every type in one request, plus the
  // start of its known history. The answer is split by type; other types are ignored.
  useEffect(() => {
    if (data === null || strategyInstanceId === null || data.candles.length === 0) {
      setPhase({ kind: "idle" });
      return;
    }
    const ctl = new AbortController();
    let current = true;
    setPhase({ kind: "loading" });
    const first = data.candles[0].time * 1000;
    const last = data.candles[data.candles.length - 1].time * 1000;
    Promise.all([
      fetchJournalEvents({ strategyInstanceId, fromBarMs: first, toBarMs: last, signal: ctl.signal }),
      fetchJournalStrategyInstances(ctl.signal),
    ]).then(
      ([answer, instances]) => {
        if (!current) return;
        if (answer.truncated) {
          setPhase({ kind: "unavailable" }); // no limit was passed: never draw an incomplete history as complete
          return;
        }
        const known = instances.find((i) => i.strategy_instance_id === strategyInstanceId);
        const evaluations = answer.events.filter((e) => e.event_type === LIVE_ENTRY_EVALUATED);
        const applied = answer.events.filter((e) => e.event_type === ENTRY_PACKAGE_APPLIED);
        const cycleEvents = answer.events.filter(
          (e) => e.event_type === TRADE_CYCLE_OPENED || e.event_type === TRADE_CYCLE_CLOSED,
        );
        setPhase({
          kind: "ready",
          projection: buildProjection(data.candles, evaluations, known ? known.first_bar_open_time_ms : null),
          applied: buildAppliedOrders(data.candles, applied),
          cycles: buildTradeCycles(data.candles, cycleEvents, applied),
          openTrade: buildOpenTradeProjection(data.candles, answer.events.filter((e) => e.event_type === OPEN_TRADE_EVALUATED)),
          protection: buildAppliedProtection(data.candles, answer.events.filter((e) => e.event_type === PROTECTION_APPLIED)),
        });
      },
      () => {
        if (current) setPhase({ kind: "unavailable" });
      },
    );
    return () => {
      current = false;
      ctl.abort();
    };
  }, [data, strategyInstanceId, projectionRetry]);

  const projection = useMemo(() => (phase.kind === "ready" ? phase.projection : null), [phase]);
  const applied = useMemo(() => (phase.kind === "ready" ? phase.applied : null), [phase]);
  const cycles = useMemo(() => (phase.kind === "ready" ? phase.cycles : null), [phase]);
  const openTrade = useMemo(() => (phase.kind === "ready" ? phase.openTrade : null), [phase]);
  const protection = useMemo(() => (phase.kind === "ready" ? phase.protection : null), [phase]);

  if (symbol === null || timeframe === null) {
    return (
      <section className="sx-panel rt-chart" aria-label="Market chart">
        <p className="sx-note">Select a strategy</p>
      </section>
    );
  }

  const reload = () => load(symbol, timeframe);
  const busy = status === "loading";

  return (
    <section className="sx-panel rt-chart" aria-label="Market chart">
      <div className="rt-chart-head">
        <div className="rt-chart-title">
          <span className="rt-name">{strategyName}</span>
          <span className="rt-meta sx-num">
            {symbol} · {timeframe}
          </span>
          {data && (
            <span className="rt-meta sx-num">Last bar {formatUtc(data.bounds.latest_open_time_ms)}</span>
          )}
        </div>
        <button type="button" className="sx-fbtn" aria-label="Refresh chart" onClick={reload} disabled={busy}>
          Refresh
        </button>
      </div>

      {busy && (
        <p className="sx-note" role="status">
          Loading…
        </p>
      )}

      {status === "error" && (
        <div className="rt-error">
          <p role="alert" className="sx-error">
            {ERROR_TEXT[errorKind]}
          </p>
          {errorKind !== "unsupported_timeframe" && (
            <button type="button" className="sx-fbtn" aria-label="Retry chart" onClick={reload}>
              Retry
            </button>
          )}
        </div>
      )}

      {data && data.candles.length === 0 && status === "ready" && (
        <p className="sx-note">No candles in this window</p>
      )}

      {phase.kind === "unavailable" && (
        <div className="rt-error">
          <p role="alert" className="sx-error">
            Projection unavailable
          </p>
          <button type="button" className="sx-fbtn" aria-label="Retry projection" onClick={() => setProjectionRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {data && data.candles.length > 0 && (
        <RuntimeCandleChart
          candles={data.candles}
          projection={projection}
          applied={applied}
          cycles={cycles}
          openTrade={openTrade}
          protection={protection}
        />
      )}

      {projection && (
        <div className="rt-legend" aria-label="Projection legend">
          <span className="rt-swatch" data-line="entry">Entry</span>
          <span className="rt-swatch" data-line="stop">Stop</span>
          <span className="rt-swatch" data-line="take">Take</span>
          {projection.noEvaluationTimes.length > 0 && (
            <span className="rt-meta sx-num">{projection.noEvaluationTimes.length} bars without a recorded evaluation</span>
          )}
          {projection.unreadableCount > 0 && (
            <span className="rt-meta sx-num">{projection.unreadableCount} unreadable</span>
          )}
          {applied && applied.appliedCount > 0 && (
            <>
              <span className="rt-swatch" data-ring="applied">Applied</span>
              <span className="rt-meta sx-num">{applied.appliedCount} applied orders</span>
            </>
          )}
          {applied && applied.unreadableCount > 0 && (
            <span className="rt-meta sx-num">{applied.unreadableCount} unreadable applied</span>
          )}
          {cycles && cycles.openedCount + cycles.closedCount > 0 && (
            <>
              <span className="rt-swatch" data-mark="opened">Opened</span>
              <span className="rt-meta sx-num">{cycles.openedCount} opened</span>
              <span className="rt-meta sx-num">{closedText(cycles)}</span>
            </>
          )}
          {cycles && cycles.unreadableCount > 0 && (
            <span className="rt-meta sx-num">{cycles.unreadableCount} unreadable cycle events</span>
          )}
          {openTrade && openTrade.barCount > 0 && (
            <>
              <span className="rt-swatch" data-line="open">Engine stop/take (open)</span>
              <span className="rt-meta sx-num">{openTrade.barCount} open-position bars</span>
            </>
          )}
          {openTrade && openTrade.unreadableCount > 0 && (
            <span className="rt-meta sx-num">{openTrade.unreadableCount} unreadable open-position events</span>
          )}
          {protection && protection.appliedCount > 0 && (
            <>
              <span className="rt-swatch" data-ring="protection">Protection</span>
              <span className="rt-meta sx-num">{protection.appliedCount} protection changes</span>
            </>
          )}
          {protection && protection.technicalTakeCount > 0 && (
            <span className="rt-meta sx-num">{protection.technicalTakeCount} technical takes (not drawn)</span>
          )}
          {protection && protection.unreadableCount > 0 && (
            <span className="rt-meta sx-num">{protection.unreadableCount} unreadable protection</span>
          )}
        </div>
      )}
    </section>
  );
}
