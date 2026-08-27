import { useMemo, useState } from "react";

import type { TradeRecord } from "@/api/types";
import { ExitReasonBreakdownTable } from "@/features/reports/ExitReasonBreakdownTable";
import {
  EXIT_REASON_FILTER_OPTIONS,
  type ExitReasonFilterId,
} from "@/features/reports/exitReasonFilters";
import { FeeDiagnosticsSummary } from "@/features/reports/FeeDiagnosticsSummary";
import { EM_DASH } from "@/features/reports/formatDiagnostics";
import { TradeManagementBreakdownPanel } from "@/features/reports/TradeManagementBreakdownPanel";
import { TradeStatusChip } from "@/features/reports/TradeStatusChip";
import {
  buildExitLayerBreakdown,
  buildExitReasonBreakdown,
  buildFeeDiagnostics,
  buildPhaseReachedBreakdown,
} from "@/features/reports/tradeAggregates";
import { buildTradeDiagnosticFields, formatMs, formatNum } from "@/features/reports/tradeDiagnosticsFields";
import {
  DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  distinctExitKinds,
  DIRECTION_FILTER_OPTIONS,
  filterTrades,
  OUTCOME_FILTER_OPTIONS,
  type TradeDiagnosticsFilterState,
} from "@/features/reports/tradeDiagnosticsFilters";
import { DIAGNOSTICS_COLUMNS } from "@/features/reports/tradeTableColumns";
import { findTradeById, tradeDisplayNumber, tradeIdsEqual } from "@/features/chart/tradeLookup";
import { useWorkbenchChart, useWorkbenchReport } from "@/shared/context/WorkbenchContext";

/**
 * Canonical RunTrades/RunMetrics view. Exit-reason breakdown, fee
 * diagnostics, exit-layer breakdown, and phase-reached breakdown are
 * recomputed client-side from RunTrades/managed-policy-events (see
 * tradeAggregates.ts) — all of that data is present on canonical fields.
 * Two things are NOT reconstructed anywhere here: entry-profile-scoped
 * breakdown (canonical TradeRecord has no entry_profile field) and
 * baseline-vs-managed comparison (needs an unmanaged-replay baseline the
 * backend does not produce). Both are genuine backend gaps, not omissions.
 */
