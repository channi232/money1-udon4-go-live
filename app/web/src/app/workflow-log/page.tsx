"use client";

import AuthGuard from "@/components/auth-guard";
import { exportCsvChunked } from "@/lib/csv-export";
import { fetchWorkflowTransitions, type WorkflowTransitionRow } from "@/lib/workflow-transition-api";
import { useEffect, useMemo, useState } from "react";

function statusLabel(status: string): string {
  if (status === "new") return "ใหม่";
  if (status === "in_review") return "กำลังตรวจสอบ";
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "rejected") return "ตีกลับ";
  return status;
}

function buildSummaryText(rows: WorkflowTransitionRow[]): string {
  const lines: string[] = [];
  lines.push("สรุปการเปลี่ยนสถานะงาน");
  lines.push(`เวลาสร้างรายงาน: ${new Date().toLocaleString("th-TH")}`);
  lines.push(`จำนวนทั้งหมด: ${rows.length}`);
  lines.push("");
  rows.slice(0, 20).forEach((r, i) => {
    lines.push(
      `${i + 1}) ${r.at} | ${moduleLabel(r.module)} | ${r.key} | ${statusLabel(r.from)} -> ${statusLabel(r.to)} | ผู้ดำเนินการ=${r.by} | รหัส=${r.transitionId}${r.reason ? ` | เหตุผล=${r.reason}` : ""}`,
    );
  });
  return lines.join("\n");
}

function moduleLabel(module: string): string {
  if (module === "money") return "โมดูลการเงิน";
  if (module === "slip") return "โมดูลสลิป";
  if (module === "tax") return "โมดูลภาษี";
  return module;
}

async function exportWorkflowTransitionCsv(rows: WorkflowTransitionRow[]): Promise<void> {
  const stamp = new Date().toISOString().slice(0, 10);
  await exportCsvChunked({
    filename: `workflow-transition-log-${stamp}.csv`,
    header: ["เวลา", "โมดูล", "รหัสรายการ", "สถานะเดิม", "สถานะใหม่", "ผู้ดำเนินการ", "เหตุผล", "รหัสการเปลี่ยนสถานะ"],
    rows: rows.map((r) => [r.at, r.module, r.key, r.from, r.to, r.by, r.reason || "", r.transitionId]),
  });
}

