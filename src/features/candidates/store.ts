/**
 * The candidate shortlist shared by the Surface (star state, marks) and the Candidates tab.
 * Module-level on purpose: it is not workbench state. Every star or unstar reloads the list.
 */
import { useSyncExternalStore } from "react";

import { ApiError, exportCandidateToRuntime, listCandidates, starCandidate, unstarCandidate } from "@/api/client";
import type { Candidate, CandidateCoordsRequest, RuntimeExportResult } from "@/api/candidates";

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

/**
 * Removes several candidates one by one, then reloads the list once (also after a failure).
 * Rejects with the first error; the ids before it are already removed.
 */
export async function unstarPoints(candidateIds: readonly string[]): Promise<void> {
  try {
    for (const id of candidateIds) await unstarCandidate(id);
  } finally {
    await loadCandidates();
  }
}

/**
 * Exports the stored spec snapshot to the Runtime catalog (a new file, switched off) and reloads the list.
 * When the service reports that the file or its identity is already there, the list is reloaded too, so the row shows it.
 */
export async function exportToRuntime(candidateId: string): Promise<RuntimeExportResult> {
  try {
    const result = await exportCandidateToRuntime(candidateId);
    await loadCandidates();
    return result;
  } catch (e) {
    if (e instanceof ApiError && (e.code === "runtime_duplicate" || e.code === "runtime_file_exists")) await loadCandidates();
    throw e;
  }
}

export function useCandidates(): CandidatesState {
  return useSyncExternalStore(subscribe, () => state);
}

/** Test helper: forget the loaded list. */
export function resetCandidatesForTests(): void {
  state = INITIAL;
}
