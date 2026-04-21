export type WorkflowTransitionRow = {
  transitionId: string;
  key: string;
  module: "money" | "slip" | "tax";
  from: "new" | "in_review" | "approved" | "rejected";
  to: "new" | "in_review" | "approved" | "rejected";
  reason?: string;
  by: string;
  at: string;
};

export type WorkflowTransitionResponse = {
  ok: boolean;
  count: number;
  rows: WorkflowTransitionRow[];
  message?: string;
};

export async function fetchWorkflowTransitions(params: {
  module?: string;
  key?: string;
  from?: string;
  to?: string;
  by?: string;
  q?: string;
  fromAt?: string;
  toAt?: string;
  limit?: number;
}): Promise<WorkflowTransitionResponse> {
  try {
    const search = new URLSearchParams();
    if (params.module && params.module !== "ทั้งหมด") search.set("module", params.module);
    if (params.key && params.key.trim() !== "") search.set("key", params.key.trim());
    if (params.from && params.from !== "ทั้งหมด") search.set("from", params.from);
    if (params.to && params.to !== "ทั้งหมด") search.set("to", params.to);
    if (params.by && params.by.trim() !== "") search.set("by", params.by.trim());
    if (params.q && params.q.trim() !== "") search.set("q", params.q.trim());
    if (params.fromAt && params.fromAt.trim() !== "") search.set("from_at", params.fromAt.trim());
    if (params.toAt && params.toAt.trim() !== "") search.set("to_at", params.toAt.trim());
    search.set("limit", String(params.limit ?? 300));

    const res = await fetch(`/api/workflow-transition-view.php?${search.toString()}`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, count: 0, rows: [], message: `HTTP ${res.status}` };
    const data = (await res.json()) as WorkflowTransitionResponse;
    if (!data || !Array.isArray(data.rows)) return { ok: false, count: 0, rows: [], message: "invalid_payload" };
    return data;
  } catch {
    return { ok: false, count: 0, rows: [], message: "network_error" };
  }
}
