"use client";

import AuthGuard from "@/components/auth-guard";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchMoneyRows, type MoneyApiResponse, type MoneyRow } from "@/lib/money-api";
import { trackAudit } from "@/lib/audit-api";
import { exportCsvChunked } from "@/lib/csv-export";
import { fetchSession, type ServerSession } from "@/lib/auth-api";
import {
  availableWorkflowActions,
  type WorkflowStatus,
  workflowStatusClass,
  workflowStatusLabel,
} from "@/lib/workflow-policy";
import { fetchWorkflowMap, saveWorkflowStatus, type WorkflowMeta } from "@/lib/workflow-state-api";
import WorkflowHistoryModal from "@/components/workflow-history-modal";

function formatMoneyDate(raw: string): string {
  const value = (raw || "").trim();
  if (!value) return "-";
  if (/^\d{4}$/.test(value)) return `ปี ${value}`;
  if (/^\d{6}$/.test(value)) return `${value.slice(4, 6)}/${value.slice(0, 4)}`;
  return value;
}

async function exportMoneyCsv(rows: MoneyRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["เลขที่รายการ", "ชื่อบุคลากร", "งวดข้อมูล", "จำนวนเงิน", "สถานะ"];
  const dataRows = rows.map((r) => [r.id, r.school, formatMoneyDate(r.date), String(r.amount), r.status]);
  await exportCsvChunked({
    filename: `money-report-${stamp}.csv`,
    header,
    rows: dataRows,
  });
}

function printMoneyReport(rowCount: number, ensureAllVisible: () => void) {
  void trackAudit("money", "print", rowCount);
  ensureAllVisible();
  window.setTimeout(() => window.print(), 0);
}

function workflowHistoryText(meta?: WorkflowMeta): string {
  const list = Array.isArray(meta?.history) ? meta?.history : [];
  if (list.length === 0) return "-";
  const last = list[list.length - 1];
  return `${last.from || "new"} -> ${last.to || "-"} by ${last.by || "unknown"} @ ${last.at || "-"}`;
}

