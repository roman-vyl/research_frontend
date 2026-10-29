import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deleteRuntimeStrategy,
  fetchRuntimeChartLayers,
  fetchRuntimeStrategyInstances,
  fetchRuntimeStrategyStates,
  RuntimeChartLayersError,
  RuntimeCommandError,
  RuntimeDeleteError,
  RuntimeEnabledError,
  RuntimeListError,
  sendRuntimeCommand,
  setRuntimeStrategyEnabled,
  type RuntimeListErrorKind,
} from "@/api/runtime";

const LIST = {
  scanned_file_count: 0,
  strategy_instances: [],
  invalid_files: [],
  duplicate_identities: [],
};

function respond(status: number, body: string | null): Response {
  return new Response(body, { status });
}

async function kindOf(promise: Promise<unknown>): Promise<RuntimeListErrorKind> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(RuntimeListError);
    return (err as RuntimeListError).kind;
  }
  throw new Error("expected a RuntimeListError");
}

describe("fetchRuntimeStrategyInstances", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends one GET to the runtime proxy path and returns the list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, JSON.stringify(LIST)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchRuntimeStrategyInstances()).resolves.toEqual(LIST);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/runtime-api/v1/strategy-instances", { method: "GET" });
  });

  it.each<[string, number, string | null, RuntimeListErrorKind]>([
    ["503 not_ready", 503, '{"status":"not_ready"}', "not_ready"],
    ["503 catalog_unavailable", 503, '{"status":"catalog_unavailable"}', "catalog_unavailable"],
    ["500 internal_error", 500, '{"status":"internal_error"}', "runtime_error"],
    ["404 from an older Runtime", 404, '{"detail":"Not Found"}', "runtime_error"],
    ["502 from the proxy", 502, null, "unreachable"],
    ["504 from the proxy", 504, null, "unreachable"],
    ["500 without a Runtime body (dev proxy, Runtime down)", 500, "", "unreachable"],
  ])("maps %s", async (_name, status, body, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, body)));
    expect(await kindOf(fetchRuntimeStrategyInstances())).toBe(expected);
  });

  it("maps a network failure to unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await kindOf(fetchRuntimeStrategyInstances())).toBe("unreachable");
  });
});

describe("setRuntimeStrategyEnabled", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function reasonOf(promise: Promise<unknown>): Promise<string | null> {
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(RuntimeEnabledError);
      return (err as RuntimeEnabledError).reason;
    }
    throw new Error("expected a RuntimeEnabledError");
  }

  it("sends PUT with the enabled body to the instance's enabled route and returns the 200 body", async () => {
    const ok = { strategy_instance_id: "s:abc", enabled: false, cancelled_entry_order: true };
    const fetchMock = vi.fn().mockResolvedValue(respond(200, JSON.stringify(ok)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(setRuntimeStrategyEnabled("s:abc", false)).resolves.toEqual(ok);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/runtime-api/v1/strategy-instances/s%3Aabc/enabled");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ enabled: false });
  });

  it.each([
    ["wrong instance id", { strategy_instance_id: "s:other", enabled: false, cancelled_entry_order: false }],
    ["wrong enabled value", { strategy_instance_id: "s:abc", enabled: true, cancelled_entry_order: false }],
    ["missing cancelled_entry_order", { strategy_instance_id: "s:abc", enabled: false }],
    ["non-boolean cancelled_entry_order", { strategy_instance_id: "s:abc", enabled: false, cancelled_entry_order: "no" }],
    ["null body", null],
    ["array body", []],
  ])("rejects a 200 with %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, JSON.stringify(body))));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", false))).toBeNull();
  });

  it("rejects a 200 with a malformed or empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, "<html>ok</html>")));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", false))).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, null)));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", false))).toBeNull();
  });

  it("reads the reason only from an enabled_change_refused body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, JSON.stringify({ status: "enabled_change_refused", reason: "position_open" }))));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", false))).toBe("position_open");
  });

  it.each([
    [400, JSON.stringify({ status: "rejected", reason: "invalid_webhook" })],
    [503, JSON.stringify({ status: "not_ready", reason: "position_open" })],
    [500, JSON.stringify({ status: "internal_error" })],
    [502, "<html>bad gateway</html>"],
    [502, null],
  ])("gives no reason for a %s answer that is not a refusal", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, body)));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", true))).toBeNull();
  });

  it("gives no reason on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect(await reasonOf(setRuntimeStrategyEnabled("s:abc", true))).toBeNull();
  });
});

