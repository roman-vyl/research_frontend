import type { TradeRecord } from "@/api/types";
import { formatHoldBars, formatMoney, formatReturnPct } from "@/features/reports/formatDiagnostics";
import {
  tableColumnHeader,
  tableColumnHint,
  type TradeExitQualityMetricKey,
} from "@/features/reports/tradeExitQualityLabels";

export type DiagnosticsColumnId = "exit_kind" | "gross_pnl" | "fees_paid" | "hold_bars" | TradeExitQualityMetricKey;

function qualityColumn(
  id: TradeExitQualityMetricKey,
  cell: (trade: TradeRecord) => string,
): {
  id: DiagnosticsColumnId;
  header: string;
  hint?: string;
  cell: (trade: TradeRecord) => string;
} {
  return {
    id,
    header: tableColumnHeader(id),
    hint: tableColumnHint(id),
    cell,
  };
}

/** Canonical TradeRecord fields only — see tradeDiagnosticsFields.ts. */
export const DIAGNOSTICS_COLUMNS: {
  id: DiagnosticsColumnId;
  header: string;
  hint?: string;
  cell: (trade: TradeRecord) => string;
}[] = [
  { id: "exit_kind", header: "kind", cell: (t) => t.exit_kind ?? "—" },
  { id: "gross_pnl", header: "gross", cell: (t) => formatMoney(Number(t.gross_pnl)) },
  { id: "fees_paid", header: "fees", cell: (t) => formatMoney(Number(t.fees_paid)) },
  { id: "hold_bars", header: "hold", cell: (t) => formatHoldBars(t.hold_bars) },
  qualityColumn("mfe_pct", (t) => formatReturnPct(Number(t.path.mfe_pct))),
  qualityColumn("mae_pct", (t) => formatReturnPct(Number(t.path.mae_pct))),
  qualityColumn("captured_pct", (t) => formatReturnPct(Number(t.path.captured_pct))),
  qualityColumn(
    "capture_ratio",
    (t) => (t.path.capture_ratio === null ? "—" : formatReturnPct(Number(t.path.capture_ratio))),
  ),
  qualityColumn(
    "giveback_pct",
    (t) => (t.path.giveback_pct === null ? "—" : formatReturnPct(Number(t.path.giveback_pct))),
  ),
];
