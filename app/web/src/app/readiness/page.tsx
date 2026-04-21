"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import { fetchSession } from "@/lib/auth-api";
import { fetchMoneyRows } from "@/lib/money-api";
import { fetchSlipRows } from "@/lib/slip-api";
import { fetchTaxRows } from "@/lib/tax-api";
import { fetchAuditRows } from "@/lib/audit-view-api";
import { fetchSecurityEvents } from "@/lib/security-events-api";
import { fetchWorkflowMap } from "@/lib/workflow-state-api";

const P0_MANUAL_STORAGE = "readiness_p0_manual_v1";

const P0_MANUAL_ITEMS: Array<{ id: string; label: string }> = [
  {
    id: "roles",
    label: "ทดสอบสิทธิ์จริง: finance ใช้ Money/Slip, personnel ใช้ Tax/Slip, admin ใช้ครบ และทำ workflow transition ได้ตามบทบาท",
  },
  {
    id: "reject_reason",
    label: "ทดสอบตีกลับ (rejected) พร้อมระบุเหตุผลในแต่ละโมดูล และตรวจใน Workflow transition log / Audit",
  },
  {
    id: "backup",
    label: "ยืนยันการสำรองฐานข้อมูลหลัก + โฟลเดอร์ logs/ (audit, workflow) ก่อนวันเปิดจริง — ดูคำแนะจาก /api/ops-snapshot.php (admin)",
  },
  {
    id: "incident",
    label: "กำหนดผู้รับผิดชอบหลังเปิดและช่องทางแจ้งเหตุฉุกเฉิน (โทร/Line)",
  },
  {
    id: "uat_short",
    label: "มีผลทดสอบสั้น ๆ จากผู้ใช้งานจริงอย่างน้อย 1 คนต่อบทบาทหลัก (finance / personnel)",
  },
];

type CheckItem = {
  title: string;
  ok: boolean;
  detail: string;
};

type SessionProbePayload = {
  authenticated?: boolean;
  auth_source?: string;
};

type RoleConfigProbePayload = {
  ok?: boolean;
  role_config?: {
    source?: string;
    valid?: boolean;
    count?: number;
    roles?: string[];
    error?: string;
  };
};

type SchemaConfigProbePayload = {
  ok?: boolean;
  schema_config?: {
    source?: string;
    valid?: boolean;
    count?: number;
    modules?: Array<{
      module?: string;
      strict?: boolean;
      table?: string;
    }>;
    error?: string;
  };
};

