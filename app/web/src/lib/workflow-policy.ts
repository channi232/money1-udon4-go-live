export type ModuleName = "money" | "slip" | "tax";
export type WorkflowRole = "finance" | "personnel" | "admin" | "guest";
export type WorkflowStatus = "new" | "in_review" | "approved" | "rejected";

export type WorkflowAction = {
  id: "start_review" | "approve" | "reject" | "reopen";
  to: WorkflowStatus;
  label: string;
};

export function workflowStatusLabel(status: WorkflowStatus): string {
  switch (status) {
    case "new":
      return "ใหม่";
    case "in_review":
      return "กำลังตรวจสอบ";
    case "approved":
      return "อนุมัติ";
    case "rejected":
      return "ตีกลับ";
    default:
      return status;
  }
}

export function workflowStatusClass(status: WorkflowStatus): string {
  switch (status) {
    case "new":
      return "border-slate-300 bg-slate-50 text-slate-700";
    case "in_review":
      return "border-amber-300 bg-amber-50 text-amber-800";
    case "approved":
      return "border-emerald-300 bg-emerald-50 text-emerald-800";
    case "rejected":
      return "border-rose-300 bg-rose-50 text-rose-800";
    default:
      return "border-slate-300 bg-slate-50 text-slate-700";
  }
}

function roleCanOperate(module: ModuleName, role: WorkflowRole): boolean {
  if (role === "admin") return true;
  if (module === "money") return role === "finance";
  if (module === "slip") return role === "finance" || role === "personnel";
  if (module === "tax") return role === "personnel";
  return false;
}

export function availableWorkflowActions(
  module: ModuleName,
  role: WorkflowRole,
  status: WorkflowStatus,
): WorkflowAction[] {
  if (!roleCanOperate(module, role)) return [];
  if (status === "new") return [{ id: "start_review", to: "in_review", label: "รับเรื่อง" }];
  if (status === "in_review") {
    return [
      { id: "approve", to: "approved", label: "อนุมัติ" },
      { id: "reject", to: "rejected", label: "ตีกลับ" },
    ];
  }
  if (status === "approved") return [{ id: "reopen", to: "in_review", label: "เปิดตรวจใหม่" }];
  return [{ id: "reopen", to: "in_review", label: "แก้ไขแล้วตรวจใหม่" }];
}

export function parseWorkflowState(raw: string | null): Record<string, WorkflowStatus> {
  if (!raw) return {};
  try {
    const data = JSON.parse(raw) as Record<string, WorkflowStatus>;
    if (!data || typeof data !== "object") return {};
    const out: Record<string, WorkflowStatus> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === "new" || v === "in_review" || v === "approved" || v === "rejected") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

