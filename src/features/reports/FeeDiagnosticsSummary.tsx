import type { FeeDiagnostics } from "@/features/reports/tradeAggregates";
import { formatFeesPctOfGross, formatMoney } from "@/features/reports/formatDiagnostics";

type Props = {
  feeDiagnostics: FeeDiagnostics;
};

export function FeeDiagnosticsSummary({ feeDiagnostics }: Props) {
  return (
    <div className="reports-summary fee-diagnostics-summary">
      <div className="metric-card">
        <span>Total fees</span>
        <strong>{formatMoney(feeDiagnostics.totalFeesPaid)}</strong>
      </div>
      <div className="metric-card">
        <span>Gross PnL</span>
        <strong>{formatMoney(feeDiagnostics.grossPnl)}</strong>
      </div>
      <div className="metric-card">
        <span>Net PnL</span>
        <strong>{formatMoney(feeDiagnostics.netPnl)}</strong>
      </div>
      <div className="metric-card">
        <span>Fees / gross profit</span>
        <strong>{formatFeesPctOfGross(feeDiagnostics.feesAsPctOfGrossProfit)}</strong>
      </div>
    </div>
  );
}