describe("deleteRuntimeStrategy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OK = { strategy_instance_id: "s:abc", deleted: true, cancelled_entry_order: false, trash_file: ".deleted/a.json" };

  async function reasonOf(promise: Promise<unknown>): Promise<string | null> {
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(RuntimeDeleteError);
      return (err as RuntimeDeleteError).reason;
    }
    throw new Error("expected a RuntimeDeleteError");
  }

  it("sends one DELETE without a body to the instance path and returns the confirmed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, JSON.stringify(OK)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await deleteRuntimeStrategy("s:abc")).toEqual(OK);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/runtime-api/v1/strategy-instances/s%3Aabc", { method: "DELETE" });
  });

  it.each([
    ["wrong instance id", { ...OK, strategy_instance_id: "s:other" }],
    ["deleted not true", { ...OK, deleted: false }],
    ["missing deleted", { strategy_instance_id: "s:abc", cancelled_entry_order: false }],
    ["missing cancelled_entry_order", { strategy_instance_id: "s:abc", deleted: true }],
    ["non-boolean cancelled_entry_order", { ...OK, cancelled_entry_order: "no" }],
    ["null body", null],
    ["array body", []],
  ])("rejects a 200 with %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, JSON.stringify(body))));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBeNull();
  });

  it("rejects a 200 with a malformed or empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, "<html>ok</html>")));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, null)));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBeNull();
  });

  it("reads the reason only from a delete_refused body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, JSON.stringify({ status: "delete_refused", reason: "still_enabled" }))));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBe("still_enabled");
  });

  it.each([
    [409, JSON.stringify({ status: "enabled_change_refused", reason: "position_open" })],
    [503, JSON.stringify({ status: "not_ready", reason: "position_open" })],
    [500, JSON.stringify({ status: "internal_error" })],
    [502, "<html>bad gateway</html>"],
    [502, null],
  ])("gives no reason for a %s answer that is not a delete refusal", async (status, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status, body)));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBeNull();
  });

  it("gives no reason on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("down")));
    expect(await reasonOf(deleteRuntimeStrategy("s:abc"))).toBeNull();
  });
});

describe("fetchRuntimeChartLayers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const BODY = {
    strategy_instance_id: "s:abc",
    ema_stack: [
      { role: "fast", timeframe: "base", period: 20, source: "close" },
      { role: "anchor", timeframe: "base", period: 50, source: "close" },
      { role: "slow", timeframe: "base", period: 200, source: "close" },
    ],
    episodes: [{ episode_ref: "e1", params: { fast_period: 20, window_bars: 24 } }],
  };

  it("sends one GET to the chart-layers path and returns the checked body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, JSON.stringify(BODY)));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRuntimeChartLayers("s:abc")).toEqual(BODY);
    expect(fetchMock).toHaveBeenCalledWith("/runtime-api/v1/strategy-instances/s%3Aabc/chart-layers", {
      method: "GET",
      signal: undefined,
    });
  });

  it.each([
    ["wrong instance", { ...BODY, strategy_instance_id: "other" }],
    ["two stack entries", { ...BODY, ema_stack: BODY.ema_stack.slice(0, 2) }],
    ["roles out of order", { ...BODY, ema_stack: [...BODY.ema_stack].reverse() }],
    ["period zero", { ...BODY, ema_stack: [{ ...BODY.ema_stack[0], period: 0 }, ...BODY.ema_stack.slice(1)] }],
    ["episodes missing", { ...BODY, episodes: undefined }],
    ["param not a number", { ...BODY, episodes: [{ episode_ref: "e1", params: { fast_period: "20" } }] }],
  ])("refuses a 200 body that is not the documented shape: %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, JSON.stringify(body))));
    await expect(fetchRuntimeChartLayers("s:abc")).rejects.toBeInstanceOf(RuntimeChartLayersError);
  });

  it("carries Runtime's own reason from a refusal body and none from anything else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(502, JSON.stringify({ status: "chart_layers_refused", reason: "engine_unavailable" }))));
    await expect(fetchRuntimeChartLayers("s:abc")).rejects.toMatchObject({ reason: "engine_unavailable" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(502, JSON.stringify({ reason: "x" }))));
    await expect(fetchRuntimeChartLayers("s:abc")).rejects.toMatchObject({ reason: null });
  });
});

