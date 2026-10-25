import { createRoot } from "react-dom/client";
import { CandidatesPanel } from "@/features/candidates/CandidatesPanel";
import { WorkbenchProvider } from "@/shared/context/WorkbenchContext";
import "@/index.css";
createRoot(document.getElementById("root")!).render(<WorkbenchProvider><CandidatesPanel /></WorkbenchProvider>);
