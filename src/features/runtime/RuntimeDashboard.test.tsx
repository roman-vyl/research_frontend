/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeListError, type RuntimeStrategyInstance, type RuntimeStrategyList } from "@/api/runtime";
import { RuntimeDashboard } from "@/features/runtime/RuntimeDashboard";

const fetchRuntimeStrategyInstances = vi.fn();
const fetchJournalEvents = vi.fn();
const fetchJournalStrategyInstances = vi.fn();

vi.mock("@/api/journal", () => ({
  fetchJournalEvents: (...a: unknown[]) => fetchJournalEvents(...a),
  fetchJournalStrategyInstances: (...a: unknown[]) => fetchJournalStrategyInstances(...a),
}));

vi.mock("@/api/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/runtime")>();
  return { ...actual, fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a) };
});

function instance(file: string, enabled: boolean, extra: Partial<RuntimeStrategyInstance> = {}): RuntimeStrategyInstance {
  return {
    strategy_instance_id: `ema_pullback:${file.replace(/\W/g, "").padEnd(24, "0").slice(0, 24)}`,
    strategy_id: "ema_pullback",
    instrument: "ETHUSDT.P",
    base_timeframe: "5m",
    enabled,
    source_path: file,
    ...extra,
  };
}

function list(overrides: Partial<RuntimeStrategyList> = {}): RuntimeStrategyList {
  return {
    scanned_file_count: 33,
    strategy_instances: [],
    invalid_files: [],
    duplicate_identities: [],
    ...overrides,
  };
}

function realisticList(): RuntimeStrategyList {
  return list({
    strategy_instances: [
      instance("journal-smoke-eth-ema500.json", true),
      ...Array.from({ length: 32 }, (_, i) =>
        instance(`loadtest-${String(i).padStart(2, "0")}.json`, false, { instrument: "BTCUSDT.P" }),
      ),
    ],
  });
}

