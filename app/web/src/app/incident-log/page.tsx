"use client";

import AuthGuard from "@/components/auth-guard";
import { useMemo, useState } from "react";

type IncidentRow = {
  time: string;
  severity: "P1" | "P2" | "P3";
  module: "money" | "slip" | "tax" | "platform";
  impact: string;
  action: string;
  owner: string;
  status: "open" | "monitoring" | "resolved";
};

const defaultRows: IncidentRow[] = [
  {
    time: "T+00:20",
    severity: "P2",
    module: "platform",
    impact: "ผู้ใช้บางส่วนรีเฟรชแล้วโหลดช้า",
    action: "ตรวจทรัพยากรเซิร์ฟเวอร์และยืนยัน API ตอบกลับปกติ",
    owner: "System Admin",
    status: "resolved",
  },
  {
    time: "T+01:10",
    severity: "P3",
    module: "slip",
    impact: "ผู้ใช้สอบถามความหมายสถานะ fallback",
    action: "อธิบายความหมายและยืนยัน source=database ปัจจุบัน",
    owner: "Personnel Lead",
    status: "resolved",
  },
  {
    time: "T+02:40",
    severity: "P2",
    module: "tax",
    impact: "พบรายการค้นหาไม่ตรงความคาดหวัง 1 ราย",
    action: "ตรวจข้อมูลต้นทางและยืนยันข้อมูล master ก่อนปิดประเด็น",
    owner: "Finance Lead",
    status: "monitoring",
  },
];

function exportIncidentCsv(rows: IncidentRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["เวลา", "ความรุนแรง", "โมดูล", "ผลกระทบ", "การดำเนินการ", "ผู้รับผิดชอบ", "สถานะ"];
  const lines = rows.map((r) =>
    [r.time, r.severity, r.module, r.impact, r.action, r.owner, r.status]
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
  const [traceInput, setTraceInput] = useState("");
  const [copied, setCopied] = useState(false);
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const parsedTrace = useMemo(() => {
    const text = traceInput.trim();
    const req = text.match(/req=([^|]+)/i)?.[1]?.trim() || "";
    const code = text.match(/code=([^|]+)/i)?.[1]?.trim() || "";
    const stage = text.match(/stage=([^|]+)/i)?.[1]?.trim() || "";
    return { req, code, stage };
  }, [traceInput]);
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

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Incident Log (T-0 ถึง T+24h)</h1>
        <p className="mt-3 text-slate-600">บันทึกเหตุการณ์ช่วงเปิดใช้งานจริงเพื่อใช้ติดตามและสรุปผลแบบ audit-ready</p>

        <div className="no-print mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => exportIncidentCsv(defaultRows)}
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
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงาน Incident Log</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          <div className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            ใช้หน้านี้บันทึกเหตุการณ์จริงระหว่าง Go-Live และแนบเป็นหลักฐานปิดงานวันแรก
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
                </tr>
              </thead>
              <tbody>
                {defaultRows.map((row, index) => (
                  <tr key={`${row.time}-${index}`} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{row.time}</td>
                    <td className="py-2">{row.severity}</td>
                    <td className="py-2">{row.module}</td>
                    <td className="py-2">{row.impact}</td>
                    <td className="py-2">{row.action}</td>
                    <td className="py-2">{row.owner}</td>
                    <td className="py-2">{row.status}</td>
                  </tr>
                ))}
                {Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`blank-${i}`} className="border-b border-dashed border-slate-200">
                    <td className="py-4">________________</td>
                    <td className="py-4">____</td>
                    <td className="py-4">________</td>
                    <td className="py-4">________________________________</td>
                    <td className="py-4">________________________________</td>
                    <td className="py-4">________________</td>
                    <td className="py-4">________</td>
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
