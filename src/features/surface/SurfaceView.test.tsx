import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
const fetchExperimentStorage = vi.fn();
const planRunDeletion = vi.fn();
const deleteRuns = vi.fn();
const planCalculation = vi.fn();
const calculateRows = vi.fn();
const getCalculation = vi.fn();
const cancelCalculation = vi.fn();
const listCandidates = vi.fn().mockResolvedValue({ candidates: [] });

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ApiError: actual.ApiError,
    fetchExperiments: (...a: unknown[]) => fetchExperiments(...a),
    fetchExperimentManifest: (...a: unknown[]) => fetchExperimentManifest(...a),
    fetchExperimentResults: (...a: unknown[]) => fetchExperimentResults(...a),
    fetchExperimentStorage: (...a: unknown[]) => fetchExperimentStorage(...a),
    planRunDeletion: (...a: unknown[]) => planRunDeletion(...a),
    deleteRuns: (...a: unknown[]) => deleteRuns(...a),
    planCalculation: (...a: unknown[]) => planCalculation(...a),
    calculateRows: (...a: unknown[]) => calculateRows(...a),
    getCalculation: (...a: unknown[]) => getCalculation(...a),
    cancelCalculation: (...a: unknown[]) => cancelCalculation(...a),
    listCandidates: (...a: unknown[]) => listCandidates(...a),
  };
});
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
  fetchExperimentStorage.mockImplementation(async (id: string) => ({
    experiment_id: id,
    rows: 6,
    engine_runs: 4,
    distinct_run_ids: 4,
    size: null,
  }));
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

  it("a top-percent filter greys out all but the best share of the cells", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findAllByRole("cell");
    const total = document.querySelectorAll(".sx-cell:not(.sx-empty)").length;
    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("operator"), { target: { value: "top" } });
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "50" } });
    await waitFor(() => expect(screen.getByText(/cells pass \(/)).toBeTruthy());
    const off = document.querySelectorAll(".sx-off").length;
    expect(off).toBeGreaterThan(0);
    expect(off).toBeLessThan(total);
    expect(total - off).toBe(Math.ceil(total / 2));
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
      const triggers = screen.getByRole("group", { name: "Trigger T" });
      const second = triggers.querySelectorAll("button")[1]; // second trigger option
      fireEvent.click(second);
      const trigger = second.textContent;
      const cell = document.querySelector(".sx-cell:not(.sx-empty)")!;
      fireEvent.click(cell);
      await screen.findByLabelText("Point details");
      first.unmount(); // "reload": a fresh component reads what the previous one stored
      render(<SurfaceView />);
      await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
      expect(screen.getByRole("button", { name: "PF" }).getAttribute("aria-pressed")).toBe("true");
      const pressed = screen.getByRole("group", { name: "Trigger T" }).querySelector('button[aria-pressed="true"]');
      expect(pressed!.textContent).toBe(trigger);
      expect(await screen.findByLabelText("Point details")).toBeTruthy();
      expect(screen.queryByRole("group", { name: "Experiments" })).toBeNull();
    } finally {
      localStorage.clear();
      setSessionPersistenceForTests(false);
    }
  });

  it("Breakeven is an optional axis: a checkbox shows its value buttons and the Engine-run rows", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    expect(screen.queryByRole("group", { name: "Breakeven" })).toBeNull();
    const box = () => screen.getByRole("checkbox", { name: /Breakeven/ }) as HTMLInputElement;
    expect(box().disabled).toBe(true); // the default geometry has no breakeven rows
    expect(screen.getByText(/none for this geometry/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Go to/ })); // jumps to the geometry that has them
    await waitFor(() => expect(box().disabled).toBe(false));
    fireEvent.click(box());
    expect(await screen.findByRole("group", { name: "Breakeven" })).toBeTruthy();
    expect(screen.getAllByText(/6R/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll(".sx-cell.sx-run").length).toBeGreaterThan(0);
    fireEvent.click(box());
    await waitFor(() => expect(screen.queryByRole("group", { name: "Breakeven" })).toBeNull());
  });

  it("Breakeven values from the manifest: cells without a row show — and are calculated from their coordinates", async () => {
    const schema = TRAILING_MANIFEST.result_schema;
    const withValues = {
      ...TRAILING_MANIFEST,
      materialize: { strategy_template: {} },
      result_schema: {
        ...schema,
        dimensions: schema.dimensions.map((d) => (d.id === "be_trigger" ? { ...d, values: [2, 3] } : d)),
      },
    };
    fetchExperimentManifest.mockImplementation(async () => withValues);
    planCalculation.mockResolvedValue(CALC_PLAN);
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    const box = screen.getByRole("checkbox", { name: /Breakeven/ }) as HTMLInputElement;
    expect(box.disabled).toBe(false); // the declared values make it available on any geometry
    fireEvent.click(box);
    const group = await screen.findByRole("group", { name: "Breakeven" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["2R", "3R"]); // this geometry has no breakeven rows, only the declared values
    // no row has breakeven 2R here: every cell of the geometry is "—"
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-nodata")).toHaveLength(4));
    fireEvent.click(screen.getByRole("button", { name: "Select empty" }));
    expect(screen.getByText(/4 cells selected · 0 runs · 4 cells without run/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Calculate (4)" }));
    await screen.findByRole("dialog", { name: "Calculate runs" });
    const sent = planCalculation.mock.calls[0][1] as Record<string, unknown>[];
    expect(sent).toHaveLength(4);
    expect(sent[0]).toEqual({ width: 3, lookback: 20, sl: 5, trigger: 6, distance: 0.5, be_trigger: 2, grid: "R", arm: "trailing_no_tp" });
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

const RUN = (c: string): string => `run_${c.repeat(32)}`;
const PLAN = { run_count: 2, file_count: 14, bytes: 2_500_000_000, already_absent: 0, skipped: [], plan_token: "sha256:t" };

function liveCells(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".sx-cell:not(.sx-empty)")];
}

describe("SurfaceView: run deletion", () => {
  let fetchSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };
  beforeEach(() => {
    vi.clearAllMocks();
    wireApi();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
  });

  it("Ctrl/Cmd+click toggles cells; a plain click still only inspects", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const [a, b] = liveCells();
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(b, { metaKey: true });
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(2);
    expect(screen.getByText(/2 cells selected · 2 runs · 0 cells without run/)).toBeTruthy();
    fireEvent.click(a, { ctrlKey: true });
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(1);
    expect(screen.queryByLabelText("Point details")).toBeNull();
    fireEvent.click(a);
    expect(await screen.findByLabelText("Point details")).toBeTruthy();
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(1);
  });

  it("Shift+drag selects a rectangle", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const cells = liveCells(); // 2 widths × 3 lookbacks
    fireEvent.mouseDown(cells[0], { shiftKey: true });
    fireEvent.mouseEnter(cells[4]);
    fireEvent.mouseUp(window);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(4));
  });

  it("select mode: a plain click toggles a cell, a plain drag adds a rectangle, Esc leaves", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Select cells" }));
    const cells = liveCells(); // 2 widths × 3 lookbacks
    const click = (el: Element) => {
      fireEvent.mouseDown(el, { button: 0 });
      fireEvent.mouseUp(window);
      fireEvent.click(el);
    };
    click(cells[0]);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(1));
    click(cells[0]);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(0));
    expect(screen.queryByLabelText("Point details")).toBeNull();
    fireEvent.mouseDown(cells[0], { button: 0 });
    fireEvent.mouseEnter(cells[4]);
    fireEvent.mouseUp(window);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(4));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(await screen.findByRole("button", { name: "Select cells" })).toBeTruthy();
    fireEvent.click(cells[0]);
    expect(await screen.findByLabelText("Point details")).toBeTruthy();
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(4);
  });

  it("only replay cells selected: Delete runs is disabled", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const cells = liveCells();
    fireEvent.click(cells[4], { ctrlKey: true });
    fireEvent.click(cells[5], { ctrlKey: true });
    expect(screen.getByText(/2 cells selected · 0 runs · 2 cells without run/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Delete runs (0)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Select not passing picks exactly the greyed cells", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "1.3" } });
    await waitFor(() => expect(document.querySelectorAll(".sx-off").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: "Select not passing" }));
    const off = [...document.querySelectorAll(".sx-cell.sx-off")];
    const picked = [...document.querySelectorAll(".sx-cell.sx-pick")];
    expect(picked).toEqual(off);
  });

  it("changing a control clears the selection", async () => {
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(liveCells()[0], { ctrlKey: true });
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(1);
    fireEvent.click(screen.getByRole("group", { name: "Trigger T" }).querySelectorAll("button")[1]);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(0));
    expect(screen.getByText(/0 cells selected/)).toBeTruthy();
  });

  it("plan, typed count, delete, reload: values kept, Open run gone, no run list request", async () => {
    planRunDeletion.mockResolvedValue(PLAN);
    deleteRuns.mockResolvedValue({
      deleted: 2, already_absent: 0, cleared_rows: 2, file_count: 14, bytes: 2_500_000_000, skipped: [],
      backup: "runs.pre_delete_20261006T073000Z.csv",
    });
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const [a, b] = liveCells();
    const values = liveCells().map((c) => c.textContent);
    fireEvent.click(a); // the point shown in details
    expect(await screen.findByRole("button", { name: "Open run" })).toBeTruthy();
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(b, { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete runs (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete runs" });
    expect(planRunDeletion).toHaveBeenCalledWith("btcusdt_p.ema500.ratio_4d", [RUN("1"), RUN("2")]);
    expect(await within(dialog).findByText("2.50 GB")).toBeTruthy();
    const confirm = () => within(dialog).getByRole("button", { name: "Delete 2 runs" }) as HTMLButtonElement;
    fireEvent.change(within(dialog).getByLabelText("Run count"), { target: { value: "1" } });
    expect(confirm().disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Run count"), { target: { value: "2" } });
    expect(confirm().disabled).toBe(false);

    // after the delete the table has no run_id for the deleted runs
    const before = fetchExperimentResults.mock.calls.length;
    fetchExperimentResults.mockImplementation(async (p: { columns?: string[] }) => {
      const data = RATIO_RESULTS.data.map((col, i) =>
        RATIO_RESULTS.columns[i] === "run_id" ? col.map((v) => (v === RUN("1") || v === RUN("2") ? null : v)) : col);
      const full = { ...RATIO_RESULTS, data };
      return p.columns ? { columns: p.columns, rows: full.rows, data: p.columns.map((c) => full.data[full.columns.indexOf(c)]) } : full;
    });
    fireEvent.click(confirm());
    expect(await within(dialog).findByText("runs.pre_delete_20261006T073000Z.csv")).toBeTruthy();
    expect(deleteRuns).toHaveBeenCalledWith("btcusdt_p.ema500.ratio_4d", [RUN("1"), RUN("2")], "sha256:t");
    await waitFor(() => expect(fetchExperimentResults.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByText(/No full run/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Open run" })).toBeNull();
    expect(liveCells().map((c) => c.textContent)).toEqual(values);
    expect(screen.getByText(/0 cells selected/)).toBeTruthy();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/research/runs"))).toBe(false);
  });

  it("a stale plan reports nothing deleted and offers a new plan", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
    planRunDeletion.mockResolvedValue(PLAN);
    deleteRuns.mockRejectedValue(new ApiError(409, "plan is stale"));
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const [a, b] = liveCells();
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(b, { ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "Delete runs (2)" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(await within(dialog).findByLabelText("Run count"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete 2 runs" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/changed since the plan. Nothing was deleted/);
    fireEvent.click(within(dialog).getByRole("button", { name: "New plan" }));
    await waitFor(() => expect(planRunDeletion).toHaveBeenCalledTimes(2));
  });
});

const ID = "btcusdt_p.ema500.ratio_4d";
const coordsOf = (width: number, lookback: number) => ({ width, lookback, sl: 5, tp_ratio: 5 });
const CALC_PLAN = {
  rows: [
    { position: 0, coords: coordsOf(3, 20), status: "skipped", reason: "has_run" },
    { position: 1, coords: coordsOf(4, 40), status: "calculable", config_hash: "sha256:c" },
  ],
  calculable_count: 1,
  plan_token: "sha256:p",
};
const job = (state: string, outcome: string, extra: Record<string, unknown> = {}) => ({
  job_id: "calc_1",
  experiment_id: ID,
  state,
  counts: { [outcome]: 1 },
  rows: [{ position: 1, coords: coordsOf(4, 40), row_index: 5, config_hash: "sha256:c", outcome, ...extra }],
});

describe("SurfaceView: run calculation", () => {
  let fetchSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };
  beforeEach(() => {
    vi.clearAllMocks();
    wireApi();
    fetchExperimentManifest.mockImplementation(async (id: string) =>
      id.includes("trailing") ? TRAILING_MANIFEST : { ...RATIO_MANIFEST, materialize: { strategy_template: {} } });
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    cleanup();
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  async function selectTwo(): Promise<void> {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    const cells = liveCells(); // width 3: lb 20 (run 1) ... width 4: lb 40 (no run)
    fireEvent.click(cells[0], { ctrlKey: true });
    fireEvent.click(cells[5], { ctrlKey: true });
    await screen.findByText(/2 cells selected/);
  }

  it("without materialize the action is disabled with the hint", async () => {
    fetchExperimentManifest.mockImplementation(async () => RATIO_MANIFEST);
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table");
    fireEvent.click(liveCells()[5], { ctrlKey: true });
    expect((screen.getByRole("button", { name: "Calculate (1)" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("This Surface cannot be calculated: no materialize in the manifest")).toBeTruthy();
  });

  it("rows with a run are sent; the plan decides; publish reloads the slice; no run list request", async () => {
    planCalculation.mockResolvedValue(CALC_PLAN);
    calculateRows.mockResolvedValue({ job_id: "calc_1", row_count: 1 });
    getCalculation
      .mockResolvedValueOnce(job("running", "pending"))
      .mockResolvedValueOnce(job("completed", "published", { run_id: RUN("n") }));
    await selectTwo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    expect(planCalculation).toHaveBeenCalledWith(ID, [coordsOf(3, 20), coordsOf(4, 40)]);
    const plan = await within(dialog).findByLabelText("Plan");
    expect(plan.textContent).toBe("Selected2Calculable1Has run1Other skipped0");
    fireEvent.click(within(dialog).getByRole("button", { name: "Calculate 1 rows" }));
    await waitFor(() => expect(calculateRows).toHaveBeenCalledWith(ID, [coordsOf(3, 20), coordsOf(4, 40)], "sha256:p"));
    expect(await within(dialog).findByText(/Closing this window does not cancel the job/)).toBeTruthy();
    const before = fetchExperimentResults.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(2000); });
    await waitFor(() => expect(getCalculation).toHaveBeenCalledTimes(1));
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(await within(dialog).findByText("Job completed.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Outcome").textContent).toContain("Published1");
    await waitFor(() => expect(fetchExperimentResults.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByText(/0 cells selected/)).toBeTruthy();
    expect(fetchSpy.mock.calls.some((c) => String(c[0]).includes("/api/research/runs"))).toBe(false);
  });

  it("parity failure lists the differing metrics and does not reload", async () => {
    planCalculation.mockResolvedValue(CALC_PLAN);
    calculateRows.mockResolvedValue({ job_id: "calc_1", row_count: 1 });
    getCalculation.mockResolvedValueOnce(
      job("completed", "parity_failed", { parity: [{ column: "return_pct", expected: "0.12", actual: "0.13" }] }),
    );
    await selectTwo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Calculate 1 rows" }));
    await waitFor(() => expect(calculateRows).toHaveBeenCalled());
    const before = fetchExperimentResults.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(2000); });
    const failed = await within(dialog).findByLabelText("Failed rows");
    expect(failed.textContent).toContain("return_pct stored 0.12, Engine 0.13");
    expect(fetchExperimentResults.mock.calls.length).toBe(before);
  });

  it("cancel calls the cancel route and the final counts show cancelled rows", async () => {
    planCalculation.mockResolvedValue(CALC_PLAN);
    calculateRows.mockResolvedValue({ job_id: "calc_1", row_count: 1 });
    cancelCalculation.mockResolvedValue(job("running", "pending"));
    getCalculation.mockResolvedValueOnce(job("cancelled", "cancelled"));
    await selectTwo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Calculate 1 rows" }));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Cancel job" }));
    expect(cancelCalculation).toHaveBeenCalledWith(ID, "calc_1");
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(await within(dialog).findByText("Job cancelled.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Outcome").textContent).toContain("Cancelled1");
  });

  it("a stale plan starts no job and offers a new plan; a running job is followed", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
    planCalculation.mockResolvedValue(CALC_PLAN);
    calculateRows.mockRejectedValueOnce(new ApiError(409, "plan again", "plan_stale"));
    await selectTwo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    fireEvent.click(await within(dialog).findByRole("button", { name: "Calculate 1 rows" }));
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/Nothing was calculated/);
    fireEvent.click(within(dialog).getByRole("button", { name: "New plan" }));
    await waitFor(() => expect(planCalculation).toHaveBeenCalledTimes(2));

    calculateRows.mockRejectedValueOnce(
      new ApiError(409, "another calculation job is running", "job_running", { job_id: "calc_other" }),
    );
    getCalculation.mockResolvedValueOnce(job("running", "pending"));
    fireEvent.click(await within(dialog).findByRole("button", { name: "Calculate 1 rows" }));
    expect((await within(dialog).findByRole("status")).textContent).toBe("A calculation is already running, please wait.");
    await waitFor(() => expect(getCalculation).toHaveBeenCalledWith(ID, "calc_other"));
    expect(within(dialog).getByRole("button", { name: "Cancel job" })).toBeTruthy();
  });

  it("reopened during a job: the plan 409 attaches to the running job, then offers a new plan", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
    planCalculation.mockRejectedValue(
      new ApiError(409, "another calculation job is running", "job_running", { job_id: "calc_1" }),
    );
    getCalculation
      .mockResolvedValueOnce(job("running", "pending"))
      .mockResolvedValueOnce(job("completed", "published", { run_id: RUN("n") }));
    await selectTwo();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    expect((await within(dialog).findByRole("status")).textContent).toBe("A calculation is already running, please wait.");
    await waitFor(() => expect(within(dialog).getByLabelText("Outcome").textContent).toContain("Pending1"));
    expect(calculateRows).not.toHaveBeenCalled();
    const before = fetchExperimentResults.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(await within(dialog).findByText("Job completed.")).toBeTruthy();
    await waitFor(() => expect(fetchExperimentResults.mock.calls.length).toBeGreaterThan(before));
    expect(within(dialog).getByRole("button", { name: "New plan" })).toBeTruthy();
  });

  it("a running job of another Experiment is reported with a new plan offer", async () => {
    const { ApiError } = await vi.importActual<typeof import("@/api/client")>("@/api/client");
    planCalculation.mockRejectedValue(
      new ApiError(409, "another calculation job is running", "job_running", { job_id: "calc_x" }),
    );
    getCalculation.mockRejectedValue(new ApiError(404, "not found", "calculation_job_not_found"));
    await selectTwo();
    fireEvent.click(await screen.findByRole("button", { name: "Calculate (2)" }));
    const dialog = await screen.findByRole("dialog", { name: "Calculate runs" });
    expect((await within(dialog).findByRole("alert")).textContent).toMatch(/another Experiment is running/);
    expect(within(dialog).getByRole("button", { name: "New plan" })).toBeTruthy();
  });
});

describe("SurfaceView: storage block", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireApi();
  });
  afterEach(cleanup);

  it("the picker asks only for cached sizes; opening computes; the card then shows GB", async () => {
    fetchExperimentStorage.mockImplementation(async (id: string, size: string) => ({
      experiment_id: id,
      rows: id.includes("trailing") ? 443700 : 6,
      engine_runs: id.includes("trailing") ? 0 : 4,
      distinct_run_ids: id.includes("trailing") ? 0 : 4,
      size: size === "compute" ? { bytes: 12_340_000_000, run_bytes: 12_300_000_000, experiment_folder_bytes: 40_000_000, missing_runs: 1, computed_at: "2026-10-06T07:30:00Z" } : null,
    }));
    render(<SurfaceView />);
    const group = await screen.findByRole("group", { name: "Experiments" });
    await waitFor(() => expect(within(group).getAllByText("size not computed yet")).toHaveLength(2));
    expect(within(group).getByText("443,700 strategies")).toBeTruthy();
    expect(within(group).getByText("0 Engine runs")).toBeTruthy();
    expect(fetchExperimentStorage.mock.calls.map((c) => c[1])).toEqual(["cached", "cached"]);

    await openExperiment(/fixed SL/);
    expect(await screen.findByText("12.34 GB")).toBeTruthy();
    expect(screen.getByText("1 runs missing on disk")).toBeTruthy();
    expect(fetchExperimentStorage).toHaveBeenLastCalledWith("btcusdt_p.ema500.ratio_4d", "compute");

    fireEvent.click(screen.getByRole("button", { name: /All experiments/ }));
    const again = await screen.findByRole("group", { name: "Experiments" });
    expect(within(again).getByText("12.34 GB")).toBeTruthy();
    expect(fetchExperimentStorage).toHaveBeenCalledTimes(3); // no second picker request
  });

  it("a failed storage request shows a dash and the card still opens", async () => {
    fetchExperimentStorage.mockRejectedValue(new Error("boom"));
    render(<SurfaceView />);
    const group = await screen.findByRole("group", { name: "Experiments" });
    await waitFor(() => expect(within(group).getAllByText("—")).toHaveLength(2));
    await openExperiment(/fixed SL/);
    expect(await screen.findByRole("table")).toBeTruthy();
  });
});

