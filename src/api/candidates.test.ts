import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, listCandidates, starCandidate, unstarCandidate } from "@/api/client";

const reply = (status: number, body: unknown) =>
  vi.fn().mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

describe("candidates API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists, stars by coordinates and unstars by id", async () => {
    const f = reply(200, { candidates: [] });
    vi.stubGlobal("fetch", f);
    await listCandidates();
    expect(f.mock.calls[0][0]).toBe("/api/research/candidates");

    await starCandidate("exp", { sl: 5, grid: "R", be_trigger: null });
    const [url, init] = f.mock.calls[1];
    expect(url).toBe("/api/research/candidates");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ experiment_id: "exp", coords: { sl: 5, grid: "R", be_trigger: null } });

    await unstarCandidate("cand/1");
    expect(f.mock.calls[2][0]).toBe("/api/research/candidates/cand%2F1");
    expect(f.mock.calls[2][1].method).toBe("DELETE");
    expect(f.mock.calls.some((c) => String(c[0]).includes("/api/research/runs"))).toBe(false);
  });

  it("surfaces the service message of an error body", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "ambiguous_row", message: "several rows match" }));
    const err = await starCandidate("exp", { sl: 5 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.detail).toBe("several rows match");
  });
});
