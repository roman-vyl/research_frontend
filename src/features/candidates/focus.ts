/**
 * Tiny channel from the Candidates tab to the Surface: "show this candidate's point". The Surface stays
 * mounted (hidden) and subscribes; the tab never touches Surface state itself.
 */
import type { CandidateCoords } from "@/api/candidates";

export type FocusRequest = { experimentId: string; coords: CandidateCoords };

type Listener = (request: FocusRequest) => void;

const listeners = new Set<Listener>();

export function subscribeFocus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitFocus(request: FocusRequest): void {
  for (const listener of [...listeners]) listener(request);
}
