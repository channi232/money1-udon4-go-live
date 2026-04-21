"use client";

import { useMemo, useState } from "react";
import type { WorkflowHistoryEntry } from "@/lib/workflow-state-api";
import { exportCsvChunked } from "@/lib/csv-export";

type Props = {
  open: boolean;
  title: string;
  itemKey: string;
  history: WorkflowHistoryEntry[];
  onClose: () => void;
};

function renderHistory(entry: WorkflowHistoryEntry): string {
  const from = entry.from || "unknown";
  const to = entry.to || "unknown";
  const by = entry.by || "unknown";
  const at = entry.at || "-";
  const reason = entry.reason && entry.reason.trim() !== "" ? ` | reason: ${entry.reason}` : "";
  const transitionId = entry.transitionId && entry.transitionId.trim() !== "" ? ` | id: ${entry.transitionId}` : "";
  return `${from} -> ${to} by ${by} @ ${at}${reason}${transitionId}`;
}

function buildHistorySummaryText(itemKey: string, rows: WorkflowHistoryEntry[]): string {
  const lines: string[] = [];
  lines.push(`Workflow History Summary`);
  lines.push(`Key: ${itemKey}`);
  lines.push(`Total events: ${rows.length}`);
  lines.push("");
  rows.forEach((h, i) => {
    lines.push(`${i + 1}. ${renderHistory(h)}`);
  });
  return lines.join("\n");
}

function downloadTextFile(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportWorkflowHistoryCsv(itemKey: string, rows: WorkflowHistoryEntry[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  const cleanKey = itemKey.replaceAll("|", "_").replaceAll(":", "_").slice(0, 50);
  const header = ["Key", "TransitionId", "From", "To", "By", "At", "Reason", "Summary"];
  const csvRows = rows.map((h) => [
    itemKey,
    h.transitionId || "",
    h.from || "",
    h.to || "",
    h.by || "",
    h.at || "",
    h.reason || "",
    renderHistory(h),
  ]);
  await exportCsvChunked({
    filename: `workflow-history-${cleanKey}-${stamp}.csv`,
    header,
    rows: csvRows,
  });
}

export default function WorkflowHistoryModal({ open, title, itemKey, history, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [toFilter, setToFilter] = useState<"all" | "new" | "in_review" | "approved" | "rejected">("all");
  const [exportStatus, setExportStatus] = useState<"" | "ok" | "error">("");
  const [exportTxtStatus, setExportTxtStatus] = useState<"" | "ok" | "error">("");
  const [copyStatus, setCopyStatus] = useState<"" | "ok" | "error">("");
  if (!open) return null;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return history
      .slice()
      .reverse()
      .filter((h) => {
        if (toFilter !== "all" && h.to !== toFilter) return false;
        if (q === "") return true;
        const hay = `${h.from || ""} ${h.to || ""} ${h.by || ""} ${h.at || ""} ${h.reason || ""} ${h.transitionId || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [history, query, toFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">Key: {itemKey}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                void exportWorkflowHistoryCsv(itemKey, shown)
                  .then(() => setExportStatus("ok"))
                  .catch(() => setExportStatus("error"))
                  .finally(() => {
                    window.setTimeout(() => setExportStatus(""), 1800);
                  });
              }}
            >
              Export History CSV
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                const text = buildHistorySummaryText(itemKey, shown);
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setCopyStatus("ok"))
                  .catch(() => setCopyStatus("error"))
                  .finally(() => {
                    window.setTimeout(() => setCopyStatus(""), 1800);
                  });
              }}
            >
              Copy History Summary
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                try {
                  const stamp = new Date().toISOString().slice(0, 10);
                  const cleanKey = itemKey.replaceAll("|", "_").replaceAll(":", "_").slice(0, 50);
                  const text = buildHistorySummaryText(itemKey, shown);
                  downloadTextFile(`workflow-history-${cleanKey}-${stamp}.txt`, text);
                  setExportTxtStatus("ok");
                } catch {
                  setExportTxtStatus("error");
                }
                window.setTimeout(() => setExportTxtStatus(""), 1800);
              }}
            >
              Export History TXT
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={onClose}
            >
              ปิด
            </button>
          </div>
        </div>
        <div className="max-h-[65vh] overflow-auto p-4">
          {exportStatus === "ok" ? <p className="mb-2 text-xs text-emerald-700">ส่งออก History CSV แล้ว</p> : null}
          {exportStatus === "error" ? <p className="mb-2 text-xs text-rose-700">ส่งออก History CSV ไม่สำเร็จ</p> : null}
          {exportTxtStatus === "ok" ? <p className="mb-2 text-xs text-emerald-700">ส่งออก History TXT แล้ว</p> : null}
          {exportTxtStatus === "error" ? <p className="mb-2 text-xs text-rose-700">ส่งออก History TXT ไม่สำเร็จ</p> : null}
          {copyStatus === "ok" ? <p className="mb-2 text-xs text-emerald-700">คัดลอก History Summary แล้ว</p> : null}
          {copyStatus === "error" ? <p className="mb-2 text-xs text-rose-700">คัดลอก History Summary ไม่สำเร็จ</p> : null}
          <div className="mb-3 grid gap-2 md:grid-cols-3">
            <input
              className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
              placeholder="ค้นหาในประวัติ (ผู้แก้/สถานะ/เวลา)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={toFilter}
              onChange={(e) =>
                setToFilter(e.target.value as "all" | "new" | "in_review" | "approved" | "rejected")
              }
            >
              <option value="all">สถานะทั้งหมด</option>
              <option value="new">to: new</option>
              <option value="in_review">to: in_review</option>
              <option value="approved">to: approved</option>
              <option value="rejected">to: rejected</option>
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-slate-500">ยังไม่มีประวัติการเปลี่ยนสถานะ</p>
          ) : (
            <div className="space-y-2">
              {shown.map((h, i) => (
                <div key={`${h.at || "na"}-${i}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{renderHistory(h)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