export default function WorkflowLogPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<WorkflowTransitionRow[]>([]);
  const [message, setMessage] = useState("");
  const [moduleFilter, setModuleFilter] = useState("ทั้งหมด");
  const [fromFilter, setFromFilter] = useState("ทั้งหมด");
  const [toFilter, setToFilter] = useState("ทั้งหมด");
  const [keyFilter, setKeyFilter] = useState("");
  const [byFilter, setByFilter] = useState("");
  const [query, setQuery] = useState("");
  const [fromAt, setFromAt] = useState("");
  const [toAt, setToAt] = useState("");
  const [copyStatus, setCopyStatus] = useState<"" | "ok" | "error">("");
  const [exportStatus, setExportStatus] = useState<"" | "ok" | "error">("");

  const load = async () => {
    setLoading(true);
    setMessage("กำลังโหลด transition log...");
    const res = await fetchWorkflowTransitions({
      module: moduleFilter,
      from: fromFilter,
      to: toFilter,
      key: keyFilter,
      by: byFilter,
      q: query,
      fromAt,
      toAt,
      limit: 500,
    });
    if (!res.ok) {
      setRows([]);
      setMessage(`โหลดไม่สำเร็จ: ${res.message || "unknown_error"}`);
      setLoading(false);
      return;
    }
    setRows(res.rows);
    setMessage(`โหลดแล้ว ${res.count} รายการ`);
    setLoading(false);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const moduleStats = useMemo(() => {
    const out = { money: 0, slip: 0, tax: 0 };
    for (const r of rows) out[r.module] += 1;
    return out;
  }, [rows]);

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="scheme-light mx-auto min-h-screen w-full max-w-[1400px] px-6 py-10 text-slate-900">
        <h1 className="text-3xl font-bold">บันทึกการเปลี่ยนสถานะงาน</h1>
        <p className="mt-2 text-sm text-slate-600">มุมมองสำหรับตรวจสอบการเปลี่ยนสถานะจริงจากระบบหลังบ้าน (เพิ่มต่อเนื่องเท่านั้น) ใช้สำหรับรับรองการทดสอบผู้ใช้งานและตรวจย้อนหลัง</p>

        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-2 md:grid-cols-4">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
            >
              <option value="ทั้งหมด">โมดูลทั้งหมด</option>
              <option value="money">โมดูลการเงิน</option>
              <option value="slip">โมดูลสลิป</option>
              <option value="tax">โมดูลภาษี</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={fromFilter}
              onChange={(e) => setFromFilter(e.target.value)}
            >
              <option value="ทั้งหมด">สถานะเดิมทั้งหมด</option>
              <option value="new">ใหม่</option>
              <option value="in_review">กำลังตรวจสอบ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ตีกลับ</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={toFilter}
              onChange={(e) => setToFilter(e.target.value)}
            >
              <option value="ทั้งหมด">สถานะใหม่ทั้งหมด</option>
              <option value="new">ใหม่</option>
              <option value="in_review">กำลังตรวจสอบ</option>
              <option value="approved">อนุมัติแล้ว</option>
              <option value="rejected">ตีกลับ</option>
            </select>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="ค้นหารหัสรายการ"
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="ค้นหาผู้ดำเนินการ (ชื่อผู้ใช้งาน)"
              value={byFilter}
              onChange={(e) => setByFilter(e.target.value)}
            />
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="ค้นหาอิสระ (เหตุผล/รหัส/คำสำคัญ)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="datetime-local" value={fromAt} onChange={(e) => setFromAt(e.target.value)} />
            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="datetime-local" value={toAt} onChange={(e) => setToAt(e.target.value)} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm" onClick={() => void load()}>
              รีเฟรชตามตัวกรอง
            </button>
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              onClick={() => {
                void exportWorkflowTransitionCsv(rows)
                  .then(() => setExportStatus("ok"))
                  .catch(() => setExportStatus("error"))
                  .finally(() => window.setTimeout(() => setExportStatus(""), 1800));
              }}
            >
              ส่งออก CSV
            </button>
            <button
              type="button"
              className="finance-toolbar-btn rounded-lg px-3 py-2 text-sm"
              onClick={() => {
                const text = buildSummaryText(rows);
                void navigator.clipboard
                  .writeText(text)
                  .then(() => setCopyStatus("ok"))
                  .catch(() => setCopyStatus("error"))
                  .finally(() => window.setTimeout(() => setCopyStatus(""), 1800));
              }}
            >
              คัดลอกสรุปรับรองการทดสอบผู้ใช้งาน
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1">โมดูลการเงิน: {moduleStats.money}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">โมดูลสลิป: {moduleStats.slip}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">โมดูลภาษี: {moduleStats.tax}</span>
          </div>

          <p className="mt-2 text-sm text-slate-600">{loading ? "กำลังโหลด..." : message}</p>
          {exportStatus === "ok" ? <p className="mt-1 text-xs text-emerald-700">ส่งออก CSV แล้ว</p> : null}
          {exportStatus === "error" ? <p className="mt-1 text-xs text-rose-700">ส่งออก CSV ไม่สำเร็จ</p> : null}
          {copyStatus === "ok" ? <p className="mt-1 text-xs text-emerald-700">คัดลอกสรุปรับรองการทดสอบผู้ใช้งานแล้ว</p> : null}
          {copyStatus === "error" ? <p className="mt-1 text-xs text-rose-700">คัดลอกสรุปรับรองการทดสอบผู้ใช้งานไม่สำเร็จ</p> : null}
        </section>

        <section className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <table className="w-full min-w-[1200px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-600">
                <th className="py-2 pr-2">เวลา</th>
                <th className="py-2 pr-2">โมดูล</th>
                <th className="py-2 pr-2">รหัสการเปลี่ยนสถานะ</th>
                <th className="py-2 pr-2">การเปลี่ยนสถานะ</th>
                <th className="py-2 pr-2">ผู้ดำเนินการ</th>
                <th className="py-2 pr-2">เหตุผล</th>
                <th className="py-2 pr-2">รหัสรายการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.transitionId} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-2 whitespace-nowrap">{r.at || "-"}</td>
                  <td className="py-2 pr-2">{moduleLabel(r.module)}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.key}</td>
                  <td className="py-2 pr-2">
                    {statusLabel(r.from)} {"->"} {statusLabel(r.to)}
                  </td>
                  <td className="py-2 pr-2">{r.by || "-"}</td>
                  <td className="py-2 pr-2">{r.reason && r.reason.trim() !== "" ? r.reason : "-"}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.transitionId}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td className="py-4 text-center text-slate-500" colSpan={7}>
                    ไม่พบข้อมูลตามตัวกรอง
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </main>
    </AuthGuard>
  );
}
