import { useCallback, useEffect, useRef, useState } from "react";

import { RuntimeCandleChart } from "@/features/runtime/RuntimeCandleChart";
import {
  loadRuntimeMarket,
  RuntimeChartError,
  type RuntimeChartErrorKind,
  type RuntimeMarket,
  type RuntimeMarketData,
} from "@/features/runtime/runtimeMarket";

const ERROR_TEXT: Record<RuntimeChartErrorKind, string> = {
  unsupported_timeframe: "This timeframe is not supported by the chart",
  bounds: "Market bounds are unavailable",
  candles: "Candles are unavailable",
};

type Status = "loading" | "ready" | "error";

function formatUtc(ms: number): string {
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * The chart depends on the market (symbol + timeframe) only; `strategyName` is header text.
 * Selecting another strategy of the same market changes nothing here but the name.
 */
export function RuntimeChartPanel({
  strategyName,
  market,
}: {
  strategyName: string | null;
  market: RuntimeMarket | null;
}) {
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

      {data && data.candles.length > 0 && <RuntimeCandleChart candles={data.candles} />}
    </section>
  );
}
