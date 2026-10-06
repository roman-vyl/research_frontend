import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Candidate, CandidateCurrent } from "@/api/candidates";
import type { ExperimentResults } from "@/api/experiments";
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
const fetchRunSummaries = vi.fn();
const listCandidates = vi.fn();
const starCandidate = vi.fn();
const unstarCandidate = vi.fn();

vi.mock("@/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/api/client")>("@/api/client");
  return {
    ApiError: actual.ApiError,
    fetchExperiments: (...a: unknown[]) => fetchExperiments(...a),
    fetchExperimentManifest: (...a: unknown[]) => fetchExperimentManifest(...a),
    fetchExperimentResults: (...a: unknown[]) => fetchExperimentResults(...a),
    fetchExperimentStorage: (...a: unknown[]) => fetchExperimentStorage(...a),
    fetchRunSummaries: (...a: unknown[]) => fetchRunSummaries(...a),
    listCandidates: (...a: unknown[]) => listCandidates(...a),
    starCandidate: (...a: unknown[]) => starCandidate(...a),
    unstarCandidate: (...a: unknown[]) => unstarCandidate(...a),
  };
});
vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbenchReport: () => ({ setSelectedRunId }),
  useWorkbenchShell: () => ({ setActiveTab }),
}));

import { ApiError } from "@/api/client";
import { CandidatesPanel } from "@/features/candidates/CandidatesPanel";
import { subscribeFocus } from "@/features/candidates/focus";
import { resetCandidatesForTests } from "@/features/candidates/store";
import { SurfaceView } from "@/features/surface/SurfaceView";

const RATIO = "btcusdt_p.ema500.ratio_4d";
const TRAILING = "btcusdt_p.ema500.trailing_geometry_4d";

/** Ratio table with a second SL slice (10) so that a candidate can sit outside the default slice. */
const TWO_SL: ExperimentResults = (() => {
  const slIdx = RATIO_RESULTS.columns.indexOf("sl");
  const runIdx = RATIO_RESULTS.columns.indexOf("run_id");
  const rows = Array.from({ length: RATIO_RESULTS.rows }, (_, i) => RATIO_RESULTS.data.map((col) => col[i]));
  const more = rows.map((r) => r.map((v, k) => (k === slIdx ? 10 : k === runIdx ? null : v)));
  const all = [...rows, ...more];
  return { ...RATIO_RESULTS, rows: all.length, data: RATIO_RESULTS.columns.map((_, k) => all.map((r) => r[k])) };
})();

const CURRENT = (over: Partial<CandidateCurrent> = {}): CandidateCurrent => ({
  row_state: "same",
  run_id: null,
  provenance: "engine",
  metrics: { return_pct: 0.25, profit_factor: 1.4, max_drawdown_pct: -0.1, realised_trade_count: 120 },
  meaning: {
    experiment_id: RATIO,
    title: "EMA500 · fixed SL × TP ratio",
    ticker: "BTCUSDT.P",
    anchor: "EMA500",
    coords: [
      { id: "sl", label: "Initial SL", value: 5, unit: "ATR" },
      { id: "tp_ratio", label: "TP / SL", value: 5, unit: "R" },
    ],
    fixed_params: { initial_equity: 10000, entry_fee_rate: "0.001" },
  },
  ...over,
});

function candidate(id: string, coords: Record<string, string | null>, over: Partial<Candidate> = {}): Candidate {
  return {
    candidate_id: id,
    experiment_id: RATIO,
    coords,
    picked_at: "2026-10-01T12:30:00Z",
    fingerprint_fields: ["width", "lookback", "sl", "tp_ratio"],
    fingerprint: "fp",
    table_key: { mtime_ns: 1, size: 2 },
    snapshot: { metrics: { return_pct: 0.2, profit_factor: 1.3, max_drawdown_pct: -0.1 }, provenance: "engine", run_id: null, row_columns: {} },
    strategy_spec_snapshot: null,
    current: CURRENT(),
    ...over,
  };
}

const R_COORDS = { width: "3", lookback: "20", sl: "5", tp_ratio: "5" };

let shortlist: Candidate[] = [];

