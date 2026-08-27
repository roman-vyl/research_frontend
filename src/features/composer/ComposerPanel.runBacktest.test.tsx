/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RunBacktestRequest } from "@/api/types";
import { WorkbenchProvider } from "@/shared/context/WorkbenchContext";

import { ComposerPanel } from "./ComposerPanel";
import { COMPOSER_DEFAULT_STRATEGY_ID, createBlankConfigDraft } from "./composerDraft";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Proves the exact `POST /api/research/backtests` payload the Run Backtest
// button sends for the selected Composer instance -- the canonical
// {strategy, range_policy, execution, accounting} wire shape, with nothing
// extra (no whole-draft, no legacy fields) and nothing invented.
vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ...actual,
    fetchConfigState: vi.fn(async () => ({
      configs: [],
      selected_path: null,
      draft: createBlankConfigDraft(COMPOSER_DEFAULT_STRATEGY_ID),
    })),
    fetchComponentCatalog: vi.fn(async () => {
      throw new Error("no catalog in this test");
    }),
    fetchRunSummaries: vi.fn(async () => []),
    validateConfigDraft: vi.fn(async () => ({ ok: true, errors: [] })),
    runBacktest: vi.fn(async () => ({
      contract_version: "research_backtest_api.v1",
      run_id: "run-behavioral-1",
      status: "completed",
      instance_id: "ema_pullback:test",
      realised_trade_count: 0,
      open_position_count: 0,
    })),
  };
});

describe("ComposerPanel Run Backtest wire", () => {
  it("sends only the selected canonical instance, range_policy full_available, and mapped execution/accounting", async () => {
    const { runBacktest } = await import("@/api/client");
    const runBacktestMock = vi.mocked(runBacktest);

    render(
      <WorkbenchProvider initialActiveTab="composer">
        <ComposerPanel />
      </WorkbenchProvider>,
    );

    const validateButton = await screen.findByRole("button", { name: /^Validate$/ });
    fireEvent.click(validateButton);

    const backtestButton = await screen.findByRole("button", { name: /Run backtest/i });
    await waitFor(() => expect(backtestButton.hasAttribute("disabled")).toBe(false));

    fireEvent.click(backtestButton);

    await waitFor(() => expect(runBacktestMock).toHaveBeenCalledOnce());
    const sent = runBacktestMock.mock.calls[0]![0] as RunBacktestRequest;

    // Only the selected instance is sent, not the whole draft.
    expect(Object.keys(sent)).toEqual(
      expect.arrayContaining(["strategy", "range_policy", "execution", "accounting"]),
    );
    expect(sent).not.toHaveProperty("instances");
    expect(sent).not.toHaveProperty("experiment_id");
    expect(sent).not.toHaveProperty("config_version");

    // Canonical instance shape: enabled + identity + raw_spec, nothing else.
    expect(sent.strategy).toMatchObject({
      enabled: true,
      strategy_id: "ema_pullback",
      ticker: "BTCUSDT.P",
      base_timeframe: "5m",
    });
    expect(sent.strategy.raw_spec).toBeTypeOf("object");
    expect(sent.strategy).not.toHaveProperty("family");
    expect(sent.strategy).not.toHaveProperty("variant");
    expect(sent.strategy).not.toHaveProperty("instance_id");
    expect(sent.strategy).not.toHaveProperty("market");

    // No range picker yet -- always full_available.
    expect(sent.range_policy).toBe("full_available");

    // Blank ExecutionDraft (no slippage/init_cash/fees set) -> both undefined,
    // matching the current no-quantity-UI, no-range-picker product behavior.
    expect(sent.execution).toBeUndefined();
    expect(sent.accounting).toBeUndefined();
  });

  it("maps fees symmetrically into entry/exit_fee_rate, slippage into entry_slippage_rate, init_cash into initial_equity", async () => {
    const { runBacktest } = await import("@/api/client");
    const runBacktestMock = vi.mocked(runBacktest);

    render(
      <WorkbenchProvider initialActiveTab="composer">
        <ComposerPanel />
      </WorkbenchProvider>,
    );

    fireEvent.change(await screen.findByLabelText("init_cash"), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText("fees"), { target: { value: "0.001" } });
    fireEvent.change(screen.getByLabelText("slippage"), { target: { value: "0.0005" } });

    fireEvent.click(screen.getByRole("button", { name: /^Validate$/ }));

    const backtestButton = await screen.findByRole("button", { name: /Run backtest/i });
    await waitFor(() => expect(backtestButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(backtestButton);

    await waitFor(() => expect(runBacktestMock).toHaveBeenCalledOnce());
    const sent = runBacktestMock.mock.calls[0]![0] as RunBacktestRequest;

    expect(sent.execution).toEqual({ entry_slippage_rate: "0.0005" });
    expect(sent.accounting).toEqual({
      initial_equity: "10000",
      entry_fee_rate: "0.001",
      exit_fee_rate: "0.001",
    });
  });
});
