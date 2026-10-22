import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchRuntimeStrategyInstances,
  RuntimeEnabledError,
  RuntimeListError,
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
