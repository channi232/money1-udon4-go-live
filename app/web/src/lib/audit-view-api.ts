export type AuditRow = {
  ts: string;
  username: string;
  module: "money" | "slip" | "tax";
  action: "export_csv" | "print" | "workflow_transition";
  count: number;
  ip?: string;
  ua?: string;
};

export type AuditViewResponse = {
  ok: boolean;
  count: number;
  rows: AuditRow[];
  message?: string;
};

export async function fetchAuditRows(params: {
  module?: string;
  action?: string;
  username?: string;
  limit?: number;
}): Promise<AuditViewResponse> {
  try {
    const search = new URLSearchParams();
    if (params.module && params.module !== "ทั้งหมด") search.set("module", params.module);
    if (params.action && params.action !== "ทั้งหมด") search.set("action", params.action);
    if (params.username && params.username.trim() !== "") search.set("username", params.username.trim());
    search.set("limit", String(params.limit ?? 200));

    const res = await fetch(`/api/audit-view.php?${search.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return { ok: false, count: 0, rows: [], message: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as AuditViewResponse;
    if (!data || !Array.isArray(data.rows)) return { ok: false, count: 0, rows: [], message: "invalid_payload" };
    return data;
  } catch {
    return { ok: false, count: 0, rows: [], message: "network_error" };
  }
}
