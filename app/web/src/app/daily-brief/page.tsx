"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import { fetchDailyBrief, type DailyBriefResponse } from "@/lib/daily-brief-api";

const DAILY_BRIEF_UI_VERSION = "daily-brief-ui-2026-04-17-1505";

function riskClass(level: DailyBriefResponse["summary"]["risk_level"]) {
  if (level === "critical") return "border-red-300 bg-red-50 text-red-800";
  if (level === "warn") return "border-amber-300 bg-amber-50 text-amber-800";
  return "border-emerald-300 bg-emerald-50 text-emerald-800";
}

function exportDailyBriefCsv(data: DailyBriefResponse) {
  const safe = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const lines: string[] = [];
  lines.push(["field", "value"].map(safe).join(","));
  lines.push(["date", data.date].map(safe).join(","));
  lines.push(["risk_level", data.summary.risk_level].map(safe).join(","));
  lines.push(["audit_total", data.summary.audit_total].map(safe).join(","));
  lines.push(["audit_unique_users", data.summary.audit_unique_users].map(safe).join(","));
  lines.push(["security_total", data.summary.security_total].map(safe).join(","));
  lines.push(["security_today_count", data.summary.security_today_count].map(safe).join(","));
  lines.push(["security_seven_day_count", data.summary.security_seven_day_count].map(safe).join(","));
  lines.push(["threshold_today_warn", data.thresholds.today_warn].map(safe).join(","));
  lines.push(["threshold_today_critical", data.thresholds.today_critical].map(safe).join(","));
  lines.push(["threshold_week_warn", data.thresholds.week_warn].map(safe).join(","));
  lines.push(["threshold_week_critical", data.thresholds.week_critical].map(safe).join(","));
  lines.push(["top_buckets", data.top_buckets.map((x) => `${x.bucket}(${x.count})`).join(" | ") || "-"].map(safe).join(","));
  lines.push(["top_ips", data.top_ips.map((x) => `${x.ip}(${x.count})`).join(" | ") || "-"].map(safe).join(","));
  lines.push([
    "trend_7d",
    data.trend_7d.map((x) => `${x.date}:audit=${x.audit_total},security=${x.security_total},risk=${x.risk_level}`).join(" | ") || "-",
  ].map(safe).join(","));
  lines.push(["recommendations", data.recommendations.join(" | ") || "-"].map(safe).join(","));
  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `daily-brief-${data.date || "report"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DailyBriefPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [data, setData] = useState<DailyBriefResponse | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let active = true;
    fetchDailyBrief(date).then((res) => {
      if (!active) return;
      setData(res);
      setMessage(res.ok ? "" : `โหลดไม่สำเร็จ: ${res.message ?? "unknown_error"}`);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [date, reloadTick]);

  const printedAt = useMemo(
    () => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [],
  );

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">สรุปปฏิบัติการประจำวัน</h1>
        <p className="mt-3 text-slate-600">สรุปรายวันอัตโนมัติจาก Audit + Security สำหรับผู้ดูแลระบบ</p>
        <p className="mt-1 text-xs text-slate-400">{DAILY_BRIEF_UI_VERSION}</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="no-print mb-4 flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={date}
              onChange={(e) => {
                setLoading(true);
                setDate(e.target.value);
              }}
            />
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => {
                setLoading(true);
                setReloadTick((v) => v + 1);
              }}
            >
              รีเฟรชข้อมูล
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => window.print()}
            >
              พิมพ์รายงาน
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => {
                if (!data) {
                  alert("ยังไม่มีข้อมูลสำหรับ Export CSV กรุณารีเฟรชข้อมูลก่อน");
                  return;
                }
                exportDailyBriefCsv(data);
              }}
            >
              ส่งออก CSV
            </button>
          </div>

          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงานสรุปปฏิบัติการประจำวัน</h2>
            <p className="text-sm text-slate-700">วันที่สรุป: {data?.date || "-"}</p>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          {loading ? <p className="text-sm text-slate-500">กำลังโหลดข้อมูล...</p> : null}
          {message ? <p className="mb-3 text-sm text-red-600">{message}</p> : null}

          {!loading && data ? (
            <>
              <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${riskClass(data.summary.risk_level)}`}>
                ระดับความเสี่ยง: <span className="font-semibold">{data.summary.risk_level.toUpperCase()}</span>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Audit ทั้งหมด (รายวัน)</p>
                  <p className="text-2xl font-bold text-slate-900">{data.summary.audit_total}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">ผู้ใช้งานที่มี activity</p>
                  <p className="text-2xl font-bold text-slate-900">{data.summary.audit_unique_users}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Security events (รายวัน)</p>
                  <p className="text-2xl font-bold text-slate-900">{data.summary.security_total}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">429 วันนี้ / 7 วัน</p>
                  <p className="text-2xl font-bold text-slate-900">
                    {data.summary.security_today_count} / {data.summary.security_seven_day_count}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Audit แยกตามโมดูล</p>
                  <p className="text-sm text-slate-700">
                    money={data.summary.audit_by_module.money ?? 0}, slip={data.summary.audit_by_module.slip ?? 0}, tax=
                    {data.summary.audit_by_module.tax ?? 0}, other={data.summary.audit_by_module.other ?? 0}
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    export_csv={data.summary.audit_by_action.export_csv ?? 0}, print={data.summary.audit_by_action.print ?? 0},
                    other={data.summary.audit_by_action.other ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Threshold อ้างอิง</p>
                  <p className="text-sm text-slate-700">
                    วันนี้เตือน {data.thresholds.today_warn}+ / วิกฤต {data.thresholds.today_critical}+
                  </p>
                  <p className="text-sm text-slate-700">
                    7 วันเตือน {data.thresholds.week_warn}+ / วิกฤต {data.thresholds.week_critical}+
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">ประเภทเหตุการณ์สูงสุด</p>
                  <p className="text-sm text-slate-700">
                    {data.top_buckets.length === 0 ? "-" : data.top_buckets.map((x) => `${x.bucket} (${x.count})`).join(", ")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">IP ที่พบสูงสุด</p>
                  <p className="text-sm text-slate-700">
                    {data.top_ips.length === 0 ? "-" : data.top_ips.map((x) => `${x.ip} (${x.count})`).join(", ")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">แนวโน้มย้อนหลัง 7 วัน</p>
                <div className="space-y-2">
                  {data.trend_7d.map((d) => {
                    const maxValue = Math.max(
                      ...data.trend_7d.map((x) => Math.max(x.audit_total, x.security_total, 1)),
                    );
                    const auditWidth = Math.max(6, Math.round((d.audit_total / maxValue) * 100));
                    const secWidth = Math.max(6, Math.round((d.security_total / maxValue) * 100));
                    return (
                      <div key={d.date} className="rounded-md border border-slate-100 bg-slate-50 p-2">
                        <p className="text-xs text-slate-700">
                          {d.date} · risk={d.risk_level}
                        </p>
                        <div className="mt-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-[11px] text-slate-600">audit</span>
                            <div className="h-2 flex-1 rounded bg-slate-200">
                              <div className="h-2 rounded bg-indigo-500" style={{ width: `${auditWidth}%` }} />
                            </div>
                            <span className="w-8 text-right text-[11px] text-slate-700">{d.audit_total}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-[11px] text-slate-600">security</span>
                            <div className="h-2 flex-1 rounded bg-slate-200">
                              <div className="h-2 rounded bg-rose-500" style={{ width: `${secWidth}%` }} />
                            </div>
                            <span className="w-8 text-right text-[11px] text-slate-700">{d.security_total}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">ข้อเสนอแนะอัตโนมัติ</p>
                <ul className="list-disc pl-5 text-sm text-slate-700">
                  {data.recommendations.map((line, idx) => (
                    <li key={`${line}-${idx}`}>{line}</li>
                  ))}
                </ul>
              </div>
            </>
          ) : null}
        </section>
      </main>
    </AuthGuard>
  );
}
