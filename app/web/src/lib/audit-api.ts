export type AuditModule = "money" | "slip" | "tax";
export type AuditAction = "export_csv" | "print" | "workflow_transition";

export async function trackAudit(module: AuditModule, action: AuditAction, count: number): Promise<void> {
  try {
    await fetch("/api/audit-log.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        module,
        action,
        count,
      }),
    });
  } catch {
    // Fire-and-forget audit logging: ignore network issues on UI flow.
  }
}
