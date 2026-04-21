"use client";

import AuthGuard from "@/components/auth-guard";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { fetchTaxRows, type TaxApiResponse, type TaxRow } from "@/lib/tax-api";
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

type TaxPriority = "สูง" | "กลาง" | "ปกติ";

function resolveTaxPriority(row: TaxRow, workflow: WorkflowStatus): TaxPriority {
  if (workflow === "rejected") return "สูง";
  if (workflow === "in_review") return "สูง";
  if (row.status.includes("อยู่ระหว่าง")) return "กลาง";
  return "ปกติ";
}

function taxPriorityClass(priority: TaxPriority): string {
  if (priority === "สูง") return "border-rose-300 bg-rose-50 text-rose-800";
  if (priority === "กลาง") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

const TAX_VIEW_STORAGE_KEY = "tax-module-view-v1";

async function exportTaxCsv(rows: TaxRow[], getPriority: (row: TaxRow) => TaxPriority) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["เลขบัตรประชาชน (ปกปิดบางส่วน)", "ชื่อ-นามสกุล", "ปีภาษี", "สถานะเอกสาร", "ระดับความสำคัญ"];
  const dataRows = rows.map((r) => [r.citizenIdMasked, r.fullName, r.year, r.status, getPriority(r)]);
  await exportCsvChunked({
    filename: `tax-report-${stamp}.csv`,
    header,
    rows: dataRows,
  });
}

function printTaxReport(rowCount: number, ensureAllVisible: () => void) {
  void trackAudit("tax", "print", rowCount);
  ensureAllVisible();
  window.setTimeout(() => window.print(), 0);
}

function workflowHistoryText(meta?: WorkflowMeta): string {
  const list = Array.isArray(meta?.history) ? meta?.history : [];
  if (list.length === 0) return "-";
  const last = list[list.length - 1];
  return `${last.from || "new"} -> ${last.to || "-"} by ${last.by || "unknown"} @ ${last.at || "-"}`;
}

