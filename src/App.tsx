import { ChartPanel } from "@/features/chart/ChartPanel";
import { ComposerPanel } from "@/features/composer/ComposerPanel";
import { ReportsPanel } from "@/features/reports/ReportsPanel";
import { SurfaceView } from "@/features/surface/SurfaceView";
import { AppLayout } from "@/shared/layout/AppLayout";
import { WorkbenchGate } from "@/shared/layout/WorkbenchGate";
import { useWorkbenchShell } from "@/shared/context/WorkbenchContext";

function ReportBackedTabs() {
  const { activeTab } = useWorkbenchShell();

  return (
    <>
      <div className="workbench-tab-pane" hidden={activeTab !== "chart"}>
        <ChartPanel />
      </div>
      {activeTab === "reports" && <ReportsPanel />}
    </>
  );
}

function WorkbenchTabs() {
  const { activeTab } = useWorkbenchShell();

  if (activeTab === "composer") {
    return <ComposerPanel />;
  }

  // The Surface pane lives outside the run-loading gate so that it works while no run is
  // selected; like the Chart pane it stays mounted (hidden) so its local state survives.
  return (
    <>
      <div className="workbench-tab-pane" hidden={activeTab !== "surface"}>
        <SurfaceView />
      </div>
      <div className="workbench-tab-pane" hidden={activeTab === "surface"}>
        <WorkbenchGate>
          <ReportBackedTabs />
        </WorkbenchGate>
      </div>
    </>
  );
}

export function App() {
  return (
    <AppLayout>
      <WorkbenchTabs />
    </AppLayout>
  );
}
