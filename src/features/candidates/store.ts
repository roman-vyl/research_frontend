/**
 * The candidate shortlist shared by the Surface (star state, marks) and the Candidates tab.
 * Module-level on purpose: it is not workbench state. Every star or unstar reloads the list.
 */
import { useSyncExternalStore } from "react";

import { listCandidates, starCandidate, unstarCandidate } from "@/api/client";
import type { Candidate, CandidateCoordsRequest } from "@/api/candidates";

export type CandidatesState = {
  candidates: Candidate[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
};

const INITIAL: CandidatesState = { candidates: [], status: "idle", error: null };

let state: CandidatesState = INITIAL;
const listeners = new Set<() => void>();

function set(next: CandidatesState): void {
  state = next;
  for (const l of [...listeners]) l();
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

const message = (e: unknown): string => (e instanceof Error ? e.message : "Request failed.");

/** (Re)loads the list; a failure keeps the previous list and is reported in `error`. */
export async function loadCandidates(): Promise<void> {
  set({ ...state, status: "loading", error: null });
  try {
    const r = await listCandidates();
    set({ candidates: r.candidates, status: "ready", error: null });
  } catch (e) {
    set({ ...state, status: "error", error: message(e) });
  }
}

/** Stars a point by its coordinates (no id is sent); resolves with the stored record after the reload. */
export async function starPoint(experimentId: string, coords: CandidateCoordsRequest): Promise<Candidate> {
  const record = await starCandidate(experimentId, coords);
  await loadCandidates();
  return record;
}

export async function unstarPoint(candidateId: string): Promise<void> {
  await unstarCandidate(candidateId);
  await loadCandidates();
}

export function useCandidates(): CandidatesState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Test helper: forget the loaded list. */
export function resetCandidatesForTests(): void {
  state = INITIAL;
}
