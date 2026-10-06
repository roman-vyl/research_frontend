import "@/shared/diagnostics/pipelineDebug";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/App";
import { WorkbenchProvider } from "@/shared/context/WorkbenchContext";
import { enableSessionPersistence } from "@/shared/session/storage";
import "@/index.css";

enableSessionPersistence();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WorkbenchProvider>
      <App />
    </WorkbenchProvider>
  </StrictMode>,
);
