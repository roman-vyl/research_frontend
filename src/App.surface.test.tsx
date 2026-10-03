/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "@/App";
import { ApiError } from "@/api/client";
import { WorkbenchProvider } from "@/shared/context/WorkbenchContext";
import { SelectRunOnMount } from "@/test/selectRun";

const fetchRunDetail = vi.fn();
const fetchRunSummaries = vi.fn();

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  const { REGISTRY, RATIO_MANIFEST, RATIO_RESULTS } = await import("@/features/surface/fixtures/experiments");
  return {
    ...actual,
    fetchRunDetail: (...a: unknown[]) => fetchRunDetail(...a),
    fetchRunTrades: vi.fn().mockResolvedValue({ contract_version: "1.0.0", run_id: "r", trades: [] }),
    fetchRunMetrics: vi.fn().mockResolvedValue(null),
    fetchManagedPolicyEvents: vi.fn().mockResolvedValue({ contract_version: "1.0.0", run_id: "r", events: [] }),
    fetchRunSummaries: (...a: unknown[]) => fetchRunSummaries(...a),
    fetchConfigState: vi.fn().mockResolvedValue({ strategy_id: "ema_pullback", selected_experiment_id: null, configs: [], selected_path: null, draft: null }),
    fetchExperiments: vi.fn().mockResolvedValue(REGISTRY),
    fetchExperimentManifest: vi.fn().mockResolvedValue(RATIO_MANIFEST),
    fetchExperimentResults: vi.fn(async (p: { columns?: string[] }) =>
      p.columns
        ? { columns: p.columns, rows: RATIO_RESULTS.rows, data: p.columns.map((c) => RATIO_RESULTS.data[RATIO_RESULTS.columns.indexOf(c)]) }
        : RATIO_RESULTS),
  };
});

describe("Workbench with the Surface tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRunDetail.mockRejectedValue(new ApiError(500, "boom"));
  });
  afterEach(cleanup);

  it("lists tabs in the agreed order", () => {
    render(<WorkbenchProvider><App /></WorkbenchProvider>);
    const names = screen.getAllByRole("button").map((b) => b.textContent);
    const tabs = names.filter((n) => ["Chart", "Surface", "Reports", "Strategy Composer"].includes(n ?? ""));
    expect(tabs).toEqual(["Chart", "Surface", "Reports", "Strategy Composer"]);
  });

  it("opens on the Surface tab, not Chart", async () => {
    render(<WorkbenchProvider><App /></WorkbenchProvider>);
    expect(within(await screen.findByRole("group", { name: "Experiments" })).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Surface" })).toBeTruthy();
  });

  it("starts with no run: no run list call, no run load, idle message in Chart and Reports", () => {
    render(<WorkbenchProvider><App /></WorkbenchProvider>);
    expect(fetchRunSummaries).not.toHaveBeenCalled();
    expect(fetchRunDetail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    expect(screen.getByText("Open a run from the Surface tab.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByText("Open a run from the Surface tab.")).toBeTruthy();
  });

  it("Surface works while no run is selected", async () => {
    render(<WorkbenchProvider><App /></WorkbenchProvider>);
    expect(await screen.findByText(/EMA500 · fixed SL × TP ratio/)).toBeTruthy();
  });

  it("keeps the Surface state when switching tabs", async () => {
    render(<WorkbenchProvider><App /></WorkbenchProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /fixed SL/ }));
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Surface" }));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Experiments" })).toBeNull();
  });

  it("Retry after a failed load requests the same run again and keeps it selected", async () => {
    render(
      <WorkbenchProvider>
        <SelectRunOnMount runId="run-surface" />
        <App />
      </WorkbenchProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Chart" }));
    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(fetchRunDetail).toHaveBeenCalledTimes(2));
    expect(fetchRunDetail.mock.calls.map((c) => c[0])).toEqual(["run-surface", "run-surface"]);
    expect(fetchRunSummaries).not.toHaveBeenCalled();
  });
});
