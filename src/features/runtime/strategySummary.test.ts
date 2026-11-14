import { describe, expect, it } from "vitest";

import type { Candidate } from "@/api/candidates";
import type { RuntimeStrategyInstance } from "@/api/runtime";
import {
  indexCandidatesByRuntimeFile,
  summarizeRuntimeStrategy,
} from "@/features/runtime/strategySummary";

function runtime(instrument = "ETHUSDT.P", sourcePath = "strategy.json"): RuntimeStrategyInstance {
  return {
    strategy_instance_id: "strategy:fixture",
    strategy_id: "strategy",
    instrument,
    base_timeframe: "5m",
    enabled: false,
    source_path: sourcePath,
  };
}

type FixtureOptions = {
  instrument?: string;
  width?: string;
  lookback?: string;
  sl?: string;
  tp?: string;
  adx?: { timeframe: string; delta: number; management: "trail" | "break-even"; distance?: number };
  td?: { trigger: string; distance: string };
  touch?: number;
};

function candidate(options: FixtureOptions = {}, file = "strategy.json"): Candidate {
  const phaseRules: Record<string, unknown>[] = [];
  const stopManagement: Record<string, unknown>[] = [];
  const takeManagement: Record<string, unknown>[] = [];
  if (options.adx) {
    const phase = options.adx.management === "trail" ? "runner" : "protected";
    phaseRules.push({
      rule_id: "adx-phase",
      to_phase: phase,
      condition: {
        component_id: "composite_phase_condition",
        params: {
          children: [
            {
              child_id: "rise",
              condition: {
                component_id: "change_since_entry",
                params: {
                  op: ">=",
                  operand: { feature: { kind: "adx", timeframe: options.adx.timeframe, params: { period: 14 } } },
                  value: options.adx.delta,
                },
              },
            },
            { child_id: "di", predicate: { kind: "compare" } },
          ],
          paths: [{ path_id: "rise_di", require: ["rise", "di"] }],
        },
      },
    });
    stopManagement.push(
      options.adx.management === "trail"
        ? {
            rule_id: "adx-trail",
            activate_when: { phase_at_least: phase },
            component_id: "initial_r_trailing_stop",
            params: { trigger_r: options.adx.distance, trail_distance_r: options.adx.distance },
          }
        : {
            rule_id: "adx-be",
            activate_when: { phase_at_least: phase },
            component_id: "break_even_stop",
            params: { buffer_type: "none", buffer: 0 },
          },
    );
  }
  if (options.td) {
    phaseRules.push({
      rule_id: "td-runner",
      to_phase: "runner",
      condition: { component_id: "mfe_r", params: { threshold: Number(options.td.trigger) } },
    });
    stopManagement.push({
      rule_id: "td-trail",
      activate_when: { phase_at_least: "runner" },
      component_id: "initial_r_trailing_stop",
      params: { trigger_r: Number(options.td.trigger), trail_distance_r: Number(options.td.distance) },
    });
    takeManagement.push({
      rule_id: "td-cancel-tp",
      activate_when: { phase_at_least: "runner" },
      component_id: "take_profile_switch",
      params: { action: "disable_fixed_tp" },
    });
  }
  const setups: Record<string, unknown>[] = [
    { component_id: "anchor_stack_width_setup", instance_id: "width1", params: {} },
    { component_id: "untouched_anchor_setup", instance_id: "untouched1", params: {} },
    { component_id: "weighted_vote_setup", instance_id: "votes", params: {} },
  ];
  if (options.touch !== undefined) {
    setups.push({
      component_id: "composite_setup",
      instance_id: "touch_max",
      params: {
        children: [
          {
            child_id: "touch",
            predicate: {
              kind: "range",
              operand: { episode: { ref: "trend", field: "touch_number" } },
              min: 1,
              max: options.touch,
              bounds: "inclusive",
            },
          },
        ],
        paths: [{ path_id: "pass", require: ["touch"] }],
      },
    });
  }
  return {
    candidate_id: `candidate-${file}`,
    experiment_id: "experiment",
    coords: {
      width: options.width ?? "5",
      lookback: options.lookback ?? "280",
      sl: options.sl ?? "5",
      tp_ratio: options.tp ?? "4",
      td_trigger_r: options.td?.trigger ?? null,
      td_distance_r: options.td?.distance ?? null,
    },
    picked_at: "2026-11-14T00:00:00Z",
    fingerprint_fields: [],
    fingerprint: "fixture",
    table_key: { mtime_ns: 1, size: 1 },
    snapshot: { metrics: {}, provenance: null, run_id: "run", row_columns: {} },
    strategy_spec_snapshot: {
      source: "run_request",
      run_id: "run",
      spec: {
        strategy_id: "strategy",
        ticker: options.instrument ?? "ETHUSDT.P",
        base_timeframe: "5m",
        raw_spec: {
          components: { direction: "ema_anchor_stack_trend", risk: "no_risk_filter", trigger: { component_id: "touch_anchor" } },
          setups,
          trade_management: {
            exit_policy: {
              always_on: {
                exits: [
                  { component_id: "atr_stop_loss", exit_kind: "stop_loss", distance: { multiplier: 5 } },
                  { component_id: "atr_take_profit", exit_kind: "take_profit", distance: { multiplier: 20 } },
                ],
              },
            },
            exit_management: { mode: "managed", phase_rules: phaseRules, stop_management: stopManagement, take_management: takeManagement },
          },
        },
      },
    },
    current: { row_state: "same", run_id: "run", provenance: null, metrics: {}, meaning: null, runtime: { present: true, file, enabled: false } },
  };
}

