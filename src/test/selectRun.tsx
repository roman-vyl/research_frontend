import { useEffect } from "react";

import { useWorkbenchReport } from "@/shared/context/WorkbenchContext";

/**
 * Test helper: the workbench starts with no selected run, so tests that exercise a loaded run
 * select it explicitly, the way Surface "Open run" does (through the existing `setSelectedRunId`).
 */
export function SelectRunOnMount({ runId }: { runId: string }) {
  const { setSelectedRunId } = useWorkbenchReport();
  useEffect(() => {
    setSelectedRunId(runId);
  }, [runId, setSelectedRunId]);
  return null;
}
