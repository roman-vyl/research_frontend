import { describe, expect, it } from "vitest";

import type { TradeRecord } from "@/api/types";
import { equityCurve } from "@/features/surface/EquityPanel";

const trade = (exit: number, equityAfter: string) => ({ exit_time_ms: exit, equity_after: equityAfter }) as unknown as TradeRecord;

describe("equityCurve", () => {
  it("orders trades by exit time and reports cumulative net PnL from the starting equity", () => {
    const pts = equityCurve([trade(300, "10250"), trade(100, "9900"), trade(200, "10100")], 10000);
    expect(pts.map((p) => p.t)).toEqual([100, 200, 300]);
    expect(pts.map((p) => p.n)).toEqual([1, 2, 3]);
    expect(pts.map((p) => p.v)).toEqual([-100, 100, 250]);
  });

  it("skips trades without a numeric equity", () => {
    expect(equityCurve([trade(1, "x"), trade(2, "10010")], 10000)).toEqual([{ t: 2, n: 2, v: 10 }]);
  });
});
