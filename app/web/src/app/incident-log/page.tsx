"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";

type IncidentRow = {
  id: string;
  time: string;
  severity: "P1" | "P2" | "P3";
  module: "money" | "slip" | "tax" | "platform";
  impact: string;
  action: string;
  owner: string;
  status: "open" | "monitoring" | "resolved";
  trace: string;
};

const STORAGE_KEY = "incident-log-v1";

const defaultRows: IncidentRow[] = [
  {
    id: "seed-1",
    time: "T+00:20",
    severity: "P2",
    module: "platform",
    impact: "ผู้ใช้บางส่วนรีเฟรชแล้วโหลดช้า",
    action: "ตรวจทรัพยากรเซิร์ฟเวอร์และยืนยัน API ตอบกลับปกติ",
    owner: "System Admin",
    status: "resolved",
    trace: "req=- | code=- | stage=-",
  },
  {
    id: "seed-2",
    time: "T+01:10",
    severity: "P3",
    module: "slip",
    impact: "ผู้ใช้สอบถามความหมายสถานะ fallback",
    action: "อธิบายความหมายและยืนยัน source=database ปัจจุบัน",
    owner: "Personnel Lead",
    status: "resolved",
    trace: "req=- | code=- | stage=-",
  },
  {
    id: "seed-3",
    time: "T+02:40",
    severity: "P2",
    module: "tax",
    impact: "พบรายการค้นหาไม่ตรงความคาดหวัง 1 ราย",
    action: "ตรวจข้อมูลต้นทางและยืนยันข้อมูล master ก่อนปิดประเด็น",
    owner: "Finance Lead",
    status: "monitoring",
    trace: "req=tax_summary-abcd1234 | code=- | stage=ok",
  },
];