function wireApi(): void {
  fetchExperiments.mockResolvedValue(REGISTRY);
  fetchExperimentManifest.mockImplementation(async (id: string) => (id.includes("trailing") ? TRAILING_MANIFEST : RATIO_MANIFEST));
  fetchExperimentResults.mockImplementation(async (p: { experimentId: string; filters: Record<string, unknown>; columns?: string[] }) => {
    const full = p.experimentId.includes("trailing") ? TRAILING_RESULTS : p.experimentId === RATIO ? TWO_SL : RATIO_RESULTS;
    if (p.columns) return { columns: p.columns, rows: full.rows, data: p.columns.map((c) => full.data[full.columns.indexOf(c)]) };
    const sl = p.filters.sl;
    if (typeof sl !== "number") return full;
    const keep = full.data[full.columns.indexOf("sl")].map((v, i) => (v === sl ? i : -1)).filter((i) => i >= 0);
    return { ...full, rows: keep.length, data: full.data.map((col) => keep.map((i) => col[i])) };
  });
  fetchExperimentStorage.mockResolvedValue({ experiment_id: RATIO, rows: 6, engine_runs: 4, distinct_run_ids: 4, size: null });
  listCandidates.mockImplementation(async () => ({ candidates: shortlist }));
}

const openExperiment = async (name: RegExp) => fireEvent.click(await screen.findByRole("button", { name }));

const firstCell = async (): Promise<HTMLElement> => {
  const cells = await screen.findAllByRole("cell");
  return cells.filter((c) => c.querySelector(".sx-cell:not(.sx-empty)") !== null)[0].querySelector(".sx-cell") as HTMLElement;
};

