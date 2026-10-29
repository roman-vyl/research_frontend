/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JournalError } from "@/api/journal";
import { RuntimeListError, type RuntimeStrategyList } from "@/api/runtime";
import { TradesPanel } from "@/features/trades/TradesPanel";
import { REAL_SHORT, trade, waiting } from "@/features/trades/tradeFixtures";

const fetchClosedTrades = vi.fn();
const fetchRuntimeStrategyInstances = vi.fn();

vi.mock("@/api/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/journal")>()),
  fetchClosedTrades: (...a: unknown[]) => fetchClosedTrades(...a),
}));

vi.mock("@/api/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/runtime")>()),
  fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a),
}));

function runtimeList(): RuntimeStrategyList {
  return {
    scanned_file_count: 1,
    strategy_instances: [
      {
        strategy_instance_id: REAL_SHORT.strategy_instance_id,
        strategy_id: "ema_pullback",
        instrument: "BTCUSDT.P",
        base_timeframe: "5m",
        enabled: true,
        source_path: "btc-ema200-w10.json",
      },
    ],
    invalid_files: [],
    duplicate_identities: [],
  };
}

function tile(label: string): HTMLElement {
  const summary = screen.getByLabelText("Summary");
  const node = within(summary).getByText(label).parentElement;
  if (!node) throw new Error(label);
  return node;
}

describe("TradesPanel", () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error("no network in tests")));

  beforeEach(() => {
    fetchClosedTrades.mockReset();
    fetchRuntimeStrategyInstances.mockReset();
    fetchClosedTrades.mockResolvedValue([REAL_SHORT]);
    fetchRuntimeStrategyInstances.mockResolvedValue(runtimeList());
    fetchSpy.mockClear();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("reads the journal and Runtime once on open and nothing else", async () => {
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    expect(fetchClosedTrades).toHaveBeenCalledTimes(1);
    expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the real Demo short in the summary, calendar and table", async () => {
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    expect(tile("Net PnL, USDT").textContent).toContain("−1,307.99");
    expect(tile("Trades").textContent).toContain("1");
    expect(tile("Win rate").textContent).toContain("0.0%");
    expect(tile("Average R").textContent).toContain("−1.38");
    expect(tile("Profit factor").textContent).toContain("0.00");
    expect(tile("Fees, USDT").textContent).toContain("338.60");
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeTruthy();
    expect(screen.getByLabelText("October 25: −1,307.99 USDT, 1 trades")).toBeTruthy();
    const table = screen.getByRole("table");
    const row = within(table).getAllByRole("row")[1];
    expect(row.textContent).toContain("2026-10-25 15:00");
    expect(row.textContent).toContain("btc-ema200-w10");
    expect(row.textContent).toContain("Short");
    expect(row.textContent).toContain("Stop loss");
    expect(row.textContent).toContain("80,496.1");
    expect(row.textContent).toContain("−1.38");
    expect(row.textContent).toContain("complete");
  });

  it("falls back to short ids when Runtime does not answer", async () => {
    fetchRuntimeStrategyInstances.mockRejectedValue(new RuntimeListError("unreachable"));
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    expect(screen.getByText(/Strategy names are unavailable/)).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText("6072511f")).toBeTruthy();
  });

  it("shows an error with Retry when the journal fails, and Retry repeats both reads", async () => {
    fetchClosedTrades.mockRejectedValueOnce(new JournalError("journal unreachable"));
    render(<TradesPanel />);
    expect((await screen.findByRole("alert")).textContent).toContain("The journal could not be read.");
    expect(screen.queryByLabelText("Summary")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByLabelText("Summary");
    expect(fetchClosedTrades).toHaveBeenCalledTimes(2);
    expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2);
  });

  it("says so when there are no closed trades", async () => {
    fetchClosedTrades.mockResolvedValue([]);
    render(<TradesPanel />);
    expect(await screen.findByText("No closed trades")).toBeTruthy();
  });

  it("filters by status and shows why a row waits", async () => {
    fetchClosedTrades.mockResolvedValue([REAL_SHORT, waiting("w1", 3, "abi_unavailable")]);
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    expect(tile("Trades").textContent).toContain("1 waiting for ABI");
    fireEvent.click(screen.getByRole("button", { name: "Waiting for ABI" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Waiting for ABI · 3 attempts · abi_unavailable");
    expect(rows[0].textContent).not.toContain("1,307");
    expect(tile("Trades").textContent).toContain("0");
  });

  it("keeps the filters on Refresh and reads both sources again", async () => {
    fetchClosedTrades.mockResolvedValue([REAL_SHORT, trade("win", 200, { strategy_instance_id: "ema_pullback:other000", symbol: "ETHUSDT" })]);
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    fireEvent.change(screen.getByLabelText("Coin"), { target: { value: "ETHUSDT" } });
    expect(tile("Net PnL, USDT").textContent).toContain("+200.00");
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(fetchClosedTrades).toHaveBeenCalledTimes(2));
    expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(tile("Net PnL, USDT").textContent).toContain("+200.00"));
    expect((screen.getByLabelText("Coin") as HTMLSelectElement).value).toBe("ETHUSDT");
  });

  it("opens the card of a trade and returns to the list", async () => {
    render(<TradesPanel />);
    await screen.findByLabelText("Summary");
    fireEvent.click(screen.getByRole("button", { name: "2026-10-25 15:00" }));
    const card = screen.getByLabelText("Plan and fact");
    const [, entry, exit] = within(card).getAllByRole("row");
    expect(entry.textContent).toContain("80,484.0");
    expect(entry.textContent).toContain("80,496.1");
    expect(entry.textContent).toContain("−0.015%");
    expect(exit.textContent).toContain("80,744.7");
    expect(exit.textContent).toContain("80,750.0");
    expect(exit.textContent).toContain("+0.007%");
    const result = screen.getByLabelText("Result");
    expect(result.textContent).toContain("−1,307.99");
    expect(result.textContent).toContain("−1.378");
    expect(result.textContent).toContain("169.03");
    expect(result.textContent).toContain("169.57");
    expect(screen.getByLabelText("Size and fills").textContent).toContain("3.818 BTC");
    expect(screen.getByText(/ema_pullback:6072511fa9c4 · cycle 6072511f-cycle/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "← All trades" }));
    expect(screen.getByLabelText("Summary")).toBeTruthy();
  });
});