export function ReportsPanel() {
  const { runDetail, selectedTradeId, selectTrade } = useWorkbenchReport();
  const { runTrades, runMetrics, managedPolicyEvents } = useWorkbenchChart();
  const [filters, setFilters] = useState<TradeDiagnosticsFilterState>(
    DEFAULT_TRADE_DIAGNOSTICS_FILTERS,
  );
  const [showDiagnosticsColumns, setShowDiagnosticsColumns] = useState(false);

  const exitKindOptions = useMemo(() => distinctExitKinds(runTrades), [runTrades]);

  const trades = useMemo(() => filterTrades(runTrades, filters), [runTrades, filters]);

  const exitReasonBreakdown = useMemo(() => buildExitReasonBreakdown(runTrades), [runTrades]);
  const feeDiagnostics = useMemo(() => buildFeeDiagnostics(runTrades), [runTrades]);
  const exitLayerBreakdown = useMemo(() => buildExitLayerBreakdown(runTrades), [runTrades]);
  const phaseReachedBreakdown = useMemo(
    () => buildPhaseReachedBreakdown(managedPolicyEvents),
    [managedPolicyEvents],
  );

  if (!runDetail) {
    return null;
  }

  const setExitReason = (exitReason: ExitReasonFilterId) => {
    setFilters((prev) => ({ ...prev, exitReason }));
  };

  return (
    <section className="panel reports-panel">
      <div className="panel__header">
        <h2>Reports</h2>
        <p className="panel__hint">
          Run {runDetail.manifest.run_id} · instance {runDetail.manifest.instance_id} · click a row
          to focus Chart
        </p>
      </div>

      <div className="reports-summary">
        <div className="metric-card">
          <span>Net PnL</span>
          <strong>{runMetrics ? formatNum(Number(runMetrics.net_pnl)) : EM_DASH}</strong>
        </div>
        <div className="metric-card">
          <span>Trades</span>
          <strong>{runMetrics ? runMetrics.realised_trade_count : EM_DASH}</strong>
        </div>
        <div className="metric-card">
          <span>Gross PnL</span>
          <strong>{runMetrics ? formatNum(Number(runMetrics.gross_pnl)) : EM_DASH}</strong>
        </div>
        <div className="metric-card">
          <span>Open</span>
          <strong>{runMetrics ? runMetrics.open_position_count : EM_DASH}</strong>
        </div>
      </div>

      {runTrades.length > 0 && (
        <>
          <h3 className="trade-detail__subtitle">Fee diagnostics</h3>
          <FeeDiagnosticsSummary feeDiagnostics={feeDiagnostics} />

          <h3 className="trade-detail__subtitle">Exit reason breakdown</h3>
          <ExitReasonBreakdownTable exitReasonBreakdown={exitReasonBreakdown} />

          <TradeManagementBreakdownPanel
            exitLayerBreakdown={exitLayerBreakdown}
            phaseReachedBreakdown={phaseReachedBreakdown}
          />
        </>
      )}

      <div className="filter-row" data-testid="filter-direction">
        <span>side</span>
        {DIRECTION_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.direction === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, direction: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row" data-testid="filter-exit-kind">
        <span>exit_kind</span>
        <button
          type="button"
          className={filters.exitKind === "all" ? "chip chip--active" : "chip"}
          onClick={() => setFilters((prev) => ({ ...prev, exitKind: "all" }))}
        >
          All
        </button>
        {exitKindOptions.map((kind) => (
          <button
            key={kind}
            type="button"
            className={filters.exitKind === kind ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, exitKind: kind }))}
          >
            {kind}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span>exit_reason</span>
        {EXIT_REASON_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.exitReason === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setExitReason(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row" data-testid="filter-outcome">
        <span>outcome</span>
        {OUTCOME_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={filters.outcome === opt.id ? "chip chip--active" : "chip"}
            onClick={() => setFilters((prev) => ({ ...prev, outcome: opt.id }))}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="filter-row trade-table-toolbar">
        <label className="diagnostics-columns-toggle">
          <input
            type="checkbox"
            checked={showDiagnosticsColumns}
            onChange={(e) => setShowDiagnosticsColumns(e.target.checked)}
          />
          Show diagnostics columns
        </label>
      </div>

      <div className="table-wrap table-wrap--fill">
        <table className="trade-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Dir</th>
              <th>Status</th>
              <th>Entry</th>
              <th>Exit</th>
              <th>PnL</th>
              {showDiagnosticsColumns &&
                DIAGNOSTICS_COLUMNS.map((col) => (
                  <th key={col.id} title={col.hint}>
                    {col.header}
                  </th>
                ))}
              <th>exit_reason</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <TradeRow
                key={trade.trade_id}
                trade={trade}
                displayNumber={index + 1}
                selected={tradeIdsEqual(selectedTradeId, trade.trade_id)}
                showDiagnosticsColumns={showDiagnosticsColumns}
                onSelect={() => selectTrade(trade.trade_id)}
              />
            ))}
          </tbody>
        </table>
        {trades.length === 0 && <p className="empty-hint">No trades match this filter.</p>}
      </div>

      {selectedTradeId !== null && (
        <TradeDetail
          trade={findTradeById(runTrades, selectedTradeId)}
          displayNumber={tradeDisplayNumber(runTrades, selectedTradeId) ?? undefined}
        />
      )}
    </section>
  );
}

function TradeRow({
  trade,
  displayNumber,
  selected,
  showDiagnosticsColumns,
  onSelect,
}: {
  trade: TradeRecord;
  displayNumber: number;
  selected: boolean;
  showDiagnosticsColumns: boolean;
  onSelect: () => void;
}) {
  const netPnl = Number(trade.net_pnl);
  return (
    <tr className={selected ? "trade-row trade-row--selected" : "trade-row"} onClick={onSelect}>
      <td>{displayNumber}</td>
      <td>{trade.side}</td>
      <td>{trade.status}</td>
      <td>{formatMs(trade.entry_time_ms)}</td>
      <td>{formatMs(trade.exit_time_ms)}</td>
      <td className={netPnl < 0 ? "pnl-negative" : "pnl-positive"}>{formatNum(netPnl)}</td>
      {showDiagnosticsColumns &&
        DIAGNOSTICS_COLUMNS.map((col) => <td key={col.id}>{col.cell(trade)}</td>)}
      <td>
        <code className="exit-reason">{trade.exit_reason}</code>
      </td>
    </tr>
  );
}

function TradeDetail({
  trade,
  displayNumber,
}: {
  trade: TradeRecord | undefined;
  displayNumber?: number;
}) {
  if (!trade) return null;
  const { core, diagnostics } = buildTradeDiagnosticFields(trade);

  return (
    <aside className="trade-detail">
      <div className="trade-detail__heading">
        <h3>Trade #{displayNumber ?? trade.trade_id}</h3>
        <TradeStatusChip status={trade.status} />
      </div>
      <dl>
        {core.map((f) => (
          <div key={f.key}>
            <dt>{f.label}</dt>
            <dd>
              {f.key === "exit_reason" ? <code>{f.value}</code> : f.value}
            </dd>
          </div>
        ))}
      </dl>
      {diagnostics.length > 0 && (
        <>
          <h4 className="trade-detail__subtitle">Path diagnostics</h4>
          <dl>
            {diagnostics.map((f) => (
              <div key={f.key}>
                <dt>
                  {f.hint ? (
                    <span className="diagnostic-dt__label-group">
                      <span className="diagnostic-dt__label">{f.label}</span>
                      <span className="diagnostic-dt__hint">{f.hint}</span>
                    </span>
                  ) : (
                    f.label
                  )}
                </dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </aside>
  );
}
