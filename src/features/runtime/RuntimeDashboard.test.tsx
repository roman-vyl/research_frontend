/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeEnabledError, RuntimeListError, type RuntimeStrategyInstance, type RuntimeStrategyList } from "@/api/runtime";
import { RuntimeDashboard } from "@/features/runtime/RuntimeDashboard";

const fetchRuntimeStrategyInstances = vi.fn();
const setRuntimeStrategyEnabled = vi.fn();
const fetchJournalEvents = vi.fn();
const fetchJournalStrategyInstances = vi.fn();

vi.mock("@/api/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/journal")>()),
  fetchJournalEvents: (...a: unknown[]) => fetchJournalEvents(...a),
  fetchJournalStrategyInstances: (...a: unknown[]) => fetchJournalStrategyInstances(...a),
}));

vi.mock("@/api/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/runtime")>();
  return {
    ...actual,
    fetchRuntimeStrategyInstances: (...a: unknown[]) => fetchRuntimeStrategyInstances(...a),
    setRuntimeStrategyEnabled: (...a: unknown[]) => setRuntimeStrategyEnabled(...a),
  };
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
    setRuntimeStrategyEnabled.mockReset();
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

  it("offers one switch per card besides Refresh and the selection buttons", async () => {
    fetchRuntimeStrategyInstances.mockResolvedValue(realisticList());
    render(<RuntimeDashboard />);
    await screen.findByLabelText("Strategies");
    const controls = screen
      .getAllByRole("button")
      .filter((b) => !b.hasAttribute("aria-pressed") && b.getAttribute("role") !== "switch");
    expect(controls.map((b) => b.textContent)).toEqual(["Refresh"]);
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(33);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getAllByRole("switch")).toHaveLength(33);
  });

  describe("enabled switch", () => {
    const REASON_TEXT: Record<string, string> = {
      position_open: "This strategy has an open position and cannot be disabled.",
      recovery_pending: "This strategy is recovering an order or position and cannot be disabled yet.",
      cycle_not_settled: "This strategy's trade cycle has just ended. Try again after the next bar.",
      cancel_not_confirmed: "The entry order could not be confirmed cancelled on the exchange. The strategy stays enabled.",
      abi_unavailable: "The exchange gateway did not answer. The strategy stays enabled.",
      instance_busy: "The strategy is processing a bar. Try again in a moment.",
      file_changed: "The strategy file was changed while switching. Nothing was changed. Try again.",
      write_failed: "Runtime could not write the strategy file. Nothing was changed. Try again.",
      strategy_instance_not_found: "Runtime no longer has this strategy. Refresh the list.",
      catalog_unavailable: "Runtime cannot read the strategy files. Nothing was changed.",
      identity_changed: "Runtime did not answer correctly. Nothing was changed.",
      something_new: "Runtime did not answer correctly. Nothing was changed.",
    };

    async function open(on: boolean) {
      const a = instance("a.json", on);
      const b = instance("b.json", true);
      fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [a, b] }));
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      return { a, b, sw: screen.getByRole("switch", { name: /a$/ }) };
    }

    it("is a switch named after the strategy and reflects enabled", async () => {
      const { sw } = await open(true);
      expect(sw.getAttribute("aria-checked")).toBe("true");
      expect(sw.getAttribute("aria-label")).toBe("Enabled: a");
      expect(screen.getByRole("switch", { name: "Enabled: b" })).toBeTruthy();
    });

    it.each([
      [true, false],
      [false, true],
    ])("sends one PUT with the opposite value (%s -> %s) and refetches on success", async (from, to) => {
      const { a, sw } = await open(from);
      setRuntimeStrategyEnabled.mockResolvedValue({ strategy_instance_id: a.strategy_instance_id, enabled: to, cancelled_entry_order: false });
      fetchRuntimeStrategyInstances.mockResolvedValue(
        list({ strategy_instances: [instance("a.json", to), instance("b.json", true)] }),
      );
      fireEvent.click(sw);
      await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
      expect(setRuntimeStrategyEnabled).toHaveBeenCalledTimes(1);
      expect(setRuntimeStrategyEnabled).toHaveBeenCalledWith(a.strategy_instance_id, to);
      await waitFor(() => expect(screen.getByRole("switch", { name: /a$/ }).getAttribute("aria-checked")).toBe(String(to)));
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("keeps the cards on screen while the list is re-read after a switch", async () => {
      const { a, sw } = await open(true);
      setRuntimeStrategyEnabled.mockResolvedValue({ strategy_instance_id: a.strategy_instance_id, enabled: false, cancelled_entry_order: false });
      let release: (l: RuntimeStrategyList) => void = () => {};
      fetchRuntimeStrategyInstances.mockReturnValue(new Promise<RuntimeStrategyList>((r) => (release = r)));
      fireEvent.click(sw);
      await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
      expect(screen.getByLabelText("Strategies")).toBeTruthy();
      expect(screen.getAllByRole("switch")).toHaveLength(2);
      expect(screen.queryByText("Loading…")).toBeNull();
      release(list({ strategy_instances: [instance("a.json", false), instance("b.json", true)] }));
      await waitFor(() => expect(screen.getByRole("switch", { name: /a$/ }).getAttribute("aria-checked")).toBe("false"));
    });

    it("blocks only the card being switched while its request is in flight", async () => {
      const { sw } = await open(true);
      setRuntimeStrategyEnabled.mockReturnValue(new Promise(() => {}));
      fireEvent.click(sw);
      await waitFor(() => expect((sw as HTMLButtonElement).disabled).toBe(true));
      expect((screen.getByRole("switch", { name: "Enabled: b" }) as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(sw);
      expect(setRuntimeStrategyEnabled).toHaveBeenCalledTimes(1);
    });

    it.each(Object.entries(REASON_TEXT))("refusal %s shows its text, keeps the card and does not refetch", async (reason, text) => {
      const { sw } = await open(true);
      setRuntimeStrategyEnabled.mockRejectedValue(new RuntimeEnabledError(reason));
      fireEvent.click(sw);
      const dialog = await screen.findByRole("alertdialog");
      expect(within(dialog).getByText(text)).toBeTruthy();
      expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("switch", { name: /a$/ }).getAttribute("aria-checked")).toBe("true");
      expect((sw as HTMLButtonElement).disabled).toBe(false);
    });

    it("a network failure or a non-refusal answer shows the generic text", async () => {
      const { sw } = await open(true);
      setRuntimeStrategyEnabled.mockRejectedValue(new RuntimeEnabledError(null));
      fireEvent.click(sw);
      const dialog = await screen.findByRole("alertdialog");
      expect(within(dialog).getByText("Runtime did not answer correctly. Nothing was changed.")).toBeTruthy();
    });

    it("the dialog has one OK button, takes focus, and OK returns focus to the switch", async () => {
      const { sw } = await open(true);
      setRuntimeStrategyEnabled.mockRejectedValue(new RuntimeEnabledError("position_open"));
      fireEvent.click(sw);
      const dialog = await screen.findByRole("alertdialog");
      const buttons = within(dialog).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["OK"]);
      await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
      fireEvent.click(buttons[0]!);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(sw);
    });

    it("Esc closes the dialog and returns focus to the switch", async () => {
      const { sw } = await open(true);
      setRuntimeStrategyEnabled.mockRejectedValue(new RuntimeEnabledError("write_failed"));
      fireEvent.click(sw);
      const dialog = await screen.findByRole("alertdialog");
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(sw);
    });
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
