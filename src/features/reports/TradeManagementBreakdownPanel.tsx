import { formatMoney } from "@/features/reports/formatDiagnostics";
import type { ExitLayerBreakdown, PhaseReachedBreakdown } from "@/features/reports/tradeAggregates";

type Props = {
  exitLayerBreakdown: ExitLayerBreakdown;
  phaseReachedBreakdown: PhaseReachedBreakdown;
};

/**
 * Canonical replacement for the old TradeManagementDiagnosticsPanel. Phase-
 * reached and exit-layer breakdowns are computed client-side from managed-
 * policy events and trade.exit_layer — both are canonical fields. The old
 * panel's baseline-vs-managed comparison and profile-scoped breakdowns are
 * NOT reconstructed here: they need an unmanaged-replay baseline and an
 * entry_profile field respectively, neither of which the canonical Research
 * Service contract exposes. That gap is a backend blocker, not a frontend
 * omission — see the migration report.
 */
export function TradeManagementBreakdownPanel({ exitLayerBreakdown, phaseReachedBreakdown }: Props) {
  const phases = Object.keys(phaseReachedBreakdown).sort();
  const layers = Object.keys(exitLayerBreakdown).sort();

  if (phases.length === 0 && layers.length === 0) {
    return null;
  }

  return (
    <div className="trade-management-summary-block" data-testid="trade-management-diagnostics">
      <h4 className="diagnostics-block__title">Trade Management Diagnostics</h4>

      {phases.length > 0 && (
        <>
          <h4 className="diagnostics-block__title">Phase reached breakdown</h4>
          <dl className="trade-management-summary-dl">
            {phases.map((phase) => (
              <div key={phase}>
                <dt>{phase}</dt>
                <dd>{phaseReachedBreakdown[phase]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {layers.length > 0 && (
        <>
          <h4 className="diagnostics-block__title">Exit layer breakdown</h4>
          <div className="table-wrap breakdown-table-wrap">
            <table
              className="trade-table breakdown-table breakdown-table--trade-management"
              data-testid="managed-breakdown-exit-layer"
            >
              <thead>
                <tr>
                  <th>exit_layer</th>
                  <th>Trades</th>
                  <th>PnL</th>
                  <th>Wins</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((layer) => {
                  const bucket = exitLayerBreakdown[layer];
                  return (
                    <tr key={layer}>
                      <td>
                        <code>{layer}</code>
                      </td>
                      <td>{bucket.tradeCount}</td>
                      <td>{formatMoney(bucket.pnl)}</td>
                      <td>{bucket.winCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
