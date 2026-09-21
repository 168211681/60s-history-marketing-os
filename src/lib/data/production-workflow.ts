export type ProductionWorkflowStatus =
  | "queued"
  | "rendering"
  | "rendered"
  | "uploaded_private"
  | "published"
  | "failed"
  | "cancelled";

const transitions: Record<ProductionWorkflowStatus, readonly ProductionWorkflowStatus[]> = {
  queued: ["rendering", "failed", "cancelled"],
  rendering: ["rendered", "failed"],
  rendered: ["uploaded_private", "failed"],
  uploaded_private: ["published", "failed"],
  published: [],
  failed: ["queued"],
  cancelled: [],
};

export function canAdvanceProductionWorkflow(current: ProductionWorkflowStatus, next: ProductionWorkflowStatus) {
  return transitions[current].includes(next);
}
