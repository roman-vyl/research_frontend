import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RATIO_MANIFEST,
  RATIO_RESULTS,
  REGISTRY,
  TRAILING_MANIFEST,
  TRAILING_RESULTS,
} from "@/features/surface/fixtures/experiments";

const setSelectedRunId = vi.fn();
const setActiveTab = vi.fn();
const fetchExperiments = vi.fn();
const fetchExperimentManifest = vi.fn();
const fetchExperimentResults = vi.fn();

vi.mock("@/api/client", () => ({
  fetchExperiments: (...a: unknown[]) => fetchExperiments(...a),
  fetchExperimentManifest: (...a: unknown[]) => fetchExperimentManifest(...a),
  fetchExperimentResults: (...a: unknown[]) => fetchExperimentResults(...a),
}));
vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbenchReport: () => ({ setSelectedRunId }),
  useWorkbenchShell: () => ({ setActiveTab }),
}));

import { SurfaceView } from "@/features/surface/SurfaceView";

function wireApi(): void {
  fetchExperiments.mockResolvedValue(REGISTRY);
  fetchExperimentManifest.mockImplementation(async (id: string) =>
    id.includes("trailing") ? TRAILING_MANIFEST : RATIO_MANIFEST);
  fetchExperimentResults.mockImplementation(async (p: { experimentId: string; filters: Record<string, unknown>; columns?: string[] }) => {
    const full = p.experimentId.includes("trailing") ? TRAILING_RESULTS : RATIO_RESULTS;
    if (p.columns) {
      return { columns: p.columns, rows: full.rows, data: p.columns.map((c) => full.data[full.columns.indexOf(c)]) };
    }
    return full;
  });
}

async function openExperiment(name: RegExp): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name }));
}

describe("SurfaceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireApi();
  });
  afterEach(cleanup);

  it("never requests the full table: probe by one column, then a slice filtered by SL", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table");
    const calls = fetchExperimentResults.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({ filters: {}, columns: ["sl"] });
    expect(calls.some((c) => c.filters.sl === 5 && c.columns === undefined)).toBe(true);
    expect(calls.every((c) => c.columns !== undefined || Object.keys(c.filters).length > 0)).toBe(true);
  });

  it("a point without a run shows metrics and no Open run action; selecting does not touch the run", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    const cells = await screen.findAllByRole("cell");
    const last = cells.filter((c) => c.className.includes("surface-grid__cell")).pop()!;
    fireEvent.click(last);
    expect(await screen.findByText(/Engine run not available/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open run" })).toBeNull();
    expect(setSelectedRunId).not.toHaveBeenCalled();
  });

  it("Open run calls the existing run selection once and opens Chart", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    const cells = await screen.findAllByRole("cell");
    const first = cells.filter((c) => c.className.includes("surface-grid__cell"))[0];
    fireEvent.click(first);
    expect(setSelectedRunId).not.toHaveBeenCalled(); // clicking a point only inspects it
    fireEvent.click(await screen.findByRole("button", { name: "Open run" }));
    expect(setSelectedRunId).toHaveBeenCalledTimes(1);
    expect(setSelectedRunId).toHaveBeenCalledWith("run_" + "1".repeat(32));
    expect(setActiveTab).toHaveBeenCalledWith("chart");
  });

  it("filters grey out points and the counter follows", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findAllByRole("cell");
    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "1.3" } });
    await waitFor(() => expect(screen.getByText(/points pass/)).toBeTruthy());
    const off = document.querySelectorAll(".surface-grid__cell--off").length;
    expect(off).toBeGreaterThan(0);
  });

  it("shows unit readouts for multi-grid dimensions and baseline modes only with arms", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table");
    expect(screen.getByText(/6R = 30 ATR at SL 5/)).toBeTruthy();
    expect(screen.getByText("Δ vs baseline")).toBeTruthy();
    cleanup();
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    expect(screen.queryByText("Δ vs baseline")).toBeNull();
  });

  it("starts with experiment cards (ticker, anchor, title) and selects nothing automatically", async () => {
    render(<SurfaceView />);
    const cards = within(await screen.findByRole("group", { name: "Experiments" })).getAllByRole("button");
    expect(cards).toHaveLength(REGISTRY.experiments.length);
    expect(cards[0].textContent).toContain("BTCUSDT.P");
    expect(cards[0].textContent).toContain("EMA500");
    expect(cards[0].textContent).toContain(REGISTRY.experiments[0].title);
    expect(fetchExperimentManifest).not.toHaveBeenCalled();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("a card loads the experiment and 'All experiments' returns to the cards", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    expect(fetchExperimentManifest).toHaveBeenCalledWith("btcusdt_p.ema500.ratio_4d");
    fireEvent.click(screen.getByRole("button", { name: /All experiments/ }));
    expect(within(await screen.findByRole("group", { name: "Experiments" })).getAllByRole("button")).toHaveLength(REGISTRY.experiments.length);
    expect(screen.queryByRole("table")).toBeNull();
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table");
    expect(fetchExperimentManifest).toHaveBeenLastCalledWith("btcusdt_p.ema500.trailing_geometry_4d");
  });

  it("an API error is shown, not thrown", async () => {
    fetchExperimentManifest.mockRejectedValueOnce(new Error("experiment not found: x"));
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    expect((await screen.findByRole("alert")).textContent).toContain("experiment not found");
  });
});