describe("star on the Surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlist = [];
    resetCandidatesForTests();
    wireApi();
  });
  afterEach(cleanup);

  it("star sends the coordinates and no candidate id, and marks the cell", async () => {
    starCandidate.mockImplementation(async () => {
      const record = candidate("cand_1", R_COORDS);
      shortlist = [record];
      return { ...record, current: undefined };
    });
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    fireEvent.click(await firstCell());
    expect(document.querySelectorAll(".sx-star").length).toBe(0);
    fireEvent.click(await screen.findByRole("button", { name: "Star point" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unstar point" })).toBeTruthy());
    expect(starCandidate).toHaveBeenCalledTimes(1);
    expect(starCandidate).toHaveBeenCalledWith(RATIO, { width: 3, lookback: 20, sl: 5, tp_ratio: 5 });
    expect(document.querySelectorAll(".sx-cell.sx-star").length).toBe(1);
    expect(screen.getByRole("img", { name: "starred" })).toBeTruthy();
  });

  it("a replay point is starred with grid, arm and an empty optional dimension as null", async () => {
    starCandidate.mockResolvedValue(candidate("cand_t", {}));
    render(<SurfaceView />);
    await openExperiment(/trailing geometry/);
    fireEvent.click(await firstCell());
    fireEvent.click(await screen.findByRole("button", { name: "Star point" }));
    await waitFor(() => expect(starCandidate).toHaveBeenCalled());
    expect(starCandidate).toHaveBeenCalledWith(TRAILING, {
      width: 3,
      lookback: 20,
      sl: 5,
      trigger: 6,
      distance: 0.5,
      be_trigger: null,
      grid: "R",
      arm: "trailing_no_tp",
    });
  });

  it("an ambiguous row keeps the star off and shows the message", async () => {
    starCandidate.mockRejectedValue(new ApiError(409, "several rows match this point"));
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    fireEvent.click(await firstCell());
    fireEvent.click(await screen.findByRole("button", { name: "Star point" }));
    expect((await screen.findByRole("alert")).textContent).toContain("several rows match this point");
    expect(screen.getByRole("button", { name: "Star point" })).toBeTruthy();
    expect(document.querySelectorAll(".sx-star").length).toBe(0);
  });

  it("unstar uses the stored candidate_id and sends no coordinates", async () => {
    shortlist = [candidate("cand_77", R_COORDS)];
    unstarCandidate.mockImplementation(async () => {
      shortlist = [];
      return { removed: true };
    });
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-star").length).toBe(1));
    fireEvent.click(await firstCell());
    fireEvent.click(await screen.findByRole("button", { name: "Unstar point" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Star point" })).toBeTruthy());
    expect(unstarCandidate).toHaveBeenCalledWith("cand_77");
    expect(starCandidate).not.toHaveBeenCalled();
    expect(document.querySelectorAll(".sx-star").length).toBe(0);
  });

  it("marks only starred points of the visible slice", async () => {
    shortlist = [
      candidate("cand_a", R_COORDS),
      candidate("cand_b", { ...R_COORDS, sl: "10" }), // another slice
      candidate("cand_c", R_COORDS, { experiment_id: TRAILING }), // another experiment
    ];
    render(<SurfaceView />);
    await openExperiment(/fixed SL/);
    await waitFor(() => expect(document.querySelectorAll(".sx-cell.sx-star").length).toBe(1));
  });
});

describe("Candidates tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlist = [];
    resetCandidatesForTests();
    wireApi();
  });
  afterEach(cleanup);

  const rowOf = async (title: RegExp): Promise<HTMLElement> => (await screen.findByText(title)).closest("tr") as HTMLElement;

  it("Net PnL is the return times the initial equity, first among the metrics", async () => {
    shortlist = [candidate("cand_1", R_COORDS)];
    render(<CandidatesPanel />);
    const table = await screen.findByRole("table", { name: "Candidates" });
    const heads = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads.slice(4, 6)).toEqual(["Net PnL USDT", "Return"]);
    const row = await rowOf(/fixed SL/);
    expect(within(row).getByText("2,500")).toBeTruthy(); // 0.25 × 10000
    expect(within(row).getByText("25.0%")).toBeTruthy();
    expect(row.textContent).toContain("EMA500 · Initial SL 5 ATR · TP / SL 5 R · fee 0.001 per side");
    expect(fetchRunSummaries).not.toHaveBeenCalled();
  });

  it("a table's own net_pnl wins over the derived one", async () => {
    shortlist = [candidate("cand_1", R_COORDS, { current: CURRENT({ metrics: { net_pnl: 777, return_pct: 0.25 } }) })];
    render(<CandidatesPanel />);
    const row = await rowOf(/fixed SL/);
    expect(within(row).getByText("777.00")).toBeTruthy();
    expect(within(row).queryByText("2,500")).toBeNull();
  });

  it("origin and row state badges; a changed row shows the snapshot value on hover", async () => {
    shortlist = [
      candidate("cand_1", R_COORDS, { current: CURRENT({ row_state: "changed", provenance: "replay" }) }),
    ];
    render(<CandidatesPanel />);
    const row = await rowOf(/fixed SL/);
    expect(within(row).getByText("replay only")).toBeTruthy();
    expect(within(row).getByText("changed")).toBeTruthy();
    expect(within(row).getByText("25.0%").getAttribute("title")).toBe("at the time of the star: 20.0%");
  });

  it("Chart opens the current run; without a run it is disabled with 'no full run'", async () => {
    shortlist = [
      candidate("cand_run", R_COORDS, { current: CURRENT({ run_id: "run_x", provenance: "engine" }) }),
      candidate("cand_none", { ...R_COORDS, width: "4" }, { current: CURRENT({ run_id: null, provenance: "engine" }) }),
    ];
    render(<CandidatesPanel />);
    await screen.findAllByRole("button", { name: "Chart" });
    const [withRun, without] = screen.getAllByRole("button", { name: "Chart" }) as HTMLButtonElement[];
    expect(within(withRun.closest("tr")!).getByText("Engine run")).toBeTruthy();
    expect(within(without.closest("tr")!).getByText("no full run", { selector: ".sx-badge" })).toBeTruthy();
    expect(without.disabled).toBe(true);
    fireEvent.click(without);
    expect(setSelectedRunId).not.toHaveBeenCalled();
    fireEvent.click(withRun);
    expect(setSelectedRunId).toHaveBeenCalledWith("run_x");
    expect(setActiveTab).toHaveBeenCalledWith("chart");
  });

  it("On Surface is disabled with a hint for missing and ambiguous rows and sends no focus request", async () => {
    shortlist = [
      candidate("cand_amb", R_COORDS, { current: CURRENT({ row_state: "ambiguous", metrics: null, meaning: null }) }),
      candidate("cand_miss", { ...R_COORDS, width: "4" }, { current: CURRENT({ row_state: "missing", metrics: null, meaning: null }) }),
    ];
    const seen = vi.fn();
    const off = subscribeFocus(seen);
    render(<CandidatesPanel />);
    await screen.findAllByRole("button", { name: "On Surface" });
    const [amb, miss] = screen.getAllByRole("button", { name: "On Surface" }) as HTMLButtonElement[];
    expect(amb.disabled).toBe(true);
    expect(miss.disabled).toBe(true);
    expect(within(amb.closest("tr")!).getByText("several rows match this point", { selector: ".sx-note" })).toBeTruthy();
    expect(within(miss.closest("tr")!).getByText("row not found", { selector: ".sx-note" })).toBeTruthy();
    fireEvent.click(amb);
    fireEvent.click(miss);
    expect(seen).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
    off();
  });

  it("details label the spec snapshot as historical", async () => {
    shortlist = [
      candidate("cand_1", R_COORDS, {
        strategy_spec_snapshot: { source: "run_request", run_id: "run_old", spec: { strategy_id: "ema_bounce" } },
      }),
    ];
    render(<CandidatesPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    expect(screen.getByText(/as it was when this point was starred/)).toBeTruthy();
    expect(screen.getByText(/not a deployable specification/)).toBeTruthy();
    expect(screen.getByLabelText("Historical strategy spec").textContent).toContain("ema_bounce");
    expect(screen.queryByText(/deploy$/i)).toBeNull();
  });

  it("Max DD filter compares depth: at most 20 hides deeper drawdowns", async () => {
    shortlist = [
      candidate("shallow", R_COORDS, { current: CURRENT({ metrics: { return_pct: 0.1, max_drawdown_pct: -0.1 } }) }),
      candidate("deep", { ...R_COORDS, width: "4" }, { current: CURRENT({ metrics: { return_pct: 0.3, max_drawdown_pct: -0.35 } }) }),
    ];
    render(<CandidatesPanel />);
    await screen.findAllByRole("button", { name: "Chart" });
    expect(screen.getAllByRole("button", { name: "Chart" }).length).toBe(2);
    fireEvent.click(screen.getByText("+ add condition"));
    fireEvent.change(screen.getByLabelText("metric"), { target: { value: "max_drawdown_pct" } });
    fireEvent.change(screen.getByLabelText("operator"), { target: { value: "<=" } });
    fireEvent.change(screen.getByLabelText("threshold"), { target: { value: "20" } });
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Chart" }).length).toBe(1));
    expect(screen.getByText("1 / 2 candidates shown")).toBeTruthy();
  });
});

describe("On Surface", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlist = [];
    resetCandidatesForTests();
    wireApi();
  });
  afterEach(cleanup);

  it("loads the candidate's experiment and SL slice and selects its point", async () => {
    shortlist = [candidate("cand_10", { ...R_COORDS, sl: "10", width: "4", lookback: "30" })];
    render(
      <>
        <SurfaceView />
        <CandidatesPanel />
      </>,
    );
    await openExperiment(/trailing geometry/); // the Surface shows another experiment
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    fireEvent.click(await screen.findByRole("button", { name: "On Surface" }));
    expect(setActiveTab).toHaveBeenCalledWith("surface");
    const details = await screen.findByLabelText("Point details");
    await waitFor(() => expect(within(details).getByText("10 ATR")).toBeTruthy());
    expect(within(details).getByText("30 bars")).toBeTruthy();
    expect(within(details).getByText("4 ATR")).toBeTruthy();
    expect(fetchExperimentResults.mock.calls.some((c) => c[0].experimentId === RATIO && c[0].filters.sl === 10)).toBe(true);
    expect(document.querySelectorAll(".sx-cell.sx-sel").length).toBe(1);
    expect(fetchRunSummaries).not.toHaveBeenCalled();
  });

  it("a point hidden by the active filters is still selected, with a hint", async () => {
    shortlist = [candidate("cand_1", R_COORDS)];
    render(
      <>
        <SurfaceView />
        <CandidatesPanel />
      </>,
    );
    await openExperiment(/fixed SL/);
    await screen.findByRole("table", { name: /Stack width by Untouched lookback/ });
    const surfaceFilters = screen.getByText(/cells that fail turn grey/).closest("[aria-label=Filters]") as HTMLElement;
    fireEvent.click(within(surfaceFilters).getByText("+ add condition"));
    fireEvent.change(within(surfaceFilters).getByLabelText("threshold"), { target: { value: "100000" } });
    await waitFor(() => expect(document.querySelectorAll(".sx-off").length).toBeGreaterThan(0));
    fireEvent.click(await screen.findByRole("button", { name: "On Surface" }));
    expect(await screen.findByText("This point is hidden by the active filters.")).toBeTruthy();
    expect(document.querySelectorAll(".sx-cell.sx-sel").length).toBe(1);
  });
});