function exportReadinessCsv(checks: CheckItem[], p0Manual: Array<{ id: string; label: string; done: boolean }>) {
  const stamp = new Date().toISOString().slice(0, 10);
  const header = ["รายการตรวจ", "สถานะ", "รายละเอียด"];
  const lines = checks.map((c) =>
    [c.title, c.ok ? "ผ่าน" : "ไม่ผ่าน", c.detail].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
  );
  const p0Header = ["P0 (ติ๊กมือ)", "สถานะ", "รายการ"];
  const p0Lines = p0Manual.map((p) =>
    [p.label, p.done ? "ติ๊กแล้ว" : "ยังไม่ติ๊ก", ""].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
  );
  const csv = [header.join(","), ...lines, "", p0Header.join(","), ...p0Lines].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `go-live-readiness-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadP0ManualState(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(P0_MANUAL_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function ReadinessPage() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [p0Manual, setP0Manual] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setP0Manual(loadP0ManualState());
  }, []);

  const setP0Checked = (id: string, done: boolean) => {
    setP0Manual((prev) => {
      const next = { ...prev, [id]: done };
      try {
        window.localStorage.setItem(P0_MANUAL_STORAGE, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const p0Rows = useMemo(
    () =>
      P0_MANUAL_ITEMS.map((item) => ({
        ...item,
        done: Boolean(p0Manual[item.id]),
      })),
    [p0Manual],
  );
  const p0DoneCount = useMemo(() => p0Rows.filter((r) => r.done).length, [p0Rows]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchSession(),
      fetchMoneyRows(),
      fetchSlipRows(),
      fetchTaxRows(),
      fetchAuditRows({ limit: 50 }),
      fetchSecurityEvents({ limit: 50 }),
      fetch("/api/session.php?debug=1", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as SessionProbePayload;
        return {
          ok: res.ok,
          cacheControl: res.headers.get("cache-control") || "",
          xContentTypeOptions: (res.headers.get("x-content-type-options") || "").toLowerCase(),
          authSource: payload.auth_source || "none",
          authenticated: Boolean(payload.authenticated),
        };
      }),
      fetch("/api/security-thresholds.php", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as { ok?: boolean };
        return { status: res.status, ok: Boolean(payload.ok) };
      }),
      fetch("/api/session.php", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then((res) => ({
        status: res.status,
        allow: (res.headers.get("allow") || "").toUpperCase(),
      })),
      fetch("/api/role-config-status.php", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as RoleConfigProbePayload;
        const config = payload.role_config || {};
        return {
          status: res.status,
          ok: Boolean(payload.ok),
          source: config.source || "unknown",
          valid: Boolean(config.valid),
          count: typeof config.count === "number" ? config.count : 0,
          roles: Array.isArray(config.roles) ? config.roles : [],
          error: config.error || "",
        };
      }),
      fetch("/api/schema-config-status.php", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as SchemaConfigProbePayload;
        const config = payload.schema_config || {};
        const modules = Array.isArray(config.modules) ? config.modules : [];
        return {
          status: res.status,
          ok: Boolean(payload.ok),
          source: config.source || "unknown",
          valid: Boolean(config.valid),
          count: typeof config.count === "number" ? config.count : 0,
          modules,
          error: config.error || "",
        };
      }),
      fetch("/api/daily-brief.php", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }).then(async (res) => {
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          summary?: { risk_level?: string };
          trend_7d?: Array<{ date?: string }>;
        };
        return {
          status: res.status,
          ok: Boolean(payload.ok),
          riskLevel: payload.summary?.risk_level || "unknown",
          trendCount: Array.isArray(payload.trend_7d) ? payload.trend_7d.length : 0,
        };
      }),
      fetchWorkflowMap(),
    ])
      .then(([session, money, slip, tax, audit, sec, sessionProbe, thresholdsProbe, sessionPostProbe, roleConfigProbe, schemaConfigProbe, dailyBriefProbe, wf]) => {
        if (!active) return;
        const hasNoStore = sessionProbe.cacheControl.toLowerCase().includes("no-store");
        const hasNoSniff = sessionProbe.xContentTypeOptions === "nosniff";
        const items: CheckItem[] = [
          {
            title: "Authentication",
            ok: session.authenticated && session.role === "admin",
            detail: session.authenticated ? `signed in as ${session.username} (${session.role})` : "session not authenticated",
          },
          {
            title: "Money Data Source",
            ok: money.source === "database" && money.rows.length > 0,
            detail: `${money.source}, ${money.rows.length} rows`,
          },
          {
            title: "Slip Data Source",
            ok: slip.source === "database" && slip.rows.length > 0,
            detail: `${slip.source}, ${slip.rows.length} rows`,
          },
          {
            title: "Tax Data Source",
            ok: tax.source === "database" && tax.rows.length > 0,
            detail: `${tax.source}, ${tax.rows.length} rows`,
          },
          {
            title: "Audit Logging",
            ok: audit.ok && audit.rows.length >= 0,
            detail: `${audit.rows.length} recent events`,
          },
          {
            title: "Security Monitoring",
            ok: sec.ok,
            detail: `today 429 = ${sec.summary?.today_count ?? 0}, 7d = ${sec.summary?.seven_day_count ?? 0}`,
          },
          {
            title: "Session API Security Headers",
            ok: sessionProbe.ok && hasNoStore && hasNoSniff,
            detail: `cache-control="${sessionProbe.cacheControl || "-"}", x-content-type-options="${sessionProbe.xContentTypeOptions || "-"}"`,
          },
          {
            title: "Session Auth Source",
            ok: sessionProbe.authenticated && sessionProbe.authSource !== "none",
            detail: `auth_source=${sessionProbe.authSource}`,
          },
          {
            title: "Admin Threshold API Access",
            ok: thresholdsProbe.status === 200 && thresholdsProbe.ok,
            detail: `HTTP ${thresholdsProbe.status}`,
          },
          {
            title: "Session Method Enforcement",
            ok: sessionPostProbe.status === 405 && sessionPostProbe.allow.includes("GET"),
            detail: `POST /api/session.php => HTTP ${sessionPostProbe.status}, Allow="${sessionPostProbe.allow || "-"}"`,
          },
          {
            title: "Role Config Source",
            ok: roleConfigProbe.status === 200 && roleConfigProbe.ok && roleConfigProbe.valid && roleConfigProbe.count > 0,
            detail: `source=${roleConfigProbe.source}, mappings=${roleConfigProbe.count}, roles=[${roleConfigProbe.roles.join(", ") || "-"}]${roleConfigProbe.error ? `, error=${roleConfigProbe.error}` : ""}`,
          },
          {
            title: "Schema Config Source",
            ok: schemaConfigProbe.status === 200 && schemaConfigProbe.ok && schemaConfigProbe.valid && schemaConfigProbe.count >= 3,
            detail: `source=${schemaConfigProbe.source}, modules=${schemaConfigProbe.modules.map((m) => `${m.module || "?"}:${m.strict ? "strict" : "flex"}@${m.table || "-"}`).join(" | ") || "-"}${schemaConfigProbe.error ? `, error=${schemaConfigProbe.error}` : ""}`,
          },
          {
            title: "Daily Brief API",
            ok: dailyBriefProbe.status === 200 && dailyBriefProbe.ok,
            detail: `HTTP ${dailyBriefProbe.status}, risk=${dailyBriefProbe.riskLevel}, trend_7d=${dailyBriefProbe.trendCount}`,
          },
          {
            title: "Daily Brief Trend 7d",
            ok: dailyBriefProbe.status === 200 && dailyBriefProbe.ok && dailyBriefProbe.trendCount === 7,
            detail: `trend_7d entries=${dailyBriefProbe.trendCount}`,
          },
          {
            title: "Workflow State API",
            ok: wf.ok,
            detail: wf.ok
              ? `keys=${wf.count}, persistence=${wf.persistence || "unknown"} (แนะนำ database สำหรับ production)${wf.message ? `; ${wf.message}` : ""}`
              : (wf.message || "workflow API error"),
          },
        ];
        setChecks(items);
        setLoading(false);
        setError("");
      })
      .catch(() => {
        if (!active) return;
        setError("ไม่สามารถโหลดข้อมูล readiness ได้");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const passed = useMemo(() => checks.filter((c) => c.ok).length, [checks]);
  const total = checks.length;
  const p0AllTicked = P0_MANUAL_ITEMS.length > 0 && p0DoneCount === P0_MANUAL_ITEMS.length;
  const canGoLive = total > 0 && passed === total && p0AllTicked;
  const printedAt = useMemo(
    () => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [],
  );

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Go-Live Readiness</h1>
        <p className="mt-3 text-slate-600">ตรวจความพร้อมก่อนเปิดใช้งานจริงของระบบรวม</p>
        <div className="no-print mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => exportReadinessCsv(checks, p0Rows)}
          >
            Export Readiness CSV
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์รายงาน Readiness
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">รายงาน Go-Live Readiness</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
            <p className="text-sm text-slate-700">
              สรุปผล: อัตโนมัติ {passed}/{total} รายการ, P0 ติ๊กมือ {p0DoneCount}/{P0_MANUAL_ITEMS.length} (
              {canGoLive ? "พร้อม Go-Live" : "ยังไม่พร้อม Go-Live"})
            </p>
          </div>
          <div
            className={`rounded-lg border px-3 py-2 text-sm ${
              canGoLive ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-amber-300 bg-amber-50 text-amber-800"
            }`}
          >
            {canGoLive
              ? "พร้อม Go-Live: ผ่านเช็กอัตโนมัติครบ และติ๊ก P0 ด้วยมือครบ"
              : "ยังไม่พร้อม Go-Live: ตรวจรายการที่ไม่ผ่านด้านล่าง และติ๊กรายการ P0 ให้ครบ"}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            เช็กอัตโนมัติ: <span className="font-semibold text-slate-900">{passed}</span> /{" "}
            <span className="font-semibold text-slate-900">{total}</span> รายการ · P0 ติ๊กมือ:{" "}
            <span className="font-semibold text-slate-900">{p0DoneCount}</span> / {P0_MANUAL_ITEMS.length}
          </p>

          {loading ? <p className="mt-3 text-sm text-slate-500">กำลังตรวจสอบ...</p> : null}
          {error ? <p className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">รายการตรวจ</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2">รายละเอียด</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.title} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{c.title}</td>
                    <td className={`py-2 font-semibold ${c.ok ? "text-emerald-700" : "text-rose-700"}`}>{c.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                    <td className="py-2">{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 border-t border-slate-200 pt-6">
            <h2 className="text-lg font-semibold text-slate-900">P0 ก่อนเปิดใช้งาน (ติ๊กด้วยมือ — เก็บในเบราว์เซอร์นี้)</h2>
            <p className="mt-1 text-sm text-slate-600">
              รายการนี้ไม่สามารถตรวจอัตโนมัติได้ทั้งหมด แต่จำเป็นต่อการเปิดจริงอย่างปลอดภัย หลังติ๊กครบจะนับร่วมในสถานะ &quot;พร้อม Go-Live&quot; ด้านบน
            </p>
            <p className="mt-2 text-sm">
              <a
                href="/api/ops-snapshot.php"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-sky-700 underline hover:text-sky-900"
              >
                เปิดคำแนะการสำรอง (JSON) — admin
              </a>
            </p>
            <ul className="mt-3 space-y-2">
              {p0Rows.map((row) => (
                <li key={row.id} className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0"
                    checked={row.done}
                    onChange={(e) => setP0Checked(row.id, e.target.checked)}
                  />
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
