import { createRoot } from "react-dom/client";
import { ReviewQueue, ReviewQueueLoading, ReviewQueueUnavailable } from "../../src/components/review-queue";
import type { ReviewFilters, ReviewQueueData } from "../../src/lib/clipforge/review-queue";

declare global {
  interface Window {
    reviewFixture: { filters: ReviewFilters; data: ReviewQueueData; mode?: "loading" | "failure" | "invalid" };
  }
}

// Mounted only in an intercepted browser test document, never in the app.
const { filters, data, mode } = window.reviewFixture;
const root = createRoot(document.getElementById("root")!);
window.addEventListener("test:unmount", () => root.unmount());
root.render(
  mode === "loading" ? <ReviewQueueLoading /> : mode ? <ReviewQueueUnavailable invalid={mode === "invalid"} /> : <ReviewQueue filters={filters} data={data} />,
);
