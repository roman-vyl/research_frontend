import type {
  ChartAuxEmaOverlay,
  ChartEmaOverlay,
  JsonObject,
  TradeRecord,
} from "@/api/types";
import { ActiveExitComponentsList } from "@/features/chart/ActiveExitComponentsList";
import { anchorStackPeriodsFromStrategySpec } from "@/features/chart/anchorStackFromSpec";
import { attachEmaAvailabilityHints } from "@/features/chart/exitEmaOverlayAvailability";
import { listActiveExitComponents, readExitPolicy } from "@/features/chart/exitPolicyForTrade";
import { formatMoney, formatReturnPct } from "@/features/reports/formatDiagnostics";
import { TradeDirectionChip } from "@/features/reports/TradeDirectionChip";
import { TradeStatusChip } from "@/features/reports/TradeStatusChip";
import {
  buildTradeDiagnosticFields,
  type TradeDiagnosticField,
} from "@/features/reports/tradeDiagnosticsFields";

type Props = {
  trade: TradeRecord | undefined;
  selectedTradeId: number | string;
  /** 1-based index in run trades for UI labels. */
  tradeDisplayNumber?: number;
  strategySpec: JsonObject | undefined;
  chartEmaOverlays: ChartEmaOverlay[];
  chartAuxEmaOverlays?: ChartAuxEmaOverlay[];
  focusWarning: string | null;
};

function pnlToneClass(pnl: number | null, returnPct: number | null): string {
  if (pnl !== null && !Number.isNaN(pnl)) {
    if (pnl < 0) return "pnl-negative";
    if (pnl > 0) return "pnl-positive";
    return "chart-trade-diagnostics__result--flat";
  }
  if (returnPct !== null && !Number.isNaN(returnPct)) {
    if (returnPct < 0) return "pnl-negative";
    if (returnPct > 0) return "pnl-positive";
    return "chart-trade-diagnostics__result--flat";
  }
  return "chart-trade-diagnostics__result--unknown";
}

function TradeResultSummary({
  side,
  pnl,
  returnPct,
}: {
  side: TradeRecord["side"];
  pnl: number | null;
  returnPct: number | null;
}) {
  const pctText = formatReturnPct(returnPct);
  const pnlText = formatMoney(pnl);
  const tone = pnlToneClass(pnl, returnPct);

  return (
    <p className={`chart-trade-diagnostics__result ${tone}`} data-testid="chart-trade-result">
      <span className="chart-trade-diagnostics__result-pct">{pctText}</span>
      <span className="chart-trade-diagnostics__result-sep" aria-hidden="true">
        {" "}
        ·{" "}
      </span>
      <span className="chart-trade-diagnostics__result-pnl">{pnlText}</span>
      <span className="chart-trade-diagnostics__result-sep" aria-hidden="true">
        {" "}
        ·{" "}
      </span>
      <TradeDirectionChip side={side} />
    </p>
  );
}

function DiagnosticLabel({ field }: { field: TradeDiagnosticField }) {
  if (!field.hint) return <>{field.label}</>;
  return (
    <span className="diagnostic-dt__label-group">
      <span className="diagnostic-dt__label">{field.label}</span>
      <span className="diagnostic-dt__hint">{field.hint}</span>
    </span>
  );
}

function DiagnosticDl({
  title,
  fields,
}: {
  title?: string;
  fields: TradeDiagnosticField[];
}) {
  return (
    <>
      {title ? <h4 className="trade-detail__subtitle">{title}</h4> : null}
      <dl>
        {fields.map((f) => (
          <div key={f.key}>
            <dt>
              <DiagnosticLabel field={f} />
            </dt>
            <dd>{f.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ChartTradeDiagnostics({
  trade,
  selectedTradeId,
  tradeDisplayNumber: tradeDisplayNumberProp,
  strategySpec,
  chartEmaOverlays,
  chartAuxEmaOverlays = [],
  focusWarning,
}: Props) {
  if (!trade) {
    return (
      <aside
        className="chart-trade-diagnostics trade-detail"
        data-testid="chart-trade-diagnostics"
      >
        <h3 className="chart-trade-diagnostics__title">
          Trade #{tradeDisplayNumberProp ?? selectedTradeId}
        </h3>
        <p className="chart-trade-diagnostics__empty" data-testid="chart-trade-diagnostics-stale">
          {focusWarning ?? "Trade not found in the current run."}
        </p>
      </aside>
    );
  }

  const { core, diagnostics } = buildTradeDiagnosticFields(trade);
  const coreFields = core.filter(
    (f) => f.key !== "trade_id" && f.key !== "net_pnl" && f.key !== "net_return_pct",
  );
  let anchorStack = null;
  try {
    if (strategySpec) anchorStack = anchorStackPeriodsFromStrategySpec(strategySpec);
  } catch {
    anchorStack = null;
  }

  const exitPolicy = strategySpec ? readExitPolicy(strategySpec) : null;
  const { rows, warning } = listActiveExitComponents(exitPolicy, trade);
  const loadedAuxPeriods = new Set(chartAuxEmaOverlays.map((o) => o.period));
  const rowsWithEma = attachEmaAvailabilityHints(rows, anchorStack, chartEmaOverlays).map(
    (row) => {
      if (row.emaPeriods.length === 0) return row;
      const onChart = row.emaPeriods.every(
        (p) =>
          loadedAuxPeriods.has(p) ||
          anchorStack?.fast === p ||
          anchorStack?.anchor === p ||
          anchorStack?.slow === p,
      );
      if (onChart && row.emaAvailabilityHint?.includes("unavailable")) {
        return { ...row, emaAvailabilityHint: "Shown on chart (auxiliary EMA line)" };
      }
      return row;
    },
  );

  return (
    <aside className="chart-trade-diagnostics trade-detail" data-testid="chart-trade-diagnostics">
      <div className="chart-trade-diagnostics__heading">
        <h3 className="chart-trade-diagnostics__title">
          Trade #{tradeDisplayNumberProp ?? trade.trade_id}
        </h3>
        <TradeStatusChip status={trade.status} />
      </div>
      <TradeResultSummary
        side={trade.side}
        pnl={Number(trade.net_pnl)}
        returnPct={Number(trade.net_return_pct)}
      />
      <DiagnosticDl fields={coreFields} />
      {diagnostics.length > 0 ? <DiagnosticDl title="Path diagnostics" fields={diagnostics} /> : null}
      <h4 className="trade-detail__subtitle">Active exit components</h4>
      <ActiveExitComponentsList rows={rowsWithEma} warning={warning} />
    </aside>
  );
}
