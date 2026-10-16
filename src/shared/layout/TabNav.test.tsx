/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TabNav } from "@/shared/layout/TabNav";

const setActiveTab = vi.fn();

vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbenchShell: () => ({ activeTab: "surface", setActiveTab }),
}));

describe("TabNav", () => {
  afterEach(() => {
    cleanup();
    setActiveTab.mockReset();
  });

  it("lists Runtime Dashboard right after Candidates and keeps the other tabs", () => {
    render(<TabNav />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Chart", "Surface", "Candidates", "Runtime Dashboard", "Reports", "Strategy Composer"]);
  });

  it("activates the runtime tab", () => {
    render(<TabNav />);
    fireEvent.click(screen.getByRole("button", { name: "Runtime Dashboard" }));
    expect(setActiveTab).toHaveBeenCalledWith("runtime");
  });
});
