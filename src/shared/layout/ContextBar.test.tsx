/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextBar } from "@/shared/layout/ContextBar";

vi.mock("@/shared/context/WorkbenchContext", () => ({
  useWorkbenchReport: () => ({
    symbol: "BTCUSDT.P",
    timeframe: "5m",
    instanceId: "instance_1",
    runs: [{ run_id: "run-a" }, { run_id: "run-b" }],
    selectedRunId: "run-b",
    setSelectedRunId: vi.fn(),
  }),
}));

describe("ContextBar", () => {
  afterEach(cleanup);

  it("shows the selected run id as text and no legacy run dropdown", () => {
    render(<ContextBar />);
    expect(screen.getByText("run-b")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});
