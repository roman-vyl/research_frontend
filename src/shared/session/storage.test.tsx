/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readSession, setSessionPersistenceForTests, writeSession } from "@/shared/session/storage";

describe("session storage", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    setSessionPersistenceForTests(false);
  });

  it("is a no-op until enabled", () => {
    writeSession("k", { a: 1 });
    expect(readSession("k")).toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it("round-trips when enabled and survives a blocked storage", () => {
    setSessionPersistenceForTests(true);
    writeSession("k", { a: 1 });
    expect(readSession<{ a: number }>("k")).toEqual({ a: 1 });
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSession("k")).toBeNull();
    spy.mockRestore();
    render(<span>ok</span>);
    expect(screen.getByText("ok")).toBeTruthy();
  });
});
