/**
 * Optional browser-side memory of the workbench session (tab, selected run and trade, Surface controls),
 * so a page refresh keeps them. Off until `enableSessionPersistence()` is called by the app entry point,
 * so tests and embedded uses start clean. Every access is guarded: storage may be blocked or empty.
 */
let enabled = false;

export function enableSessionPersistence(): void {
  enabled = true;
}

const PREFIX = "research-workbench.";

export function readSession<T>(key: string): T | null {
  if (!enabled) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: unknown): void {
  if (!enabled) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage is a convenience only */
  }
}

/** Test helper: switch persistence on/off. */
export function setSessionPersistenceForTests(on: boolean): void {
  enabled = on;
}
