import { createRoot } from "react-dom/client";
import { LibraryBatch } from "../../src/components/batch-classification";

// Fictional items, mounted only by Playwright's intercepted test document.
const root = createRoot(document.getElementById("root")!);
root.render(<LibraryBatch items={[1, 2, 3].map((value) => ({
  id: `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`,
  title: `Sample clip ${value}`,
  projectCode: "SAMPLE",
  projectName: "Fictional test project",
  contentKey: null,
  formatLabel: "Short",
  productionTypeLabel: "Unknown",
  statusLabel: "Draft",
  distributionComplete: 0,
  hasMasterVideo: false,
  hasThumbnail: false,
  updatedLabel: "2026-10-08",
}))} />);
window.addEventListener("test:unmount", () => root.unmount(), { once: true });
