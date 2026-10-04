/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { WorkbenchProvider, useWorkbenchReport, useWorkbenchShell } from "@/shared/context/WorkbenchContext";
import { setSessionPersistenceForTests } from "@/shared/session/storage";

vi.mock("@/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/client")>();
  return {
    ...actual,
    fetchRunDetail: vi.fn().mockRejectedValue(new actual.ApiError(500, "boom")),
    fetchRunTrades: vi.fn().mockRejectedValue(new actual.ApiError(500, "boom")),
    fetchRunMetrics: vi.fn().mockResolvedValue(null),
    fetchManagedPolicyEvents: vi.fn().mockResolvedValue({ contract_version: "1.0.0", run_id: "r", events: [] }),
    fetchRunSummaries: vi.fn().mockResolvedValue([]),
    fetchConfigState: vi.fn().mockResolvedValue({ strategy_id: "ema_pullback", selected_experiment_id: null, configs: [], selected_path: null, draft: null }),
  };
});

function Probe({ tab, run }: { tab?: "reports"; run?: string }) {
  const { activeTab, setActiveTab } = useWorkbenchShell();
  const { selectedRunId, setSelectedRunId } = useWorkbenchReport();
  useEffect(() => {
    if (tab) setActiveTab(tab);
    if (run) setSelectedRunId(run);
  }, [tab, run, setActiveTab, setSelectedRunId]);
  return <div data-testid="state">{`${activeTab}|${selectedRunId ?? "none"}`}</div>;
}

describe("workbench session across a page reload", () => {
  beforeEach(() => {
    localStorage.clear();
    setSessionPersistenceForTests(true);
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    setSessionPersistenceForTests(false);
  });

  it("restores the tab and the selected run, and starts clean when persistence is off", async () => {
    const first = render(<WorkbenchProvider><Probe tab="reports" run="run-abc" /></WorkbenchProvider>);
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("reports|run-abc"));
    first.unmount();
    render(<WorkbenchProvider><Probe /></WorkbenchProvider>);
    expect(screen.getByTestId("state").textContent).toBe("reports|run-abc");
    cleanup();
    setSessionPersistenceForTests(false);
    render(<WorkbenchProvider><Probe /></WorkbenchProvider>);
    expect(screen.getByTestId("state").textContent).toBe("surface|none");
    expect(ApiError).toBeDefined();
  });
});
