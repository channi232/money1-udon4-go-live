import type { WorkflowStatus } from "@/lib/workflow-policy";

export type WorkflowHistoryEntry = {
  from?: WorkflowStatus | "";
  to?: WorkflowStatus | "";
  by?: string;
  at?: string;
  reason?: string;
  transitionId?: string;
};

export type WorkflowMeta = {
  status: WorkflowStatus;
  updatedBy?: string;
  updatedAt?: string;
  history?: WorkflowHistoryEntry[];
};

type WorkflowMapResponse = {
  ok: boolean;
  map: Record<string, WorkflowMeta>;
  count: number;
  message?: string;
  /** database = เก็บใน MySQL (db-config), file = logs/workflow-state.json */
  persistence?: "database" | "file";
};

export async function fetchWorkflowMap(): Promise<WorkflowMapResponse> {
  try {
    const res = await fetch("/api/workflow-state.php", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return { ok: false, map: {}, count: 0, message: `HTTP ${res.status}` };
    const data = (await res.json()) as WorkflowMapResponse;
    if (!data || typeof data !== "object" || !data.map || typeof data.map !== "object") {
      return { ok: false, map: {}, count: 0, message: "invalid_payload" };
    }
    return data;
  } catch {
    return { ok: false, map: {}, count: 0, message: "network_error" };
  }
}

export async function saveWorkflowStatus(
  key: string,
  status: WorkflowStatus,
  reason?: string,
): Promise<{
  ok: boolean;
  message?: string;
  meta?: WorkflowMeta;
  transitionId?: string;
  persistence?: "database" | "file";
}> {
  try {
    const res = await fetch("/api/workflow-state.php", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ key, status, reason: reason ?? "" }),
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}` };
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      meta?: WorkflowMeta;
      transitionId?: string;
      persistence?: "database" | "file";
    };
    return {
      ok: data?.ok === true,
      message: data?.message,
      meta: data?.meta,
      transitionId: data?.transitionId,
      persistence: data?.persistence,
    };
  } catch {
    return { ok: false, message: "network_error" };
  }
}
