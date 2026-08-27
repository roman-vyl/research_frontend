import {
  exitReasonAvgHoldBars,
  exitReasonAvgReturnPct,
  exitReasonWinRate,
  type ExitReasonBreakdown,
} from "@/features/reports/tradeAggregates";
import {
  EM_DASH,
  formatHoldBars,
  formatMoney,
  formatReturnPct,
  formatWinRate,
} from "@/features/reports/formatDiagnostics";

type Props = {
  exitReasonBreakdown: ExitReasonBreakdown;
};

export function ExitReasonBreakdownTable({ exitReasonBreakdown }: Props) {
  const reasons = Object.keys(exitReasonBreakdown).sort();

  return (
    <div className="table-wrap breakdown-table-wrap">
      <table className="trade-table breakdown-table breakdown-table--exit-reason">
        <thead>
          <tr>
            <th className="exit-reason-col">exit_reason</th>
            <th>Trades</th>
            <th>Win rate</th>
            <th>PnL</th>
            <th>Gross</th>
            <th>Fees</th>
            <th>Avg ret %</th>
            <th>Avg hold</th>
          </tr>
        </thead>
        <tbody>
          {reasons.map((reason) => {
            const bucket = exitReasonBreakdown[reason];
            const empty = bucket.trades === 0;
            return (
              <tr key={reason}>
                <td className="exit-reason-col">
                  <code className="exit-reason">{reason}</code>
                </td>
                <td>{bucket.trades}</td>
                <td>{empty ? EM_DASH : formatWinRate(exitReasonWinRate(bucket))}</td>
                <td>{formatMoney(bucket.pnl)}</td>
                <td>{formatMoney(bucket.gross_pnl)}</td>
                <td>{formatMoney(bucket.fees_paid)}</td>
                <td>{empty ? EM_DASH : formatReturnPct(exitReasonAvgReturnPct(bucket))}</td>
                <td>{empty ? EM_DASH : formatHoldBars(exitReasonAvgHoldBars(bucket))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
