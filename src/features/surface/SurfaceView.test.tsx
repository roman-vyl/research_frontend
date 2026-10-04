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
import { setSessionPersistenceForTests } from "@/shared/session/storage";

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
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    const calls = fetchExperimentResults.mock.calls.map((c) => c[0]);
    expect(calls[0]).toMatchObject({ filters: {}, columns: ["sl"] });
    expect(calls.some((c) => c.filters.sl === 5 && c.columns === undefined)).toBe(true);
    expect(calls.every((c) => c.columns !== undefined || Object.keys(c.filters).length > 0)).toBe(true);
  });

  it("a point without a run shows metrics and no Open run action; selecting does not touch the run", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    const cells = await screen.findAllByRole("cell");
    const last = cells.filter((c) => c.querySelector(".sx-cell:not(.sx-empty)") !== null).pop()!;
    fireEvent.click(last.querySelector(".sx-cell")!);
    expect(await screen.findByText(/Engine run not available/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open run" })).toBeNull();
    expect(setSelectedRunId).not.toHaveBeenCalled();
  });

  it("marks points that have an Engine run with a dot class", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findAllByRole("cell");
    const marked = document.querySelectorAll(".sx-cell.sx-run").length;
    const all = document.querySelectorAll(".sx-cell:not(.sx-empty)").length;
    expect(marked).toBeGreaterThan(0);
    expect(marked).toBeLessThan(all);
  });

  it("Open run calls the existing run selection once and opens Chart", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    const cells = await screen.findAllByRole("cell");
    const first = cells.filter((c) => c.querySelector(".sx-cell:not(.sx-empty)") !== null)[0];
    fireEvent.click(first.querySelector(".sx-cell")!);
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
    await waitFor(() => expect(screen.getByText(/cells pass \(/)).toBeTruthy());
    const off = document.querySelectorAll(".sx-off").length;
    expect(off).toBeGreaterThan(0);
  });

  it("shows unit readouts for multi-grid dimensions and baseline modes only with arms", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    expect(screen.getAllByText(/= 30 ATR at SL 5/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Δ vs CONTROL · TP 5R" })).toBeTruthy();
    cleanup();
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: /^Δ vs/ })).toBeNull();
  });

  it("comparison arm and metric are chosen with segmented buttons; there is no geometry map", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    expect(screen.queryByRole("table", { name: "Geometry map" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "PF" }));
    expect(screen.getByRole("button", { name: "PF" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Δ vs CONTROL · TP 5R" }));
    expect(screen.getByRole("button", { name: "Δ vs CONTROL · TP 5R" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the open experiment, sliders, metric and selected point across a page reload", async () => {
    setSessionPersistenceForTests(true);
    try {
      localStorage.clear();
      const first = render(<SurfaceView />);
      await openExperiment(/trailing geometry/);
      await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
      fireEvent.click(screen.getByRole("button", { name: "PF" }));
      const slider = screen.getByRole("slider", { name: "Trigger T" }) as HTMLInputElement;
      fireEvent.change(slider, { target: { value: "1" } }); // second trigger option
      const trigger = slider.nextElementSibling!.textContent;
      const cell = document.querySelector(".sx-cell:not(.sx-empty)")!;
      fireEvent.click(cell);
      await screen.findByLabelText("Point details");
      first.unmount(); // "reload": a fresh component reads what the previous one stored
      render(<SurfaceView />);
      await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
      expect(screen.getByRole("button", { name: "PF" }).getAttribute("aria-pressed")).toBe("true");
      expect((screen.getByRole("slider", { name: "Trigger T" }) as HTMLInputElement).nextElementSibling!.textContent).toBe(trigger);
      expect(await screen.findByLabelText("Point details")).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Experiments" })).toBeNull();
    } finally {
      localStorage.clear();
      setSessionPersistenceForTests(false);
    }
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
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    expect(fetchExperimentManifest).toHaveBeenLastCalledWith("btcusdt_p.ema500.trailing_geometry_4d");
  });

  it("an API error is shown, not thrown", async () => {
    fetchExperimentManifest.mockRejectedValueOnce(new Error("experiment not found: x"));
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    expect((await screen.findByRole("alert")).textContent).toContain("experiment not found");
  });
});