describe("fetchRuntimeStrategyStates", () => {
  const ok = { strategy_instance_id: "s", trade_state: "flat", trade_cycle_id: null, side: null, first_fill_at_ms: null, recovery_pending: null };

  afterEach(() => vi.unstubAllGlobals());

  it("GETs the state route and returns the items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ strategy_instances: [ok] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchRuntimeStrategyStates()).toEqual([ok]);
    expect(fetchMock).toHaveBeenCalledWith("/runtime-api/v1/strategy-instance-states", { method: "GET" });
  });

  it("throws on a non-2xx answer and on an invalid body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(fetchRuntimeStrategyStates()).rejects.toThrow();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ strategy_instances: [{ ...ok, trade_state: "weird" }] }), { status: 200 })),
    );
    await expect(fetchRuntimeStrategyStates()).rejects.toThrow();
  });
});

describe("sendRuntimeCommand", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const OK = { strategy_instance_id: "s:abc", enabled: false, cancelled_entry_order: true };

  async function failureOf(promise: Promise<unknown>): Promise<RuntimeCommandError> {
    try {
      await promise;
    } catch (err) {
      expect(err).toBeInstanceOf(RuntimeCommandError);
      return err as RuntimeCommandError;
    }
    throw new Error("expected a RuntimeCommandError");
  }

  it.each(["close-position", "cancel-entry-orders"] as const)("sends one body-less POST to %s", async (command) => {
    const fetchMock = vi.fn().mockResolvedValue(respond(200, JSON.stringify(OK)));
    vi.stubGlobal("fetch", fetchMock);
    await sendRuntimeCommand("s:abc", command);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/runtime-api/v1/strategy-instances/s%3Aabc/${command}`, { method: "POST" });
  });

  it.each([
    ["wrong instance", { ...OK, strategy_instance_id: "s:other" }],
    ["still enabled", { ...OK, enabled: true }],
    ["null body", null],
  ])("rejects a 200 with %s", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, JSON.stringify(body))));
    const err = await failureOf(sendRuntimeCommand("s:abc", "close-position"));
    expect(err.reason).toBeNull();
  });

  it("reads Runtime's reason and status from a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond(502, JSON.stringify({ status: "enabled_change_refused", reason: "abi_unavailable" }))),
    );
    const err = await failureOf(sendRuntimeCommand("s:abc", "close-position"));
    expect([err.reason, err.httpStatus]).toEqual(["abi_unavailable", 502]);
  });

  it("ignores a reason in a body that is not Runtime's refusal, and survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, JSON.stringify({ reason: "no_position" }))));
    expect((await failureOf(sendRuntimeCommand("s:abc", "close-position"))).reason).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    const err = await failureOf(sendRuntimeCommand("s:abc", "close-position"));
    expect([err.reason, err.httpStatus]).toEqual([null, null]);
  });
});
