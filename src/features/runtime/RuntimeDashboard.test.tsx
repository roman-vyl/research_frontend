/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RuntimeCommandError, RuntimeDeleteError, RuntimeEnabledError, RuntimeListError, type RuntimeStrategyInstance, type RuntimeStrategyList } from "@/api/runtime";
import { RuntimeDashboard } from "@/features/runtime/RuntimeDashboard";

const fetchRuntimeStrategyInstances = vi.fn();
const fetchRuntimeStrategyStates = vi.fn();
const setRuntimeStrategyEnabled = vi.fn();
const deleteRuntimeStrategy = vi.fn();
const sendRuntimeCommand = vi.fn();
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
    fetchRuntimeStrategyStates: (...a: unknown[]) => fetchRuntimeStrategyStates(...a),
    setRuntimeStrategyEnabled: (...a: unknown[]) => setRuntimeStrategyEnabled(...a),
    deleteRuntimeStrategy: (...a: unknown[]) => deleteRuntimeStrategy(...a),
    sendRuntimeCommand: (...a: unknown[]) => sendRuntimeCommand(...a),
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
    fetchRuntimeStrategyStates.mockReset();
    fetchRuntimeStrategyStates.mockResolvedValue([]);
    setRuntimeStrategyEnabled.mockReset();
    deleteRuntimeStrategy.mockReset();
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
      .filter(
        (b) =>
          !b.hasAttribute("aria-pressed") &&
          b.getAttribute("role") !== "switch" &&
          !(b.getAttribute("aria-label") ?? "").startsWith("Delete: "),
      );
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

  describe("delete button", () => {
    const REASON_TEXT: Record<string, string> = {
      still_enabled: "This strategy is enabled. Disable it first.",
      position_open: "This strategy has an open position and cannot be deleted.",
      recovery_pending: "This strategy is recovering an order or position and cannot be deleted yet.",
      cycle_not_settled: "This strategy's trade cycle has just ended. Try again after the next bar.",
      cancel_not_confirmed: "The entry order could not be confirmed cancelled on the exchange. The strategy was not deleted.",
      abi_unavailable: "The exchange gateway did not answer. The strategy was not deleted.",
      instance_busy: "The strategy is processing a bar. Try again in a moment.",
      file_changed: "The strategy file was changed while deleting. Nothing was changed. Try again.",
      trash_name_taken: "Runtime could not move the strategy file to the trash. Nothing was changed. Try again.",
      move_failed: "Runtime could not move the strategy file to the trash. Nothing was changed. Try again.",
      strategy_instance_not_found: "Runtime no longer has this strategy. Refresh the list.",
      catalog_unavailable: "Runtime cannot read the strategy files. Nothing was changed.",
      something_new: "Runtime did not answer correctly. Nothing was changed.",
    };

    async function open() {
      const a = instance("a.json", false);
      const b = instance("b.json", true);
      fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [a, b] }));
      render(<RuntimeDashboard />);
      await screen.findByLabelText("Strategies");
      return { a, b, trash: screen.getByRole("button", { name: "Delete: a" }) as HTMLButtonElement };
    }

    function confirmDialog() {
      return screen.findByRole("alertdialog", { name: "Delete strategy" });
    }

    it("is disabled for an enabled card with the hint, enabled for a disabled one", async () => {
      const { trash } = await open();
      const enabledTrash = screen.getByRole("button", { name: "Delete: b" }) as HTMLButtonElement;
      expect(trash.disabled).toBe(false);
      expect(enabledTrash.disabled).toBe(true);
      expect(enabledTrash.getAttribute("title")).toBe("Disable it first.");
      fireEvent.click(enabledTrash);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(deleteRuntimeStrategy).not.toHaveBeenCalled();
    });

    it("sits outside the card's select button", async () => {
      const { trash } = await open();
      expect(trash.closest(".rt-card-btn")).toBeNull();
      fireEvent.click(trash);
      expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    });

    it("opens a confirmation with Cancel focused and sends nothing yet", async () => {
      const { trash } = await open();
      fireEvent.click(trash);
      const dialog = await confirmDialog();
      expect(within(dialog).getByText(/Delete a\?/)).toBeTruthy();
      expect(within(dialog).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Delete"]);
      await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" })));
      expect(deleteRuntimeStrategy).not.toHaveBeenCalled();
    });

    it("Cancel sends nothing and returns focus to the trash button", async () => {
      const { trash } = await open();
      fireEvent.click(trash);
      const dialog = await confirmDialog();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(trash);
      expect(deleteRuntimeStrategy).not.toHaveBeenCalled();
    });

    it("Esc sends nothing and returns focus to the trash button", async () => {
      const { trash } = await open();
      fireEvent.click(trash);
      fireEvent.keyDown(await confirmDialog(), { key: "Escape" });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(trash);
      expect(deleteRuntimeStrategy).not.toHaveBeenCalled();
    });

    it("Delete sends one request, refetches quietly and the card leaves the list", async () => {
      const { a, trash } = await open();
      deleteRuntimeStrategy.mockResolvedValue({ strategy_instance_id: a.strategy_instance_id, deleted: true, cancelled_entry_order: false });
      let release: (l: RuntimeStrategyList) => void = () => {};
      fetchRuntimeStrategyInstances.mockReturnValue(new Promise<RuntimeStrategyList>((r) => (release = r)));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
      expect(deleteRuntimeStrategy).toHaveBeenCalledTimes(1);
      expect(deleteRuntimeStrategy).toHaveBeenCalledWith(a.strategy_instance_id);
      expect(screen.getByLabelText("Strategies")).toBeTruthy();
      expect(screen.queryByText("Loading…")).toBeNull();
      release(list({ strategy_instances: [instance("b.json", true)] }));
      await waitFor(() => expect(screen.queryByRole("switch", { name: "Enabled: a" })).toBeNull());
      expect(screen.getByRole("switch", { name: "Enabled: b" })).toBeTruthy();
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("clears the selection when the deleted strategy is selected", async () => {
      const { a, trash } = await open();
      fireEvent.click(screen.getAllByRole("button", { pressed: false })[0]!);
      expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
      deleteRuntimeStrategy.mockResolvedValue({ strategy_instance_id: a.strategy_instance_id, deleted: true, cancelled_entry_order: false });
      fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [instance("b.json", true)] }));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(screen.queryByRole("switch", { name: "Enabled: a" })).toBeNull());
      expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
    });

    it("blocks the card's switch and trash while the request is in flight", async () => {
      const { trash } = await open();
      deleteRuntimeStrategy.mockReturnValue(new Promise(() => {}));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      await waitFor(() => expect(trash.disabled).toBe(true));
      expect((screen.getByRole("switch", { name: "Enabled: a" }) as HTMLButtonElement).disabled).toBe(true);
      expect(deleteRuntimeStrategy).toHaveBeenCalledTimes(1);
    });

    it("a running switch request blocks the trash of the same card", async () => {
      const { trash } = await open();
      setRuntimeStrategyEnabled.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByRole("switch", { name: "Enabled: a" }));
      await waitFor(() => expect(trash.disabled).toBe(true));
    });

    it.each(Object.entries(REASON_TEXT))("refusal %s shows its text, keeps the card and does not refetch", async (reason, text) => {
      const { trash } = await open();
      deleteRuntimeStrategy.mockRejectedValue(new RuntimeDeleteError(reason));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Strategy was not deleted" });
      expect(within(dialog).getByText(text)).toBeTruthy();
      expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(1);
      expect(screen.getByRole("switch", { name: "Enabled: a" })).toBeTruthy();
      expect(trash.disabled).toBe(false);
    });

    it("a network failure or an invalid 200 shows the generic text", async () => {
      const { trash } = await open();
      deleteRuntimeStrategy.mockRejectedValue(new RuntimeDeleteError(null));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Strategy was not deleted" });
      expect(within(dialog).getByText("Runtime did not answer correctly. Nothing was changed.")).toBeTruthy();
    });

    it("the refusal dialog has one OK button; OK and Esc return focus to the trash button", async () => {
      const { trash } = await open();
      deleteRuntimeStrategy.mockRejectedValue(new RuntimeDeleteError("position_open"));
      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      const dialog = await screen.findByRole("alertdialog", { name: "Strategy was not deleted" });
      const buttons = within(dialog).getAllByRole("button");
      expect(buttons.map((b) => b.textContent)).toEqual(["OK"]);
      await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
      fireEvent.click(buttons[0]!);
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(trash);

      fireEvent.click(trash);
      fireEvent.click(within(await confirmDialog()).getByRole("button", { name: "Delete" }));
      fireEvent.keyDown(await screen.findByRole("alertdialog", { name: "Strategy was not deleted" }), { key: "Escape" });
      expect(screen.queryByRole("alertdialog")).toBeNull();
      expect(document.activeElement).toBe(trash);
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

describe("RuntimeDashboard trade state marks", () => {
  const a = instance("a.json", true);
  const b = instance("b.json", true);
  const c = instance("c.json", true);
  const d = instance("d.json", true);
  const state = (id: string, extra: Record<string, unknown>) => ({
    strategy_instance_id: id,
    trade_state: "flat",
    trade_cycle_id: null,
    side: null,
    first_fill_at_ms: null,
    recovery_pending: null,
    ...extra,
  });

  beforeEach(() => {
    fetchRuntimeStrategyInstances.mockReset();
    fetchRuntimeStrategyStates.mockReset();
    fetchJournalStrategyInstances.mockReset();
    fetchJournalStrategyInstances.mockResolvedValue([]);
    fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [a, b, c, d] }));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("shows position, entry order, recovery and nothing for flat, with counts", async () => {
    fetchRuntimeStrategyStates.mockResolvedValue([
      state(a.strategy_instance_id, { trade_state: "in_position", side: "short", trade_cycle_id: "x" }),
      state(b.strategy_instance_id, { trade_state: "entry_pending", side: "long", trade_cycle_id: "y" }),
      state(c.strategy_instance_id, { recovery_pending: "close" }),
    ]);
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · SHORT");
    expect(screen.getByText("ENTRY ORDER · LONG")).toBeTruthy();
    expect(screen.getByText("RECOVERY · CLOSE")).toBeTruthy();
    expect(screen.getAllByText(/IN POSITION|ENTRY ORDER|RECOVERY/)).toHaveLength(3);
    expect(screen.getByText("1 in position")).toBeTruthy();
    expect(screen.getByText("1 entry order")).toBeTruthy();
    expect(screen.getByText(/last processed bar/)).toBeTruthy();
  });

  it("shows the cards without marks and a failure line when the state read fails, then recovers", async () => {
    fetchRuntimeStrategyStates.mockRejectedValueOnce(new Error("503"));
    render(<RuntimeDashboard />);
    await screen.findByText(/Trade state unavailable/);
    expect(screen.getAllByRole("switch")).toHaveLength(4);
    expect(screen.queryByText(/IN POSITION/)).toBeNull();
    fetchRuntimeStrategyStates.mockResolvedValue([
      state(a.strategy_instance_id, { trade_state: "in_position", side: "long" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("IN POSITION · LONG");
    expect(screen.queryByText(/Trade state unavailable/)).toBeNull();
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(2);
  });

  it("re-reads every 10 seconds while visible and not while hidden", async () => {
    fetchRuntimeStrategyStates.mockResolvedValue([]);
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<RuntimeDashboard />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(2);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it("does not start a second state read while one is unfinished", async () => {
    let finish: (v: unknown[]) => void = () => {};
    fetchRuntimeStrategyStates.mockReturnValue(new Promise((r) => (finish = r)));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<RuntimeDashboard />);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(1);
    finish([]);
  });
});

describe("RuntimeDashboard operator commands", () => {
  const a = instance("a.json", true);
  const b = instance("b.json", true);
  const c = instance("c.json", true);
  const state = (id: string, trade_state: string) => ({
    strategy_instance_id: id,
    trade_state,
    trade_cycle_id: null,
    side: "long",
    first_fill_at_ms: null,
    recovery_pending: null,
  });

  beforeEach(() => {
    fetchRuntimeStrategyInstances.mockReset();
    fetchRuntimeStrategyStates.mockReset();
    sendRuntimeCommand.mockReset();
    fetchJournalStrategyInstances.mockReset();
    fetchJournalStrategyInstances.mockResolvedValue([]);
    fetchRuntimeStrategyInstances.mockResolvedValue(list({ strategy_instances: [a, b, c] }));
    fetchRuntimeStrategyStates.mockResolvedValue([
      state(a.strategy_instance_id, "in_position"),
      state(b.strategy_instance_id, "entry_pending"),
      state(c.strategy_instance_id, "flat"),
    ]);
  });
  afterEach(cleanup);

  it("offers Close position in a position, Cancel entry order for an entry order, nothing when flat", async () => {
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    expect(screen.getAllByRole("button", { name: "Close position" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Cancel entry order" })).toHaveLength(1);
  });

  it("offers nothing when the trade state could not be read", async () => {
    fetchRuntimeStrategyStates.mockRejectedValue(new Error("503"));
    render(<RuntimeDashboard />);
    await screen.findByText(/Trade state unavailable/);
    expect(screen.queryByRole("button", { name: "Close position" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel entry order" })).toBeNull();
  });

  it("asks first, names the strategy and sends nothing until accepted; Back sends nothing", async () => {
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    fireEvent.click(screen.getByRole("button", { name: "Close position" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toMatch(/a\b.*closed at market.*stop and take orders cancelled.*disabled/);
    expect(sendRuntimeCommand).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(sendRuntimeCommand).not.toHaveBeenCalled();
  });

  it("sends one close command, then re-reads the list and the trade state", async () => {
    sendRuntimeCommand.mockResolvedValue(undefined);
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    fireEvent.click(screen.getByRole("button", { name: "Close position" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Close position" }));
    await waitFor(() => expect(fetchRuntimeStrategyInstances).toHaveBeenCalledTimes(2));
    expect(sendRuntimeCommand).toHaveBeenCalledTimes(1);
    expect(sendRuntimeCommand).toHaveBeenCalledWith(a.strategy_instance_id, "close-position");
    expect(fetchRuntimeStrategyStates).toHaveBeenCalledTimes(2);
  });

  it("sends the cancel command for an entry order", async () => {
    sendRuntimeCommand.mockResolvedValue(undefined);
    render(<RuntimeDashboard />);
    await screen.findByText("ENTRY ORDER · LONG");
    fireEvent.click(screen.getByRole("button", { name: "Cancel entry order" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/entry order of b.*cancelled.*disabled/);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel entry order" }));
    await waitFor(() => expect(sendRuntimeCommand).toHaveBeenCalledWith(b.strategy_instance_id, "cancel-entry-orders"));
  });

  it("shows a refusal in plain words", async () => {
    sendRuntimeCommand.mockRejectedValue(new RuntimeCommandError("recovery_pending", 409));
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    fireEvent.click(screen.getByRole("button", { name: "Close position" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Close position" }));
    await screen.findByText(/recovering an order or position.*Nothing was changed/);
  });

  it("says the close is still being completed and the strategy is disabled on a 502", async () => {
    sendRuntimeCommand.mockRejectedValue(new RuntimeCommandError("abi_unavailable", 502));
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    fireEvent.click(screen.getByRole("button", { name: "Close position" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Close position" }));
    await screen.findByText(/still completing it, and the strategy is already disabled/);
  });

  it("sends nothing on its own when opened or on the periodic refresh", async () => {
    render(<RuntimeDashboard />);
    await screen.findByText("IN POSITION · LONG");
    expect(sendRuntimeCommand).not.toHaveBeenCalled();
  });
});
