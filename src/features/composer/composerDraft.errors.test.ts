import { describe, expect, it } from "vitest";
import type { ValidationErrorItem } from "../../api/types";
import {
  anyInstanceMetaHasError,
  COMPOSER_DEFAULT_EXPERIMENT_ID,
  createBlankConfigDraft,
  errorsForInstanceMeta,
  errorsForPath,
} from "./composerDraft";

function err(path: string): ValidationErrorItem {
  return { path, message: path };
}

describe("createBlankConfigDraft", () => {
  it("uses non-empty experiment_id and canonical reclaim_anchor trigger", () => {
    const draft = createBlankConfigDraft();
    expect(draft.experiment_id).toBe(COMPOSER_DEFAULT_EXPERIMENT_ID);
    expect(draft.experiment_id.trim().length).toBeGreaterThan(0);
    const strategy = draft.instances[0]?.raw_spec as {
      setups?: { component_id: string }[];
      trigger?: { component_id: string; lookback: number };
    };
    expect(strategy?.setups?.[0]).toMatchObject({
      component_id: "untouched_anchor_setup",
    });
    expect(strategy?.trigger).toEqual({
      component_id: "reclaim_anchor",
      lookback: 1,
    });
    const blockers = (strategy as { blockers?: { component_id: string }[] } | undefined)?.blockers;
    expect(blockers?.[0]).toMatchObject({ component_id: "no_blockers" });
  });
});

describe("errorsForInstanceMeta", () => {
  it("includes enabled/strategy_id/ticker/base_timeframe only", () => {
    const errors = [
      err("instances[0].enabled"),
      err("instances[0].ticker"),
      err("instances[0].raw_spec.anchor_stack"),
      err("instances[0].raw_spec.setup.component_id"),
      err("instances[1].ticker"),
    ];
    expect(errorsForInstanceMeta(errors, 0).map((e) => e.path)).toEqual([
      "instances[0].enabled",
      "instances[0].ticker",
    ]);
    expect(errorsForInstanceMeta(errors, 1).map((e) => e.path)).toEqual(["instances[1].ticker"]);
  });

  it("does not match ticker prefix on other field names", () => {
    const errors = [err("instances[0].ticker_extra")];
    expect(errorsForInstanceMeta(errors, 0)).toEqual([]);
  });
});

describe("anyInstanceMetaHasError", () => {
  it("is false when only non-meta instance paths fail", () => {
    const errors = [err("instances[0].raw_spec.blockers[0].component_id")];
    expect(anyInstanceMetaHasError(errors, 1)).toBe(false);
  });

  it("is true when any instance has meta field errors", () => {
    const errors = [err("instances[2].ticker")];
    expect(anyInstanceMetaHasError(errors, 3)).toBe(true);
  });
});

describe("errorsForPath vs instance root", () => {
  it("instance root prefix matches nested raw_spec errors", () => {
    const errors = [err("instances[0].raw_spec.anchor_stack")];
    expect(errorsForPath(errors, "instances[0]").length).toBe(1);
    expect(errorsForInstanceMeta(errors, 0).length).toBe(0);
  });
});