describe("SurfaceView: filter scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireApi();
  });
  afterEach(cleanup);

  const fullCalls = () =>
    fetchExperimentResults.mock.calls
      .map((c) => c[0] as { filters: Record<string, unknown>; columns?: string[] })
      .filter((c) => Object.keys(c.filters).length === 0 && (c.columns?.length ?? 0) > 1);

  it("shows the switch from the manifest, keeps the displayed grid by default and requests nothing before switching", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    const group = screen.getByRole("group", { name: "Filter scope" });
    expect(within(group).getByRole("button", { name: "Displayed grid" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "All settings (Initial SL × TP / SL)" })).toBeTruthy();
    expect(fullCalls()).toHaveLength(0);
  });

  it("All settings loads one snapshot with only the needed columns; a new metric re-requests the whole set", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(screen.getByRole("button", { name: /^All settings/ }));
    await screen.findByRole("table", { name: /^All settings:/ });
    expect(fullCalls()).toHaveLength(1);
    const first = fullCalls()[0].columns!;
    expect(first).toEqual(["lookback", "realised_trade_count", "return_pct", "run_id", "sl", "tp_ratio", "width"]);
    expect(screen.getByText(/6 of 6 settings match · 6 of 6 cells have a match/)).toBeTruthy();

    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("metric"), { target: { value: "profit_factor" } });
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "1.3" } });
    await waitFor(() => expect(fullCalls()).toHaveLength(2));
    // the whole needed set again, never one extra column joined by row index
    expect(fullCalls()[1].columns).toEqual([...first, "profit_factor"].sort());
    expect(await screen.findByText(/4 of 6 settings match · 4 of 6 cells have a match/)).toBeTruthy();
  });

  it("filters pick cells for Delete runs and Calculate across all settings; equity curves of the matches are shown", async () => {
    planRunDeletion.mockResolvedValue(PLAN);
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(screen.getByRole("button", { name: /^All settings/ }));
    await screen.findByRole("table", { name: /^All settings:/ });
    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("metric"), { target: { value: "profit_factor" } });
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "1.3" } });
    expect(await screen.findByText(/4 of 6 settings match · 4 of 6 cells/)).toBeTruthy();
    // settings 3..6 match; 3 and 4 have runs
    expect(await screen.findByText(/Equity curves · \d+ of 2 runs drawn · 4 of 6 settings match/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select matching" }));
    expect(screen.getByText(/4 cells selected · 4 matching settings of all settings/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calculate (4)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Select not matching" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete runs (2)" }));
    await screen.findByRole("dialog", { name: "Delete runs" });
    expect(planRunDeletion).toHaveBeenCalledWith("btcusdt_p.ema500.ratio_4d", [RUN("1"), RUN("2")]);
  });

  it("select mode on the All settings map toggles cells instead of opening them", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(screen.getByRole("button", { name: /^All settings/ }));
    const table = await screen.findByRole("table", { name: /^All settings:/ });
    fireEvent.click(screen.getByRole("button", { name: "Select cells" }));
    fireEvent.click(within(table).getAllByRole("button")[0]);
    expect(screen.getByRole("button", { name: /^All settings/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll(".sx-cell.sx-pick")).toHaveLength(1);
    expect(screen.getByText(/1 cells selected · 1 matching settings of all settings · 1 runs/)).toBeTruthy();
  });

  it("a cell opens its best setting on the displayed grid", async () => {
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(screen.getByRole("button", { name: /^All settings/ }));
    const table = await screen.findByRole("table", { name: /^All settings:/ });
    fireEvent.click(within(table).getAllByRole("button")[0]);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    expect(screen.getByRole("button", { name: "Displayed grid" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-sel")).toHaveLength(1));
  });
});