describe("RuntimeDashboard", () => {
  beforeEach(() => {
    fetchRuntimeStrategyInstances.mockReset();
    fetchJournalEvents.mockReset();
    fetchJournalStrategyInstances.mockReset();
    fetchJournalStrategyInstances.mockResolvedValue([]);
    fetchJournalEvents.mockResolvedValue({ events: [], truncated: false });
  });
  afterEach(cleanup);

  it("requests the list once when opened", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list());
    render(<RuntimeDashboard />);
    await screen.findByText("No strategies in the Runtime catalog");
    expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(1);
  });

  it("shows the counts and a card per strategy in the received order", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    render(<RuntimeDashboard />);

    const summary = await screen.findByLabelText("Summary");
    expect(within(summary).getByText("33 strategies")).toBeTruthy();
    expect(within(summary).getByText("1 enabled")).toBeTruthy();
    expect(within(summary).getByText("32 disabled")).toBeTruthy();

    const cards = within(screen.getByLabelText("Strategies")).getAllByRole("listitem");
    expect(cards).toHaveLength(33);
    expect(within(cards[0]).getByText("journal-smoke-eth-ema500")).toBeTruthy();
    expect(within(cards[0]).getByText("ema_pullback · ETHUSDT.P · 5m")).toBeTruthy();
    expect(within(cards[0]).getByText("ENABLED")).toBeTruthy();
    expect(within(cards[0]).getByText(/^ema_pullback:/)).toBeTruthy();
    expect(within(cards[1]).getByText("loadtest-00")).toBeTruthy();
    expect(within(cards[1]).getByText("DISABLED")).toBeTruthy();
    expect(within(cards[32]).getByText("loadtest-31")).toBeTruthy();
  });

  it("uses the singular for one strategy", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [instance("a.json", true)] }));
    render(<RuntimeDashboard />);
    expect(await screen.findByText("1 strategy")).toBeTruthy();
  });

  it("never says a strategy is running, active, live or trading", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    const { container } = render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    expect(container.textContent ?? "").not.toMatch(/\b(running|active|live|trading)\b/i);
  });

  it("shows no warning block without diagnostics", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    expect(screen.queryByLabelText("Catalog warnings")).toBeNull();
  });

  it("lists an invalid file and a duplicate identity in the warning block", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(
      list({
        strategy_instances: [instance("a.json", true)],
        invalid_files: [{ source_path: "bad.json", error_code: "invalid_json", error_message: "Expecting value" }],
        duplicate_identities: [
          { strategy_instance_id: "ema_pullback:dup", source_paths: ["one.json", "two.json"] },
        ],
      }),
    );
    render(<RuntimeDashboard />);

    const block = await screen.findByLabelText("Catalog warnings");
    expect(within(block).getByText("These files are not in the list above")).toBeTruthy();
    expect(within(block).getByText("bad.json")).toBeTruthy();
    expect(within(block).getByText(/invalid_json/)).toBeTruthy();
    expect(within(block).getByText("ema_pullback:dup")).toBeTruthy();
    expect(within(block).getByText("one.json, two.json")).toBeTruthy();
  });

  it("shows the warning block even when no strategy was accepted", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(
      list({ invalid_files: [{ source_path: "bad.json", error_code: "invalid_json", error_message: null }] }),
    );
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Catalog warnings");
    expect(screen.queryByText("No strategies in the Runtime catalog")).toBeNull();
    expect(screen.getByText("0 strategies")).toBeTruthy();
  });

  it("shows a loading state with Refresh disabled while the request is in flight", async () => {
    let resolve!: (value: RuntimeStrategyList) => void;
    fetchRuntimeStrategyInstances.mockReturnValue(new Promise<RuntimeStrategyList>((r) => (resolve = r)));
    render(<RuntimeDashboard />);

    expect(screen.getByText("Loading…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(true);

    resolve(realisticList());
    await screen.findByLabelText("Strategies");
    expect((screen.getByRole("button", { name: "Refresh" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each([
    ["not_ready", "Runtime is not ready"],
    ["catalog_unavailable", "Runtime catalog is unavailable"],
    ["runtime_error", "Runtime returned an error"],
    ["unreachable", "Runtime is not reachable"],
  ] as const)("shows the %s failure", async (kind, text) => {
    fetchRuntimeStrategyInstances.mockRejectedValue(new RuntimeListError(kind));
    render(<RuntimeDashboard />);
    expect((await screen.findByRole("alert")).textContent).toBe(text);
  });

  it("retries after an error and replaces the error with the list", async () => {
    fetchRuntimeStrategyInstances
      .mockRejectedValueOnce(new RuntimeListError("unreachable"))
      .mockResolvedValueOnce(realisticList());
    render(<RuntimeDashboard />);
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await screen.findByLabelText("Strategies");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2);
  });

  it("Refresh requests the list again", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
    await screen.findByLabelText("Strategies");
  });

  it("ignores a response that arrives after the tab was left", async () => {
    let resolve!: (value: RuntimeStrategyList) => void;
    fetchRuntimeStrategyInstances.mockReturnValue(new Promise<RuntimeStrategyList>((r) => (resolve = r)));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<RuntimeDashboard />);
    unmount();

    resolve(realisticList());
    await Promise.resolve();

    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("offers no control that changes Runtime", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    // the only buttons are Refresh and the selection toggles of the cards (aria-pressed, UI state only)
    const controls = screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-pressed"));
    expect(controls.map((b) => b.textContent)).toEqual(["Refresh"]);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(33);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("cards show the last evaluated bar from the Journal, or that there are none", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [instance("a.json", true), instance("b.json", true)] }));
    const a = instance("a.json", true);
    fetchJournalStrategyInstances.mockResolvedValue([
      { strategy_instance_id: a.strategy_instance_id, event_count: 3, first_bar_open_time_ms: 0, last_bar_open_time_ms: 1_760_000_100_000, last_occurred_at: "x" },
    ]);
    render(<RuntimeDashboard />);
    expect(await screen.findByText(/Last evaluated 2025-10-09 \d{2}:\d{2} UTC/)).toBeTruthy();
    expect(screen.getByText("No evaluations yet")).toBeTruthy();
  });

  it("a Journal failure leaves the cards as before", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [instance("a.json", true)] }));
    fetchJournalStrategyInstances.mockRejectedValue(new Error("down"));
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    expect(screen.queryByText("No evaluations yet")).toBeNull();
    expect(screen.queryByText(/Last evaluated/)).toBeNull();
  });
});
