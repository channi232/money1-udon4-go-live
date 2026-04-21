"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useState } from "react";
import { fetchSecurityEvents, type SecurityEventRow } from "@/lib/security-events-api";
import {
  fetchSecurityThresholds,
  resetSecurityThresholds,
  saveSecurityThresholds,
  type SecurityThresholdHistoryRow,
  type SecurityThresholds,
} from "@/lib/security-thresholds-api";

function exportSecurityCsv(rows: SecurityEventRow[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["เวลา", "เหตุการณ์", "Bucket", "IP", "Retry(sec)", "Limit", "URI", "User Agent"];
  const lines = rows.map((r) =>
    [
      r.ts,
      r.event,
      r.bucket,
      r.ip,
      String(r.retry_after_seconds),
      `${r.max_requests}/${r.window_seconds}s`,
      r.request_uri ?? "",
      r.ua ?? "",
    ]
      .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `security-events-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SecurityPage() {
  const [bucketFilter, setBucketFilter] = useState("ทั้งหมด");
  const [ipFilter, setIpFilter] = useState("");
  const [rows, setRows] = useState<SecurityEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [summary, setSummary] = useState<{
    today_count: number;
    seven_day_count: number;
    top_buckets: Array<{ bucket: string; count: number }>;
    top_ips: Array<{ ip: string; count: number }>;
  }>({
    today_count: 0,
    seven_day_count: 0,
    top_buckets: [],
    top_ips: [],
  });
  const [thresholds, setThresholds] = useState<SecurityThresholds>({
    today_warn: 20,
    today_critical: 50,
    week_warn: 80,
    week_critical: 200,
  });
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [thresholdHistory, setThresholdHistory] = useState<SecurityThresholdHistoryRow[]>([]);
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  const todayLevel =
    summary.today_count >= thresholds.today_critical
      ? "critical"
      : summary.today_count >= thresholds.today_warn
        ? "warn"
        : "ok";
  const weekLevel =
    summary.seven_day_count >= thresholds.week_critical
      ? "critical"
      : summary.seven_day_count >= thresholds.week_warn
        ? "warn"
        : "ok";
  const riskLevel =
    todayLevel === "critical" || weekLevel === "critical" ? "critical" : todayLevel === "warn" || weekLevel === "warn" ? "warn" : "ok";

  useEffect(() => {
    let active = true;
    fetchSecurityThresholds().then((data) => {
      if (!active) return;
      setThresholds(data.thresholds);
      setThresholdHistory(data.history);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    fetchSecurityEvents({
      bucket: bucketFilter,
      ip: ipFilter,
      limit: 200,
    }).then((data) => {
      if (!active) return;
      setRows(data.rows);
      if (data.summary) setSummary(data.summary);
      setMessage(data.ok ? "" : `โหลดไม่สำเร็จ: ${data.message ?? "unknown_error"}`);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [bucketFilter, ipFilter, reloadTick]);

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">เฝ้าระวังความปลอดภัย</h1>
        <p className="mt-3 text-slate-600">ติดตามเหตุการณ์ความปลอดภัยจากระบบจำกัดอัตราเรียกใช้งาน (429) สำหรับผู้ดูแลระบบ</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงานเฝ้าระวังความปลอดภัย</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
            <p className="text-sm text-slate-700">
              สรุป 429 วันนี้: {summary.today_count} | 7 วัน: {summary.seven_day_count}
            </p>
            <p className="text-sm text-slate-700">จำนวนเหตุการณ์ในรายงาน: {rows.length}</p>
          </div>

          <div
            className={`no-print mb-4 rounded-lg border px-3 py-2 text-sm ${
              riskLevel === "critical"
                ? "border-red-300 bg-red-50 text-red-800"
                : riskLevel === "warn"
                  ? "border-amber-300 bg-amber-50 text-amber-800"
                  : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {riskLevel === "critical"
              ? "แจ้งเตือน: ปริมาณ 429 สูงผิดปกติ ควรตรวจสอบ IP และปลายทางที่ถูกเรียกทันที"
              : riskLevel === "warn"
                ? "เฝ้าระวัง: พบแนวโน้มการเรียก API เพิ่มขึ้น ควรติดตามต่อเนื่อง"
                : "สถานะปกติ: ยังไม่พบสัญญาณโจมตีเกิน threshold"}
          </div>
          <div className="no-print mb-4 grid gap-3 md:grid-cols-4">
            <div
              className={`rounded-lg border px-3 py-2 ${
                todayLevel === "critical"
                  ? "border-red-300 bg-red-50"
                  : todayLevel === "warn"
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="text-xs text-slate-500">429 วันนี้</p>
              <p className="text-xl font-bold text-slate-900">{summary.today_count}</p>
              <p className="text-xs text-slate-500">
                เตือน {thresholds.today_warn}+ | วิกฤต {thresholds.today_critical}+
              </p>
            </div>
            <div
              className={`rounded-lg border px-3 py-2 ${
                weekLevel === "critical"
                  ? "border-red-300 bg-red-50"
                  : weekLevel === "warn"
                    ? "border-amber-300 bg-amber-50"
                    : "border-slate-200 bg-slate-50"
              }`}
            >
              <p className="text-xs text-slate-500">429 ช่วง 7 วัน</p>
              <p className="text-xl font-bold text-slate-900">{summary.seven_day_count}</p>
              <p className="text-xs text-slate-500">
                เตือน {thresholds.week_warn}+ | วิกฤต {thresholds.week_critical}+
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:col-span-2">
              <p className="text-xs text-slate-500">ปลายทางที่ถูกจำกัดสูงสุด</p>
              <p className="text-sm text-slate-900">
                {summary.top_buckets.length === 0
                  ? "-"
                  : summary.top_buckets.map((x) => `${x.bucket} (${x.count})`).join(", ")}
              </p>
            </div>
          </div>

          <div className="no-print mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs text-slate-500">ตั้งค่าเกณฑ์เฝ้าระวัง (ผู้ดูแลระบบ)</p>
            <div className="grid gap-2 md:grid-cols-4">
              <input
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={thresholds.today_warn}
                onChange={(e) => setThresholds((v) => ({ ...v, today_warn: Number(e.target.value || 0) }))}
              />
              <input
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={thresholds.today_critical}
                onChange={(e) => setThresholds((v) => ({ ...v, today_critical: Number(e.target.value || 0) }))}
              />
              <input
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={thresholds.week_warn}
                onChange={(e) => setThresholds((v) => ({ ...v, week_warn: Number(e.target.value || 0) }))}
              />
              <input
                type="number"
                className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                value={thresholds.week_critical}
                onChange={(e) => setThresholds((v) => ({ ...v, week_critical: Number(e.target.value || 0) }))}
              />
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <span>วันนี้เตือน</span>
              <span>/ วันนี้วิกฤต</span>
              <span>/ 7วันเตือน</span>
              <span>/ 7วันวิกฤต</span>
              <button
                type="button"
                className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                disabled={savingThresholds}
                onClick={async () => {
                  setSavingThresholds(true);
                  const result = await saveSecurityThresholds(thresholds);
                  const latest = await fetchSecurityThresholds();
                  setThresholds(latest.thresholds);
                  setThresholdHistory(latest.history);
                  setSavingThresholds(false);
                  setMessage(result.ok ? "บันทึกเกณฑ์เฝ้าระวังเรียบร้อย" : `บันทึกไม่สำเร็จ: ${result.message ?? "unknown_error"}`);
                }}
              >
                {savingThresholds ? "กำลังบันทึก..." : "บันทึกเกณฑ์เฝ้าระวัง"}
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
                disabled={savingThresholds}
                onClick={async () => {
                  setSavingThresholds(true);
                  const result = await resetSecurityThresholds();
                  const latest = await fetchSecurityThresholds();
                  setThresholds(latest.thresholds);
                  setThresholdHistory(latest.history);
                  setSavingThresholds(false);
                  setMessage(
                    result.ok ? "รีเซ็ตเป็นค่าแนะนำเรียบร้อย" : `รีเซ็ตไม่สำเร็จ: ${result.message ?? "unknown_error"}`,
                  );
                }}
              >
                รีเซ็ตค่าแนะนำ
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs text-slate-500">ประวัติการแก้เกณฑ์เฝ้าระวัง (ล่าสุด 20 รายการ)</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm text-slate-900">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-600">
                    <th className="py-2">เวลา</th>
                    <th className="py-2">ผู้ใช้</th>
                    <th className="py-2">การกระทำ</th>
                    <th className="py-2">ค่า Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {thresholdHistory.length === 0 ? (
                    <tr>
                      <td className="py-2 text-slate-500" colSpan={4}>
                        ยังไม่มีประวัติ
                      </td>
                    </tr>
                  ) : (
                    thresholdHistory.map((h, idx) => (
                      <tr key={`${h.ts}-${idx}`} className="border-b border-slate-100">
                        <td className="py-2">{h.ts}</td>
                        <td className="py-2">{h.username}</td>
                        <td className="py-2">{h.action}</td>
                        <td className="py-2">
                          {h.thresholds.today_warn}/{h.thresholds.today_critical} | {h.thresholds.week_warn}/
                          {h.thresholds.week_critical}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="no-print grid gap-3 md:grid-cols-3">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
              value={bucketFilter}
              onChange={(e) => {
                setLoading(true);
                setBucketFilter(e.target.value);
              }}
            >
              <option>ทั้งหมด</option>
              <option value="session">session</option>
              <option value="money_summary_v3">money_summary_v3</option>
              <option value="slip_summary">slip_summary</option>
              <option value="tax_summary">tax_summary</option>
              <option value="audit_log">audit_log</option>
              <option value="audit_view">audit_view</option>
              <option value="security_events">security_events</option>
            </select>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder:text-slate-400"
              placeholder="ค้นหาที่อยู่ IP"
              value={ipFilter}
              onChange={(e) => {
                setLoading(true);
                setIpFilter(e.target.value);
              }}
            />
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setLoading(true);
                setReloadTick((v) => v + 1);
              }}
            >
              รีเฟรชข้อมูล
            </button>
          </div>
          <div className="mt-3 flex gap-2 no-print">
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => exportSecurityCsv(rows)}
            >
              ส่งออกเหตุการณ์ความปลอดภัย CSV
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => window.print()}
            >
              พิมพ์รายงานความปลอดภัย
            </button>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            พบรายการ: <span className="font-semibold text-slate-900">{rows.length}</span>
            {message ? <span className="ml-3 text-red-600">{message}</span> : null}
          </div>
          <div className="mt-2 text-sm text-slate-600">
            IP ที่พบสูงสุด:{" "}
            <span className="font-semibold text-slate-900">
              {summary.top_ips.length === 0 ? "-" : summary.top_ips.map((x) => `${x.ip} (${x.count})`).join(", ")}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            {loading ? <p className="pb-2 text-sm text-slate-500">กำลังโหลดข้อมูล...</p> : null}
            <table className="w-full min-w-[1080px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">เวลา</th>
                  <th className="py-2">เหตุการณ์</th>
                  <th className="py-2">กลุ่มเหตุการณ์</th>
                  <th className="py-2">IP</th>
                  <th className="py-2">รอเรียกซ้ำ (วินาที)</th>
                  <th className="py-2">เพดานจำกัด</th>
                  <th className="py-2">ปลายทางคำขอ (URI)</th>
                  <th className="py-2">ตัวแทนผู้ใช้งาน</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={`${r.ts}-${idx}`} className="border-b border-slate-100">
                    <td className="py-2">{r.ts}</td>
                    <td className="py-2">{r.event}</td>
                    <td className="py-2">{r.bucket}</td>
                    <td className="py-2">{r.ip}</td>
                    <td className="py-2">{r.retry_after_seconds}</td>
                    <td className="py-2">
                      {r.max_requests}/{r.window_seconds}s
                    </td>
                    <td className="py-2">{r.request_uri ?? "-"}</td>
                    <td className="py-2">{r.ua ?? "-"}</td>
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
