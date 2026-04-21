"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";

type HealthRow = {
  key: string;
  label: string;
  path: string;
  status: number;
  ok: boolean;
  latencyMs: number;
  detail: string;
};

const TARGETS: Array<{ key: string; label: string; path: string }> = [
  { key: "session", label: "Session", path: "/api/session.php?debug=1" },
  { key: "money", label: "Money Summary", path: "/api/money-summary-v3.php?debug=1" },
  { key: "slip", label: "Slip Summary", path: "/api/slip-summary.php?debug=1" },
  { key: "tax", label: "Tax Summary", path: "/api/tax-summary.php?debug=1" },
  { key: "workflow", label: "Workflow State", path: "/api/workflow-state.php" },
  { key: "audit", label: "Audit View", path: "/api/audit-view.php?limit=1" },
  { key: "security", label: "Security Events", path: "/api/security-events.php?limit=1" },
  { key: "dailyBrief", label: "Daily Brief", path: "/api/daily-brief.php" },
  { key: "opsSnapshot", label: "Ops Snapshot (backup hints)", path: "/api/ops-snapshot.php" },
];

async function probeOne(target: { key: string; label: string; path: string }): Promise<HealthRow> {
  const start = performance.now();
  try {
    const res = await fetch(target.path, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const elapsed = Math.round(performance.now() - start);
    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      source?: string;
      rows?: unknown[];
      message?: string;
    };
    const source = typeof payload.source === "string" ? payload.source : "";
    const rows = Array.isArray(payload.rows) ? payload.rows.length : -1;
    const message = typeof payload.message === "string" ? payload.message : "";
    const detailParts = [
      source ? `source=${source}` : "",
      rows >= 0 ? `rows=${rows}` : "",
      message ? `message=${message}` : "",
    ].filter(Boolean);
    return {
      key: target.key,
      label: target.label,
      path: target.path,
      status: res.status,
      ok: res.ok && payload.ok !== false,
      latencyMs: elapsed,
      detail: detailParts.join(", ") || "-",
    };
  } catch {
    const elapsed = Math.round(performance.now() - start);
    return {
      key: target.key,
      label: target.label,
      path: target.path,
      status: 0,
      ok: false,
      latencyMs: elapsed,
      detail: "network_error",
    };
  }
}

export default function HealthPage() {
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all(TARGETS.map((t) => probeOne(t))).then((results) => {
      if (!active) return;
      setRows(results);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [tick]);

  const okCount = useMemo(() => rows.filter((r) => r.ok).length, [rows]);
  const avgLatency = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.round(rows.reduce((sum, r) => sum + r.latencyMs, 0) / rows.length);
  }, [rows]);

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">ตรวจสุขภาพระบบ</h1>
        <p className="mt-3 text-slate-600">ตรวจสุขภาพ API สำคัญแบบรวดเร็ว (HTTP + latency + source)</p>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate-700">
              สถานะรวม: <span className="font-semibold text-slate-900">{okCount}</span> / {rows.length} ผ่าน, latency เฉลี่ย{" "}
              <span className="font-semibold text-slate-900">{avgLatency}</span> ms
            </div>
            <button
              type="button"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
              onClick={() => {
                setLoading(true);
                setTick((v) => v + 1);
              }}
            >
              รีเฟรชผลตรวจสุขภาพ
            </button>
          </div>
          {loading ? <p className="text-sm text-slate-500">กำลังตรวจสอบ...</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">API</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2">HTTP</th>
                  <th className="py-2">เวลาตอบสนอง</th>
                  <th className="py-2">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{r.label}</td>
                    <td className={`py-2 font-semibold ${r.ok ? "text-emerald-700" : "text-rose-700"}`}>{r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                    <td className="py-2">{r.status || "-"}</td>
                    <td className="py-2">{r.latencyMs} ms</td>
                    <td className="py-2">{r.detail}</td>
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