describe("indexCandidatesByRuntimeFile", () => {
  it("indexes only exact, non-duplicate Runtime files with a stored run-request spec", () => {
    const accepted = candidate({}, "accepted.json");
    const noFile = candidate({}, "absent.json");
    noFile.current!.runtime = { present: false };
    const duplicate = candidate({}, "duplicate.json");
    duplicate.current!.runtime = { present: true, duplicate: true, files: ["a.json", "b.json"] };
    const noSpec = candidate({}, "no-spec.json");
    noSpec.strategy_spec_snapshot = { source: null, run_id: "run", reason: "gone" };

    const index = indexCandidatesByRuntimeFile([accepted, noFile, duplicate, noSpec]);

    expect(index.get("accepted.json")).toBe(accepted);
    expect(index.has("absent.json")).toBe(false);
    expect(index.has("duplicate.json")).toBe(false);
    expect(index.has("no-spec.json")).toBe(false);
  });

  it("marks a repeated exact file association ambiguous", () => {
    const index = indexCandidatesByRuntimeFile([candidate({}, "same.json"), candidate({}, "same.json")]);
    expect(index.has("same.json")).toBe(true);
    expect(index.get("same.json")).toBeNull();
  });
});

describe("summarizeRuntimeStrategy", () => {
  it("formats ADX trailing with deterministic tokens and decimal commas", () => {
    const result = summarizeRuntimeStrategy(
      runtime(),
      candidate({ adx: { timeframe: "5m", delta: 46.5, management: "trail", distance: 1.5 } }),
    );
    expect(result).toEqual({
      kind: "summary",
      heading: "ETH · 5/280",
      details: ["SL 5", "TP 4", "ADX 5m Δ46,5", "D 1,5R"],
      text: "ETH · 5/280 · SL 5 · TP 4 · ADX 5m Δ46,5 · D 1,5R",
    });
  });

  it("formats initial-R trailing", () => {
    const result = summarizeRuntimeStrategy(
      runtime(),
      candidate({ width: "7", lookback: "170", sl: "4.75", td: { trigger: "3", distance: "0.75" } }),
    );
    expect(result).toEqual({
      kind: "summary",
      heading: "ETH · 7/170",
      details: ["SL 4,75", "TP 4", "TD 3/0,75R"],
      text: "ETH · 7/170 · SL 4,75 · TP 4 · TD 3/0,75R",
    });
  });

  it("formats an inclusive touch cap after TD", () => {
    const result = summarizeRuntimeStrategy(
      runtime(),
      candidate({ width: "7", lookback: "290", tp: "5", td: { trigger: "3.75", distance: "2" }, touch: 2 }),
    );
    expect(result).toEqual({
      kind: "summary",
      heading: "ETH · 7/290",
      details: ["SL 5", "TP 5", "TD 3,75/2R", "касания ≤2"],
      text: "ETH · 7/290 · SL 5 · TP 5 · TD 3,75/2R · касания ≤2",
    });
  });

  it("orders ADX break-even before TD and preserves known non-displayed components", () => {
    const result = summarizeRuntimeStrategy(
      runtime("SOLUSDT.P"),
      candidate({
        width: "4.0",
        lookback: "240",
        sl: "6.0",
        tp: "6",
        adx: { timeframe: "15m", delta: 23.5, management: "break-even" },
        td: { trigger: "4.5", distance: "1.0" },
      }),
    );
    expect(result).toEqual({
      kind: "summary",
      heading: "SOL · 4/240",
      details: ["SL 6", "TP 6", "BE по ADX 15m Δ23,5", "TD 4,5/1R"],
      text: "SOL · 4/240 · SL 6 · TP 6 · BE по ADX 15m Δ23,5 · TD 4,5/1R",
    });
  });

  it("keeps an unrecognized instrument intact", () => {
    expect(summarizeRuntimeStrategy(runtime("ETH-PERP"), candidate())).toEqual({
      kind: "summary",
      heading: "ETH-PERP · 5/280",
      details: ["SL 5", "TP 4"],
      text: "ETH-PERP · 5/280 · SL 5 · TP 4",
    });
  });

  it("ignores current meaning and metrics", () => {
    const stored = candidate();
    stored.current!.meaning = {
      experiment_id: "other",
      title: "changed",
      ticker: "BTCUSDT.P",
      anchor: "changed",
      coords: [{ id: "width", label: "Width", value: 999, unit: null }],
      fixed_params: null,
    };
    stored.current!.metrics = { net_pnl: -999 };
    expect(summarizeRuntimeStrategy(runtime(), stored)).toEqual({
      kind: "summary",
      heading: "ETH · 5/280",
      details: ["SL 5", "TP 4"],
      text: "ETH · 5/280 · SL 5 · TP 4",
    });
  });

  it("fails closed for unknown and malformed known components", () => {
    const unknown = candidate();
    const unknownSnapshot = unknown.strategy_spec_snapshot;
    const unknownRaw = unknownSnapshot?.source === "run_request"
      ? (unknownSnapshot.spec.raw_spec as Record<string, unknown>)
      : {};
    (unknownRaw.setups as unknown[]).push({ component_id: "future_filter", params: {} });

    const malformed = candidate({ adx: { timeframe: "5m", delta: 10, management: "break-even" } });
    const malformedSnapshot = malformed.strategy_spec_snapshot;
    const malformedRaw = malformedSnapshot?.source === "run_request"
      ? (malformedSnapshot.spec.raw_spec as Record<string, unknown>)
      : {};
    const exitManagement = ((malformedRaw.trade_management as Record<string, unknown>).exit_management as Record<string, unknown>);
    const phase = (exitManagement.phase_rules as Record<string, unknown>[])[0];
    ((phase.condition as Record<string, unknown>).params as Record<string, unknown>).children = [];

    expect(summarizeRuntimeStrategy(runtime(), unknown)).toEqual({ kind: "unsupported" });
    expect(summarizeRuntimeStrategy(runtime(), malformed)).toEqual({ kind: "unsupported" });
  });

  it("never throws for malformed JSON-like input", () => {
    const malformed = candidate();
    if (malformed.strategy_spec_snapshot?.source === "run_request") {
      malformed.strategy_spec_snapshot.spec.raw_spec = { setups: "not-an-array" };
    }
    expect(() => summarizeRuntimeStrategy(runtime(), malformed)).not.toThrow();
    expect(summarizeRuntimeStrategy(runtime(), malformed)).toEqual({ kind: "unsupported" });
  });
});