function exportIncidentCsv(rows: IncidentRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["เวลา", "ความรุนแรง", "โมดูล", "ผลกระทบ", "การดำเนินการ", "ผู้รับผิดชอบ", "สถานะ", "support_trace"];
  const lines = rows.map((r) =>
    [r.time, r.severity, r.module, r.impact, r.action, r.owner, r.status, r.trace]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `incident-log-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function IncidentLogPage() {
  const [rows, setRows] = useState<IncidentRow[]>(defaultRows);
  const [form, setForm] = useState<Omit<IncidentRow, "id">>({
    time: "",
    severity: "P2",
    module: "platform",
    impact: "",
    action: "",
    owner: "",
    status: "open",
    trace: "",
  });
  const [traceInput, setTraceInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as IncidentRow[];
      if (Array.isArray(parsed) && parsed.length > 0) setRows(parsed);
    } catch {
      // ignore invalid local storage payload
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // ignore storage write failure
    }
  }, [rows]);

  const parsedTrace = useMemo(() => {
    const text = traceInput.trim();
    const req = text.match(/req=([^|]+)/i)?.[1]?.trim() || "";
    const code = text.match(/code=([^|]+)/i)?.[1]?.trim() || "";
    const stage = text.match(/stage=([^|]+)/i)?.[1]?.trim() || "";
    return { req, code, stage };
  }, [traceInput]);
  const summary = useMemo(() => {
    const stat = {
      total: rows.length,
      open: 0,
      monitoring: 0,
      resolved: 0,
    };
    const moduleCounts: Record<IncidentRow["module"], number> = {
      platform: 0,
      money: 0,
      tax: 0,
      slip: 0,
    };
    for (const row of rows) {
      stat[row.status] += 1;
      moduleCounts[row.module] += 1;
    }
    const topModuleEntry = (Object.entries(moduleCounts) as Array<[IncidentRow["module"], number]>)
      .sort((a, b) => b[1] - a[1])[0];
    return {
      ...stat,
      topModule: topModuleEntry && topModuleEntry[1] > 0 ? `${topModuleEntry[0]} (${topModuleEntry[1]})` : "-",
    };
  }, [rows]);
  const copyIncidentLine = async () => {
    const line = `Trace: req=${parsedTrace.req || "-"} | code=${parsedTrace.code || "-"} | stage=${parsedTrace.stage || "-"}`;
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  const addIncident = () => {
    if (!form.impact.trim() || !form.action.trim() || !form.owner.trim()) return;
    const now = new Date();
    const fallbackTime = now.toLocaleTimeString("th-TH", { hour12: false });
    const next: IncidentRow = {
      id: `inc-${now.getTime()}`,
      time: form.time.trim() || fallbackTime,
      severity: form.severity,
      module: form.module,
      impact: form.impact.trim(),
      action: form.action.trim(),
      owner: form.owner.trim(),
      status: form.status,
      trace: form.trace.trim() || `req=${parsedTrace.req || "-"} | code=${parsedTrace.code || "-"} | stage=${parsedTrace.stage || "-"}`,
    };
    setRows((prev) => [next, ...prev]);
    setForm((prev) => ({ ...prev, time: "", impact: "", action: "", owner: "", trace: "" }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };
  const removeIncident = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };
  const resetIncidents = () => {
    const ok = window.confirm("ยืนยันล้าง incident log ทั้งหมดและกลับค่าเริ่มต้น?");
    if (!ok) return;
    setRows(defaultRows);
  };

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Incident Log (T-0 ถึง T+24h)</h1>
        <p className="mt-3 text-slate-600">บันทึกเหตุการณ์ช่วงเปิดใช้งานจริงเพื่อใช้ติดตามและสรุปผลแบบ audit-ready</p>

        <div className="no-print mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => exportIncidentCsv(rows)}
          >
            Export Incident CSV
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์ Incident Log
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 hover:bg-rose-100"
            onClick={resetIncidents}
          >
            รีเซ็ต Incident Log
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงาน Incident Log</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            ใช้หน้านี้บันทึกเหตุการณ์จริงระหว่าง Go-Live และแนบเป็นหลักฐานปิดงานวันแรก
          </div>
          <div className="mt-3 grid gap-2 text-xs md:grid-cols-5">
            <div className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-slate-700">
              ทั้งหมด: <span className="font-semibold text-slate-900">{summary.total}</span>
            </div>
            <div className="rounded border border-rose-300 bg-rose-50 px-3 py-2 text-rose-800">
              open: <span className="font-semibold text-rose-900">{summary.open}</span>
            </div>
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800">
              monitoring: <span className="font-semibold text-amber-900">{summary.monitoring}</span>
            </div>
            <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-emerald-800">
              resolved: <span className="font-semibold text-emerald-900">{summary.resolved}</span>
            </div>
            <div className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-indigo-800">
              โมดูลที่พบบ่อย: <span className="font-semibold text-indigo-900">{summary.topModule}</span>
            </div>
          </div>
          <div className="no-print mt-3 rounded-lg border border-indigo-300 bg-indigo-50 p-3">
            <p className="text-sm font-semibold text-indigo-900">Trace Helper (วางจากปุ่มคัดลอก trace)</p>
            <textarea
              className="mt-2 w-full rounded border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-900"
              rows={2}
              placeholder="วาง support trace เช่น req=tax_summary-xxxx | code=TAX_QUERY_FAILED | stage=query_rows"
              value={traceInput}
              onChange={(e) => setTraceInput(e.target.value)}
            />
            <p className="mt-2 text-xs text-indigo-800">
              req={parsedTrace.req || "-"} | code={parsedTrace.code || "-"} | stage={parsedTrace.stage || "-"}
            </p>
            <button
              type="button"
              className="mt-2 rounded border border-indigo-300 bg-white px-2 py-1 text-xs text-indigo-900 hover:bg-indigo-100"
              onClick={() => void copyIncidentLine()}
            >
              {copied ? "คัดลอกแล้ว" : "คัดลอกบรรทัดสำหรับ Incident"}
            </button>
          </div>
          <div className="no-print mt-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3">
            <p className="text-sm font-semibold text-emerald-900">เพิ่ม Incident ใหม่</p>
            <div className="mt-2 grid gap-2 md:grid-cols-4">
              <input
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                placeholder="เวลา (เช่น T+03:10)"
                value={form.time}
                onChange={(e) => setForm((prev) => ({ ...prev, time: e.target.value }))}
              />
              <select
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                value={form.severity}
                onChange={(e) => setForm((prev) => ({ ...prev, severity: e.target.value as IncidentRow["severity"] }))}
              >
                <option value="P1">P1</option>
                <option value="P2">P2</option>
                <option value="P3">P3</option>
              </select>
              <select
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                value={form.module}
                onChange={(e) => setForm((prev) => ({ ...prev, module: e.target.value as IncidentRow["module"] }))}
              >
                <option value="platform">platform</option>
                <option value="money">money</option>
                <option value="tax">tax</option>
                <option value="slip">slip</option>
              </select>
              <select
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as IncidentRow["status"] }))}
              >
                <option value="open">open</option>
                <option value="monitoring">monitoring</option>
                <option value="resolved">resolved</option>
              </select>
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <input
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                placeholder="ผลกระทบ (จำเป็น)"
                value={form.impact}
                onChange={(e) => setForm((prev) => ({ ...prev, impact: e.target.value }))}
              />
              <input
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                placeholder="การดำเนินการ (จำเป็น)"
                value={form.action}
                onChange={(e) => setForm((prev) => ({ ...prev, action: e.target.value }))}
              />
              <input
                className="rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
                placeholder="ผู้รับผิดชอบ (จำเป็น)"
                value={form.owner}
                onChange={(e) => setForm((prev) => ({ ...prev, owner: e.target.value }))}
              />
            </div>
            <input
              className="mt-2 w-full rounded border border-emerald-200 bg-white px-2 py-1 text-sm"
              placeholder="support trace (ไม่บังคับ - ถ้าไม่ใส่จะใช้ค่าจาก Trace Helper)"
              value={form.trace}
              onChange={(e) => setForm((prev) => ({ ...prev, trace: e.target.value }))}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100"
                onClick={addIncident}
              >
                บันทึก Incident
              </button>
              {saved ? <span className="text-xs text-emerald-800">บันทึกแล้ว</span> : null}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">เวลา</th>
                  <th className="py-2">Severity</th>
                  <th className="py-2">โมดูล</th>
                  <th className="py-2">ผลกระทบ</th>
                  <th className="py-2">การดำเนินการ</th>
                  <th className="py-2">ผู้รับผิดชอบ</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2">support trace</th>
                  <th className="py-2 no-print">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{row.time}</td>
                    <td className="py-2">{row.severity}</td>
                    <td className="py-2">{row.module}</td>
                    <td className="py-2">{row.impact}</td>
                    <td className="py-2">{row.action}</td>
                    <td className="py-2">{row.owner}</td>
                    <td className="py-2">{row.status}</td>
                    <td className="py-2 text-xs">{row.trace || "-"}</td>
                    <td className="py-2 no-print">
                      <button
                        type="button"
                        className="rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs text-rose-800 hover:bg-rose-100"
                        onClick={() => removeIncident(row.id)}
                      >
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