export default function TaxPage() {
  const PAGE_SIZE = 150;
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [year, setYear] = useState("ทั้งหมด");
  const [sortBy, setSortBy] = useState<"year_desc" | "name_asc" | "id_desc">("year_desc");
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaxPriority>("all");
  const [workflowFilter, setWorkflowFilter] = useState<"all" | WorkflowStatus>("all");
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [bulkMessage, setBulkMessage] = useState("");
  const [lastBulkChanges, setLastBulkChanges] = useState<Array<{ key: string; from: WorkflowStatus; to: WorkflowStatus }>>([]);
  const [rows, setRows] = useState<TaxRow[]>([]);
  const [session, setSession] = useState<ServerSession | null>(null);
  const [workflowState, setWorkflowState] = useState<Record<string, WorkflowMeta>>({});
  const [historyTarget, setHistoryTarget] = useState<{ key: string; title: string; history: NonNullable<WorkflowMeta["history"]> } | null>(null);
  const [source, setSource] = useState<"database" | "fallback">("fallback");
  const [loading, setLoading] = useState(true);
  const [apiMessage, setApiMessage] = useState("");
  const [taxMeta, setTaxMeta] = useState<TaxApiResponse["meta"]>(undefined);
  const [apiDiag, setApiDiag] = useState<{ requestId?: string; errorCode?: string; stage?: string }>({});
  const [usingSavedView, setUsingSavedView] = useState(false);
  const [copiedTrace, setCopiedTrace] = useState(false);

  useEffect(() => {
    let active = true;
    fetchSession().then((s) => {
      if (active) setSession(s);
    });
    fetchWorkflowMap().then((w) => {
      if (active && w.ok) setWorkflowState(w.map || {});
    });
    fetchTaxRows().then((data) => {
      if (!active) return;
      setRows(data.rows);
      setSource(data.source);
      setApiMessage(data.message || "");
      setTaxMeta(data.meta);
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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TAX_VIEW_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        q?: string;
        year?: string;
        workflowFilter?: "all" | WorkflowStatus;
        priorityFilter?: "all" | TaxPriority;
        sortBy?: "year_desc" | "name_asc" | "id_desc";
      };
      if (typeof saved.q === "string") setQ(saved.q);
      if (typeof saved.year === "string") setYear(saved.year);
      if (saved.workflowFilter) setWorkflowFilter(saved.workflowFilter);
      if (saved.priorityFilter) setPriorityFilter(saved.priorityFilter);
      if (saved.sortBy) setSortBy(saved.sortBy);
      setUsingSavedView(true);
    } catch {
      // ignore invalid persisted view
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TAX_VIEW_STORAGE_KEY,
        JSON.stringify({
          q,
          year,
          workflowFilter,
          priorityFilter,
          sortBy,
        }),
      );
    } catch {
      // ignore storage write failure
    }
  }, [q, year, workflowFilter, priorityFilter, sortBy]);

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
    if (saved.meta) setWorkflowState((state) => ({ ...state, [key]: saved.meta as WorkflowMeta }));
    return true;
  };

  const updateWorkflow = (key: string, to: WorkflowStatus, fallback: WorkflowStatus) => {
    const reason = to === "rejected" ? window.prompt("ระบุเหตุผลการตีกลับ", "") || "" : "";
    if (to === "rejected" && reason.trim() === "") return;
    void saveWorkflowForKey(key, to, fallback, reason).then((ok) => {
      if (ok) void trackAudit("tax", "workflow_transition", 1);
    });
  };

  const toTaxWorkflowStatus = (raw: string): WorkflowStatus => {
    const s = raw.trim();
    if (s.includes("พร้อมดาวน์โหลด") || /ready|complete/i.test(s)) return "approved";
    if (s.includes("อยู่ระหว่าง") || s.includes("จัดทำ") || /pending|process/i.test(s)) return "in_review";
    return "new";
  };

  const filtered = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQ = needle === "" || `${r.citizenIdMasked} ${r.fullName}`.toLowerCase().includes(needle);
      const matchesYear = year === "ทั้งหมด" || r.year === year;
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      const priority = resolveTaxPriority(r, workflow);
      const matchesWorkflow = workflowFilter === "all" || workflow === workflowFilter;
      const matchesPriority = priorityFilter === "all" || priority === priorityFilter;
      return matchesQ && matchesYear && matchesWorkflow && matchesPriority;
    });
  }, [deferredQ, year, rows, workflowState, workflowFilter, priorityFilter]);
  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "name_asc") return list.sort((a, b) => a.fullName.localeCompare(b.fullName, "th"));
    if (sortBy === "id_desc") return list.sort((a, b) => b.citizenIdMasked.localeCompare(a.citizenIdMasked));
    return list.sort((a, b) => b.year.localeCompare(a.year));
  }, [filtered, sortBy]);

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredQ, year, rows, workflowFilter, priorityFilter, sortBy]);
  const visibleRows = useMemo(() => sortedFiltered.slice(0, visibleCount), [sortedFiltered, visibleCount]);
  const hasMore = visibleRows.length < sortedFiltered.length;
  const visibleKeys = useMemo(() => visibleRows.map((r) => `tax:${r.citizenIdMasked}:${r.year}`), [visibleRows]);
  const selectedCount = useMemo(() => visibleKeys.filter((k) => selectedKeys[k]).length, [visibleKeys, selectedKeys]);
  useEffect(() => {
    setSelectedKeys((prev) => {
      const next: Record<string, boolean> = {};
      for (const k of visibleKeys) if (prev[k]) next[k] = true;
      return next;
    });
  }, [visibleKeys]);
  const workflowSummary = useMemo(() => {
    const sum = { new: 0, in_review: 0, approved: 0, rejected: 0 };
    for (const r of filtered) {
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const s = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      sum[s] += 1;
    }
    return sum;
  }, [filtered, workflowState]);
  const prioritySummary = useMemo(() => {
    const sum: Record<TaxPriority, number> = { สูง: 0, กลาง: 0, ปกติ: 0 };
    for (const r of sortedFiltered) {
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      sum[resolveTaxPriority(r, workflow)] += 1;
    }
    return sum;
  }, [sortedFiltered, workflowState]);
  const highPriorityRows = useMemo(() => {
    return sortedFiltered.filter((r) => {
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      return resolveTaxPriority(r, workflow) === "สูง";
    });
  }, [sortedFiltered, workflowState]);
  const taxStats = useMemo(() => {
    const totalItems = sortedFiltered.length;
    const readyCount = sortedFiltered.reduce((acc, r) => {
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      return acc + (workflow === "approved" ? 1 : 0);
    }, 0);
    const inReviewCount = sortedFiltered.reduce((acc, r) => {
      const key = `tax:${r.citizenIdMasked}:${r.year}`;
      const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
      return acc + (workflow === "in_review" ? 1 : 0);
    }, 0);
    return {
      totalItems,
      readyCount,
      inReviewCount,
      highPriorityCount: highPriorityRows.length,
    };
  }, [sortedFiltered, workflowState, highPriorityRows.length]);
  const bulkApply = async (to: WorkflowStatus) => {
    if (selectedCount <= 0) {
      setBulkMessage("ยังไม่ได้เลือกรายการสำหรับการดำเนินการแบบกลุ่ม");
      return;
    }
    const actionLabel = to === "in_review" ? "รับเรื่อง" : to === "approved" ? "อนุมัติ" : "ตีกลับ";
    const ok = window.confirm(`ยืนยัน ${actionLabel} จำนวน ${selectedCount} รายการใช่หรือไม่?`);
    if (!ok) return;
    const bulkReason = to === "rejected" ? window.prompt("ระบุเหตุผลการตีกลับ (ใช้กับทุกรายการในรอบนี้)", "") || "" : "";
    if (to === "rejected" && bulkReason.trim() === "") return;
    const rowsByKey = new Map<string, TaxRow>(filtered.map((r) => [`tax:${r.citizenIdMasked}:${r.year}` as string, r]));
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
      const current = workflowState[key]?.status ?? toTaxWorkflowStatus(row.status);
      const actions = availableWorkflowActions("tax", session?.role ?? "guest", current);
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
    if (success > 0) void trackAudit("tax", "workflow_transition", success);
    setLastBulkChanges(applied);
    setBulkMessage(
      `ผลการดำเนินการแบบกลุ่ม: สำเร็จ ${success}, ข้าม(สิทธิ์/transition) ${skippedInvalidTransition}, ข้าม(ไม่พบแถว) ${skippedNoRow}, บันทึกไม่สำเร็จ ${failedSave}`,
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
    if (success > 0) void trackAudit("tax", "workflow_transition", success);
    setBulkMessage(`ผลการย้อนกลับแบบกลุ่ม: สำเร็จ ${success}, บันทึกไม่สำเร็จ ${failed}`);
    if (failed === 0) setLastBulkChanges([]);
  };

  const yearOptions = useMemo(() => {
    const values = Array.from(new Set(rows.map((r) => r.year)));
    return ["ทั้งหมด", ...values];
  }, [rows]);
  const printedAt = useMemo(
    () => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [],
  );
  const resetSavedView = () => {
    setQ("");
    setYear("ทั้งหมด");
    setWorkflowFilter("all");
    setPriorityFilter("all");
    setSortBy("year_desc");
    setUsingSavedView(false);
    try {
      window.localStorage.removeItem(TAX_VIEW_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };
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
    <AuthGuard allowedRoles={["personnel", "admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-12">
        <h1 className="text-3xl font-bold">โมดูลภาษี</h1>
        <div className="no-print mt-2">
          <Link
            href="/"
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            กลับหน้าหลักระบบจัดการ
          </Link>
        </div>
        <p className="mt-3 text-slate-600">ค้นหารายการหนังสือรับรองภาษีแบบอ่านอย่างเดียว</p>
        <p className="mt-2 text-sm text-slate-500">
          แหล่งข้อมูลปัจจุบัน:{" "}
          <span className="font-semibold">{source === "database" ? "ฐานข้อมูลจริง" : "ข้อมูลสำรอง"}</span>
          {apiMessage ? ` - ${apiMessage}` : ""}
        </p>
        {session?.role === "admin" && (apiDiag.requestId || apiDiag.errorCode || apiDiag.stage) ? (
          <div className="mt-1 flex items-center gap-2 text-xs text-indigo-700">
            <p>
              รหัสติดตามสนับสนุน: req={apiDiag.requestId || "-"}
              {apiDiag.errorCode ? ` | code=${apiDiag.errorCode}` : ""}
              {apiDiag.stage ? ` | stage=${apiDiag.stage}` : ""}
            </p>
            <button
              type="button"
              className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-800 hover:bg-indigo-100"
              onClick={() => void copySupportTrace()}
            >
              {copiedTrace ? "คัดลอกแล้ว" : "คัดลอกรหัสติดตาม"}
            </button>
          </div>
        ) : null}
        {source === "database" && taxMeta?.status_mapping?.source === "default_ready" ? (
          <p className="mt-1 text-xs text-amber-800">
            สถานะในตาราง: แสดงเป็นพร้อมดาวน์โหลดทุกแถว (ยังไม่พบคอลัมน์สถานะในตาราง)
          </p>
        ) : null}
        {source === "database" && taxMeta?.status_mapping?.source === "database_column" ? (
          <p className="mt-1 text-xs text-slate-600">
            สถานะในตาราง: อ่านจากคอลัมน์ {taxMeta.status_mapping.column || "?"}
          </p>
        ) : null}
        <p className="mt-1 text-xs text-slate-500">
          เกณฑ์ระดับความสำคัญ: สูง=งานอยู่ในคิวตรวจสอบ/ตีกลับ, กลาง=กำลังจัดทำ, ปกติ=พร้อมดาวน์โหลด
        </p>
        {usingSavedView ? (
          <p className="mt-1 text-xs text-emerald-700">กำลังใช้มุมมองที่บันทึกไว้ล่าสุด</p>
        ) : null}

        <section className="scheme-light mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงานโมดูลภาษี</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
            <p className="text-sm text-slate-700">จำนวนรายการ: {sortedFiltered.length}</p>
          </div>
          <div className="no-print grid gap-3 md:grid-cols-3">
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="ค้นหาเลขบัตร (ปกปิดบางส่วน) / ชื่อ-นามสกุล"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              {yearOptions.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              พบรายการ: <span className="font-semibold text-slate-900">{sortedFiltered.length}</span>
              {q !== deferredQ ? <span className="ml-2 text-xs text-slate-400">กำลังกรอง...</span> : null}
            </div>
          </div>
          <div className="no-print mt-2 grid gap-2 text-xs md:grid-cols-3">
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "year_desc" | "name_asc" | "id_desc")}
            >
              <option value="year_desc">เรียง: ปีล่าสุดก่อน</option>
              <option value="name_asc">เรียง: ชื่อ ก-ฮ</option>
              <option value="id_desc">เรียง: เลขบัตรล่าสุดก่อน</option>
            </select>
            <select
              className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as "all" | TaxPriority)}
            >
              <option value="all">ระดับความสำคัญ: ทั้งหมด</option>
              <option value="สูง">ระดับความสำคัญ: สูง</option>
              <option value="กลาง">ระดับความสำคัญ: กลาง</option>
              <option value="ปกติ">ระดับความสำคัญ: ปกติ</option>
            </select>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800 hover:bg-amber-100"
                title="ตั้งมุมมองงานที่อยู่ระหว่างตรวจสอบ"
                onClick={() => {
                  setYear("ทั้งหมด");
                  setWorkflowFilter("in_review");
                  setPriorityFilter("all");
                  setSortBy("year_desc");
                }}
              >
                มุมมองด่วน: รอตรวจสอบ
              </button>
              <button
                type="button"
                className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800 hover:bg-rose-100"
                title="ตั้งมุมมองงานที่ถูกตีกลับ"
                onClick={() => {
                  setYear("ทั้งหมด");
                  setWorkflowFilter("rejected");
                  setPriorityFilter("สูง");
                  setSortBy("year_desc");
                }}
              >
                มุมมองด่วน: ตีกลับ
              </button>
              <button
                type="button"
                className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800 hover:bg-emerald-100"
                title="โฟกัสรายการที่พร้อมดาวน์โหลด"
                onClick={() => {
                  setYear("ทั้งหมด");
                  setWorkflowFilter("approved");
                  setPriorityFilter("all");
                  setSortBy("year_desc");
                }}
              >
                มุมมองด่วน: พร้อมดาวน์โหลด
              </button>
              <button
                type="button"
                className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800 hover:bg-rose-100"
                title="โฟกัสเฉพาะรายการระดับความสำคัญสูง"
                onClick={() => {
                  setPriorityFilter("สูง");
                  setWorkflowFilter("all");
                  setSortBy("year_desc");
                }}
              >
                มุมมองด่วน: คิวเร่งด่วน
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700 hover:bg-slate-100"
                title="ล้างตัวกรองทั้งหมดและลบมุมมองที่บันทึกไว้"
                onClick={() => {
                  resetSavedView();
                }}
              >
                มุมมองด่วน: เคลียร์ทั้งหมด
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-100"
                title="รีเซ็ตกลับค่าเริ่มต้นของหน้าปัจจุบัน"
                onClick={resetSavedView}
              >
                รีเซ็ตมุมมอง
              </button>
            </div>
          </div>
          <div className="no-print mt-3 flex gap-2">
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              title="ส่งออก CSV ตามมุมมองปัจจุบัน"
              onClick={() => {
                void trackAudit("tax", "export_csv", sortedFiltered.length);
                void exportTaxCsv(sortedFiltered, (row) => {
                  const key = `tax:${row.citizenIdMasked}:${row.year}`;
                  const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(row.status);
                  return resolveTaxPriority(row, workflow);
                });
              }}
            >
              ส่งออก CSV
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 hover:bg-rose-100"
              title="ส่งออกเฉพาะรายการระดับความสำคัญสูง"
              onClick={() => {
                void trackAudit("tax", "export_csv", highPriorityRows.length);
                void exportTaxCsv(highPriorityRows, (row) => {
                  const key = `tax:${row.citizenIdMasked}:${row.year}`;
                  const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(row.status);
                  return resolveTaxPriority(row, workflow);
                });
              }}
            >
              ส่งออกคิวสูง ({highPriorityRows.length})
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm text-rose-800 hover:bg-rose-50"
              title="พิมพ์รายงานเฉพาะรายการระดับความสำคัญสูง"
              onClick={() =>
                printTaxReport(highPriorityRows.length, () => {
                  setQ("");
                  setYear("ทั้งหมด");
                  setWorkflowFilter("all");
                  setPriorityFilter("สูง");
                  setSortBy("year_desc");
                  setVisibleCount(highPriorityRows.length);
                })
              }
            >
              พิมพ์คิวสูง ({highPriorityRows.length})
            </button>
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              title="พิมพ์รายงานตามมุมมองปัจจุบัน"
              onClick={() =>
                printTaxReport(sortedFiltered.length, () => {
                  setVisibleCount(sortedFiltered.length);
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
          <div className="no-print mt-2 grid gap-2 text-xs md:grid-cols-3">
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${priorityFilter === "สูง" ? "border-rose-500 bg-rose-100 text-rose-900" : "border-rose-300 bg-rose-50 text-rose-800"}`}
              onClick={() => setPriorityFilter("สูง")}
            >
              คิวสูง: {prioritySummary["สูง"]}
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${priorityFilter === "กลาง" ? "border-amber-500 bg-amber-100 text-amber-900" : "border-amber-300 bg-amber-50 text-amber-800"}`}
              onClick={() => setPriorityFilter("กลาง")}
            >
              คิวกลาง: {prioritySummary["กลาง"]}
            </button>
            <button
              type="button"
              className={`rounded-md border px-3 py-2 text-left ${priorityFilter === "ปกติ" ? "border-emerald-500 bg-emerald-100 text-emerald-900" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}
              onClick={() => setPriorityFilter("ปกติ")}
            >
              คิวปกติ: {prioritySummary["ปกติ"]}
            </button>
          </div>
          <div className="no-print mt-2 grid gap-2 text-xs md:grid-cols-4">
            <div className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-indigo-800">
              รายการตามมุมมอง: <span className="font-semibold text-indigo-900">{taxStats.totalItems.toLocaleString("th-TH")}</span>
            </div>
            <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">
              พร้อมดาวน์โหลด: <span className="font-semibold text-emerald-900">{taxStats.readyCount.toLocaleString("th-TH")}</span>
            </div>
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
              กำลังตรวจสอบ: <span className="font-semibold text-amber-900">{taxStats.inReviewCount.toLocaleString("th-TH")}</span>
            </div>
            <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800">
              รายการคิวสูง: <span className="font-semibold text-rose-900">{taxStats.highPriorityCount.toLocaleString("th-TH")}</span>
            </div>
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
              ย้อนกลับการปรับกลุ่มล่าสุด ({lastBulkChanges.length})
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
                {(sortedFiltered.length - visibleRows.length).toLocaleString("th-TH")} แถว)
              </button>
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            {loading ? <p className="pb-2 text-sm text-slate-500">กำลังโหลดข้อมูลจากระบบบริการ...</p> : null}
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 no-print">เลือก</th>
                  <th className="py-2">เลขบัตรประชาชน (ปกปิดบางส่วน)</th>
                  <th className="py-2">ชื่อ-นามสกุล</th>
                  <th className="py-2">ปีภาษี</th>
                  <th className="py-2">สถานะเอกสาร</th>
                  <th className="py-2 no-print">ระดับความสำคัญ</th>
                  <th className="py-2 no-print">สถานะงาน</th>
                  <th className="py-2 no-print">ประวัติล่าสุด</th>
                  <th className="py-2 no-print">ดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => (
                  <tr key={`${r.citizenIdMasked}-${r.year}`} className="border-b border-slate-100">
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `tax:${r.citizenIdMasked}:${r.year}`;
                        return (
                          <input
                            type="checkbox"
                            checked={!!selectedKeys[key]}
                            onChange={(e) => setSelectedKeys((prev) => ({ ...prev, [key]: e.target.checked }))}
                          />
                        );
                      })()}
                    </td>
                    <td className="py-2 font-medium">{r.citizenIdMasked}</td>
                    <td className="py-2">{r.fullName}</td>
                    <td className="py-2">{r.year}</td>
                    <td className="py-2">{r.status}</td>
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `tax:${r.citizenIdMasked}:${r.year}`;
                        const workflow = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
                        const priority = resolveTaxPriority(r, workflow);
                        return <span className={`rounded-md border px-2 py-0.5 text-xs ${taxPriorityClass(priority)}`}>{priority}</span>;
                      })()}
                    </td>
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `tax:${r.citizenIdMasked}:${r.year}`;
                        const current = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
                        return (
                          <span className={`rounded-md border px-2 py-0.5 text-xs ${workflowStatusClass(current)}`}>
                            {workflowStatusLabel(current)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-2 no-print text-xs text-slate-600">
                      {(() => {
                        const key = `tax:${r.citizenIdMasked}:${r.year}`;
                        return workflowHistoryText(workflowState[key]);
                      })()}
                    </td>
                    <td className="py-2 no-print">
                      {(() => {
                        const key = `tax:${r.citizenIdMasked}:${r.year}`;
                        const current = workflowState[key]?.status ?? toTaxWorkflowStatus(r.status);
                        const actions = availableWorkflowActions("tax", session?.role ?? "guest", current);
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
                                  title: `ประวัติสถานะงาน - Tax`,
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

