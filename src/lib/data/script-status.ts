export type ScriptStatus = "draft" | "reviewed" | "approved" | "archived";

export function canAdvanceScriptStatus(current: ScriptStatus, next: ScriptStatus) {
  return (current === "draft" && next === "reviewed") ||
    (current === "reviewed" && next === "approved") ||
    (current !== "archived" && next === "archived");
}