export default function MoneyPage() {
  const PAGE_SIZE = 150;
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [status, setStatus] = useState("ทั้งหมด");
  const [workflowFilter, setWorkflowFilter] = useState<"all" | WorkflowStatus>("all");
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [bulkMessage, setBulkMessage] = useState("");
  const [lastBulkChanges, setLastBulkChanges] = useState<Array<{ key: string; from: WorkflowStatus; to: WorkflowStatus }>>([]);
  const [rows, setRows] = useState<MoneyRow[]>([]);
  const [session, setSession] = useState<ServerSession | null>(null);
  const [workflowState, setWorkflowState] = useState<Record<string, WorkflowMeta>>({});
  const [historyTarget, setHistoryTarget] = useState<{ key: string; title: string; history: NonNullable<WorkflowMeta["history"]> } | null>(null);
  const [source, setSource] = useState<"database" | "fallback">("fallback");
  const [loading, setLoading] = useState(true);
  const [apiMessage, setApiMessage] = useState("");
  const [moneyMeta, setMoneyMeta] = useState<MoneyApiResponse["meta"]>(undefined);
  const [apiDiag, setApiDiag] = useState<{ requestId?: string; errorCode?: string; stage?: string }>({});
  const [copiedTrace, setCopiedTrace] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSession().then((s) => {
      if (active) setSession(s);
    });
    fetchWorkflowMap().then((w) => {
      if (active && w.ok) setWorkflowState(w.map || {});
    });
    fetchMoneyRows().then((data) => {
      if (!active) return;
      setRows(data.rows);
      setSource(data.source);
      setApiMessage(data.message || "");
      setMoneyMeta(data.meta);
      setApiDiag({
        requestId: data.request_id,
        errorCode: data.error_code,
        stage: data.debug?.trace?.stage,
      });
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const saveWorkflowForKey = async (
    key: string,
    to: WorkflowStatus,
    fallback: WorkflowStatus,
    reason = "",
  ): Promise<boolean> => {
    const prev = workflowState[key] ?? { status: "new" as WorkflowStatus, updatedBy: "", updatedAt: "" };
    setWorkflowState((state) => ({
      ...state,
      [key]: { status: to, updatedBy: "กำลังบันทึก...", updatedAt: new Date().toISOString() },
    }));
    const saved = await saveWorkflowStatus(key, to, reason);
    if (!saved.ok) {
      setWorkflowState((state) => ({ ...state, [key]: prev.status ? prev : { status: fallback, updatedBy: "", updatedAt: "" } }));
      return false;
    }
    if (saved.meta) {
      setWorkflowState((state) => ({ ...state, [key]: saved.meta as WorkflowMeta }));
    }
    return true;
  };

  const updateWorkflow = (key: string, to: WorkflowStatus, fallback: WorkflowStatus) => {
    const reason = to === "rejected" ? window.prompt("ระบุเหตุผลการตีกลับ", "") || "" : "";
    if (to === "rejected" && reason.trim() === "") return;
    void saveWorkflowForKey(key, to, fallback, reason).then((ok) => {
      if (ok) void trackAudit("money", "workflow_transition", 1);
    });
  };

  const toMoneyWorkflowStatus = (raw: string): WorkflowStatus => {
    const s = raw.trim();
    if (s === "อนุมัติแล้ว") return "approved";
    if (s === "ตีกลับ") return "rejected";
    if (s === "รอตรวจสอบ") return "in_review";
    return "new";
  };

  const bulkApply = async (to: WorkflowStatus) => {
    if (selectedCount <= 0) {
      setBulkMessage("ยังไม่ได้เลือกรายการสำหรับ Bulk action");
      return;
    }
    const actionLabel = to === "in_review" ? "รับเรื่อง" : to === "approved" ? "อนุมัติ" : "ตีกลับ";
    const ok = window.confirm(`ยืนยัน ${actionLabel} จำนวน ${selectedCount} รายการใช่หรือไม่?`);
    if (!ok) return;
    const bulkReason = to === "rejected" ? window.prompt("ระบุเหตุผลการตีกลับ (ใช้กับทุกรายการในรอบนี้)", "") || "" : "";
    if (to === "rejected" && bulkReason.trim() === "") return;
    const rowsByKey = new Map<string, MoneyRow>(filtered.map((r) => [`money:${r.id}` as string, r]));
    let success = 0;
    let skippedNoRow = 0;
    let skippedInvalidTransition = 0;
    let failedSave = 0;
    const applied: Array<{ key: string; from: WorkflowStatus; to: WorkflowStatus }> = [];
    for (const key of visibleKeys) {
      if (!selectedKeys[key]) continue;
      const row = rowsByKey.get(key);
      if (!row) {
        skippedNoRow += 1;
        continue;
      }
      const current = workflowState[key]?.status ?? toMoneyWorkflowStatus(row.status);
      const actions = availableWorkflowActions("money", session?.role ?? "guest", current);
      if (!actions.some((a) => a.to === to)) {
        skippedInvalidTransition += 1;
        continue;
      }
      const ok = await saveWorkflowForKey(key, to, current, bulkReason);
      if (ok) {
        success += 1;
        applied.push({ key, from: current, to });
      }
      else failedSave += 1;
    }
    if (success > 0) void trackAudit("money", "workflow_transition", success);
    setLastBulkChanges(applied);
    setBulkMessage(
      `Bulk result: สำเร็จ ${success}, ข้าม(สิทธิ์/transition) ${skippedInvalidTransition}, ข้าม(ไม่พบแถว) ${skippedNoRow}, บันทึกไม่สำเร็จ ${failedSave}`,
    );
    setSelectedKeys({});
  };

  const undoLastBulk = async () => {
    if (lastBulkChanges.length === 0) {
      setBulkMessage("ไม่มีรายการ bulk ล่าสุดให้ย้อนกลับ");
      return;
    }
    const ok = window.confirm(`ยืนยันย้อนกลับ bulk ล่าสุดจำนวน ${lastBulkChanges.length} รายการใช่หรือไม่?`);
    if (!ok) return;
    let success = 0;
    let failed = 0;
    for (const item of lastBulkChanges) {
      const reverted = await saveWorkflowForKey(item.key, item.from, item.to, item.from === "rejected" ? "undo bulk" : "");
      if (reverted) success += 1;
      else failed += 1;
    }
    if (success > 0) void trackAudit("money", "workflow_transition", success);
    setBulkMessage(`Undo result: สำเร็จ ${success}, บันทึกไม่สำเร็จ ${failed}`);
    if (failed === 0) setLastBulkChanges([]);
  };

  const filtered = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ = needle === "" || `${r.id} ${r.school}`.toLowerCase().includes(needle);
      const matchesStatus = status === "ทั้งหมด" || r.status === status;
      const key = `money:${r.id}`;
      const workflow = workflowState[key]?.status ?? toMoneyWorkflowStatus(r.status);
      const matchesWorkflow = workflowFilter === "all" || workflow === workflowFilter;
      return matchesQ && matchesStatus && matchesWorkflow;
    });
  }, [deferredQ, status, rows, workflowState, workflowFilter]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredQ, status, rows]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleRows.length < filtered.length;
  const workflowSummary = useMemo(() => {
    const sum = { new: 0, in_review: 0, approved: 0, rejected: 0 };
    for (const r of filtered) {
      const key = `money:${r.id}`;
      const s = workflowState[key]?.status ?? toMoneyWorkflowStatus(r.status);
      sum[s] += 1;
    }
    return sum;
  }, [filtered, workflowState]);
  const visibleKeys = useMemo(() => visibleRows.map((r) => `money:${r.id}`), [visibleRows]);
  const selectedCount = useMemo(() => visibleKeys.filter((k) => selectedKeys[k]).length, [visibleKeys, selectedKeys]);
  useEffect(() => {
    setSelectedKeys((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of visibleKeys) if (prev[k]) next[k] = true;
      return next;
    });
  }, [visibleKeys]);
  const printedAt = useMemo(
    () => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [],
  );
  const copySupportTrace = async () => {
    const line = `req=${apiDiag.requestId || "-"}${apiDiag.errorCode ? ` | code=${apiDiag.errorCode}` : ""}${apiDiag.stage ? ` | stage=${apiDiag.stage}` : ""}`;
    try {
      await navigator.clipboard.writeText(line);
      setCopiedTrace(true);
      window.setTimeout(() => setCopiedTrace(false), 1500);
    } catch {
      setCopiedTrace(false);
    }
  };

  return (
    <AuthGuard allowedRoles={["finance", "admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold">Money Module</h1>
        <p className="mt-3 text-slate-600">ตารางรายการการเงินแบบอ่านอย่างเดียว (Read-only)</p>
        <p className="mt-2 text-sm text-slate-500">
          แหล่งข้อมูลปัจจุบัน:{" "}
          <span className="font-semibold">{source === "database" ? "ฐานข้อมูลจริง" : "ข้อมูลสำรอง (fallback)"}</span>
          {apiMessage ? ` - ${apiMessage}` : ""}
        </p>
        {session?.role === "admin" && (apiDiag.requestId || apiDiag.errorCode || apiDiag.stage) ? (
          <div className="mt-1 flex items-center gap-2 text-xs text-indigo-700">
            <p>
              support trace: req={apiDiag.requestId || "-"}
              {apiDiag.errorCode ? ` | code=${apiDiag.errorCode}` : ""}
              {apiDiag.stage ? ` | stage=${apiDiag.stage}` : ""}
            </p>
            <button
              type="button"
              className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800 hover:bg-indigo-100"
              onClick={() => void copySupportTrace()}
            >
              {copiedTrace ? "คัดลอกแล้ว" : "คัดลอก trace"}
            </button>
          </div>
        ) : null}
        {source === "database" && moneyMeta?.status_mapping?.source === "amount_heuristic" ? (
          <p className="mt-1 text-xs text-amber-800">
            สถานะในตาราง: ประเมินจากยอดเงิน (ยังไม่พบคอลัมน์สถานะในตาราง — ใส่ใน schema-map หรือเพิ่มคอลัมน์ status ได้ภายหลัง)
          </p>
        ) : null}
        {source === "database" && moneyMeta?.status_mapping?.source === "database_column_with_amount_fallback" ? (
          <p className="mt-1 text-xs text-slate-600">
            สถานะในตาราง: อ่านจากคอลัมน์ {moneyMeta.status_mapping.column || "?"} เมื่อ map เป็นชุดอนุมัติ/รอ/ตีกลับได้
            ไม่เช่นนั้นใช้การประเมินจากยอดเงิน
          </p>
        ) : null}

        <section className="scheme-light mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงานโมดูลการเงิน (Money)</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
            <p className="text-sm text-slate-700">จำนวนรายการ: {filtered.length}</p>
          </div>
          <div className="no-print grid gap-3 md:grid-cols-3">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="ค้นหารหัส / ชื่อบุคลากร"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option>ทั้งหมด</option>
              <option>อนุมัติแล้ว</option>
              <option>รอตรวจสอบ</option>
              <option>ตีกลับ</option>
            </select>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              พบรายการ: <span className="font-semibold text-slate-900">{filtered.length}</span>
              {q !== deferredQ ? <span className="ml-2 text-xs text-slate-400">กำลังกรอง...</span> : null}
            </div>
          </div>
          <div className="no-print mt-3 flex gap-2">
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              onClick={() => {
                void trackAudit("money", "export_csv", filtered.length);
                void exportMoneyCsv(filtered);
              }}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              onClick={() =>
                printMoneyReport(filtered.length, () => {
                  setVisibleCount(filtered.length);
                })
              }
            >
              พิมพ์รายงาน
            </button>
          </div>
          <div className="no-print mt-3 grid gap-2 text-xs md:grid-cols-4">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${workflowFilter === "new" ? "border-slate-600 bg-slate-200 text-slate-800" : "border-slate-300 bg-slate-50 text-slate-700"}`}
              onClick={() => setWorkflowFilter("new")}
            >
              ใหม่: {workflowSummary.new}
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${workflowFilter === "in_review" ? "border-amber-500 bg-amber-100 text-amber-900" : "border-amber-300 bg-amber-50 text-amber-800"}`}
              onClick={() => setWorkflowFilter("in_review")}
            >
              กำลังตรวจสอบ: {workflowSummary.in_review}
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${workflowFilter === "approved" ? "border-emerald-500 bg-emerald-100 text-emerald-900" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
              onClick={() => setWorkflowFilter("approved")}
            >
              อนุมัติ: {workflowSummary.approved}
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${workflowFilter === "rejected" ? "border-rose-500 bg-rose-100 text-rose-900" : "border-rose-300 bg-rose-50 text-rose-800"}`}
              onClick={() => setWorkflowFilter("rejected")}
            >
              ตีกลับ: {workflowSummary.rejected}
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-slate-700"
              onClick={() => setWorkflowFilter("all")}
            >
              ล้างตัวกรองสถานะงาน
            </button>
          </div>
          <div className="no-print mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700">เลือกแล้ว: {selectedCount}</span>
            <button type="button" className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800" onClick={() => void bulkApply("in_review")}>รับเรื่องที่เลือก</button>
            <button type="button" className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800" onClick={() => void bulkApply("approved")}>อนุมัติที่เลือก</button>
            <button type="button" className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800" onClick={() => void bulkApply("rejected")}>ตีกลับที่เลือก</button>
            <button
              type="button"
              className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-1 text-indigo-800"
              onClick={() => {
                void undoLastBulk();
              }}
            >
              Undo bulk ล่าสุด ({lastBulkChanges.length})
            </button>
            <button
              type="button"
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700"
              onClick={() => {
                const allSelected = selectedCount > 0 && selectedCount === visibleKeys.length;
                if (allSelected) return setSelectedKeys({});
                const next: Record<string, boolean> = {};
                for (const k of visibleKeys) next[k] = true;
                setSelectedKeys(next);
              }}
            >
              {selectedCount > 0 && selectedCount === visibleKeys.length ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมดในหน้า"}
            </button>
          </div>
          {bulkMessage ? <p className="no-print mt-2 text-xs text-slate-600">{bulkMessage}</p> : null}
          {hasMore ? (
            <div className="no-print mt-3">
              <button
                type="button"
                className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              >
                แสดงเพิ่มอีก {PAGE_SIZE.toLocaleString("th-TH")} แถว (เหลืออีก{" "}
                {(filtered.length - visibleRows.length).toLocaleString("th-TH")} แถว)
              </button>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            {loading ? <p className="pb-2 text-sm text-slate-500">กำลังโหลดข้อมูลจาก API...</p> : null}
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 no-print">เลือก</th>
                  <th className="py-2">เลขที่รายการ</th>
                  <th className="py-2">ชื่อบุคลากร</th>
                  <th className="py-2">งวดข้อมูล</th>
                  <th className="py-2">จำนวนเงิน</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2 no-print">สถานะงาน</th>
                  <th className="py-2 no-print">ประวัติล่าสุด</th>
                  <th className="py-2 no-print">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `money:${r.id}`;
                        return (
                          <input
                            type="checkbox"
                            checked={!!selectedKeys[key]}
                            onChange={(e) => setSelectedKeys((prev) => ({ ...prev, [key]: e.target.checked }))}
                          />
                        );
                      })()}
                    </td>
                    <td className="py-2 font-medium">{r.id}</td>
                    <td className="py-2">{r.school}</td>
                    <td className="py-2">{formatMoneyDate(r.date)}</td>
                    <td className="py-2">{r.amount.toLocaleString()} บาท</td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `money:${r.id}`;
                        const current = workflowState[key]?.status ?? toMoneyWorkflowStatus(r.status);
                        return (
                          <span className={`rounded-md border px-2 py-0.5 text-xs ${workflowStatusClass(current)}`}>
                            {workflowStatusLabel(current)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 no-print text-xs text-slate-600">
                      {(() => {
                        const key = `money:${r.id}`;
                        return workflowHistoryText(workflowState[key]);
                      })()}
                    </td>
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `money:${r.id}`;
                        const current = workflowState[key]?.status ?? toMoneyWorkflowStatus(r.status);
                        const actions = availableWorkflowActions("money", session?.role ?? "guest", current);
                        if (actions.length === 0) return <span className="text-xs text-slate-400">ไม่มีสิทธิ์</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {actions.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                                onClick={() => updateWorkflow(key, a.to, current)}
                              >
                                {a.label}
                              </button>
                            ))}
                            <button
                              type="button"
                              className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-800 hover:bg-indigo-100"
                              onClick={() =>
                                setHistoryTarget({
                                  key,
                                  title: `ประวัติสถานะงาน - Money`,
                                  history: workflowState[key]?.history || [],
                                })
                              }
                            >
                              ดูประวัติทั้งหมด
                            </button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <WorkflowHistoryModal
          open={historyTarget !== null}
          title={historyTarget?.title || ""}
          itemKey={historyTarget?.key || ""}
          history={historyTarget?.history || []}
          onClose={() => setHistoryTarget(null)}
        />
      </main>
    </AuthGuard>
  );
}

