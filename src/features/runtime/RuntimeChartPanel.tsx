import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchJournalEvents, fetchJournalStrategyInstances } from "@/api/journal";
import { RuntimeCandleChart } from "@/features/runtime/RuntimeCandleChart";
import {
  loadRuntimeMarket,
  RuntimeChartError,
  type RuntimeChartErrorKind,
  type RuntimeMarket,
  type RuntimeMarketData,
} from "@/features/runtime/runtimeMarket";
import { buildProjection, type Projection } from "@/features/runtime/runtimeProjection";

const ERROR_TEXT: Record<RuntimeChartErrorKind, string> = {
  unsupported_timeframe: "This timeframe is not supported by the chart",
  bounds: "Market bounds are unavailable",
  candles: "Candles are unavailable",
};

type Status = "loading" | "ready" | "error";
type ProjectionPhase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; projection: Projection }
  | { kind: "unavailable" };

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

  // Events of one strategy for the bars of the candle window, in one request, plus the start of its known history.
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
        setPhase({
          kind: "ready",
          projection: buildProjection(data.candles, answer.events, known ? known.first_bar_open_time_ms : null),
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

      {data && data.candles.length > 0 && <RuntimeCandleChart candles={data.candles} projection={projection} />}

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
        </div>
      )}
    </section>
  );
}
