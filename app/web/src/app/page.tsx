"use client";

import SystemSummary from "@/components/system-summary";
import { fetchMoneyRows } from "@/lib/money-api";
import { fetchSlipRows } from "@/lib/slip-api";
import { fetchTaxRows } from "@/lib/tax-api";
import { fetchSession, type ServerSession } from "@/lib/auth-api";
import { fetchDailyBrief } from "@/lib/daily-brief-api";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type HomeSnapshot = {
  session: ServerSession;
  fetchedAt: string;
  moneyCount: number;
  slipCount: number;
  taxCount: number;
  taxReadyCount: number;
  taxProcessingCount: number;
  moneyPendingCount: number;
  slipHeadMonth: string;
  moneySource: "database" | "fallback";
  slipSource: "database" | "fallback";
  taxSource: "database" | "fallback";
  moneyOk: boolean;
  slipOk: boolean;
  taxOk: boolean;
  moneyMessage?: string;
  slipMessage?: string;
  taxMessage?: string;
  dailyRiskLevel: "ok" | "warn" | "critical";
  dailyAuditTotal: number;
  dailySecurityTotal: number;
  dailyRecommendations: string[];
};

function formatInt(n: number) {
  return new Intl.NumberFormat("th-TH").format(n);
}

function sourceLabel(source: "database" | "fallback") {
  return source === "database" ? "ฐานข้อมูลจริง" : "ข้อมูลสำรอง (fallback)";
}

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);

  const modules = useMemo(
    () => [
      {
        name: "โมดูลการเงิน",
        desc: "ตารางรายการการเงินแบบอ่านอย่างเดียว พร้อมส่งออก CSV/พิมพ์รายงาน",
        href: "/money",
        accent: "from-emerald-500/15 via-white to-sky-500/10",
      },
      {
        name: "โมดูลสลิป",
        desc: "ค้นหาและเรียกดูสลิปเงินเดือนย้อนหลังได้สะดวก พร้อมส่งออก CSV/พิมพ์รายงาน",
        href: "/slip",
        accent: "from-indigo-500/15 via-white to-fuchsia-500/10",
      },
      {
        name: "โมดูลภาษี",
        desc: "หนังสือรับรองภาษี ณ ที่จ่าย พร้อมสถานะจัดทำ/ดาวน์โหลด",
        href: "/tax",
        accent: "from-amber-500/15 via-white to-rose-500/10",
      },
    ],
    [],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [money, slip, tax, session, daily] = await Promise.all([
          fetchMoneyRows({ preflight: true, limit: 50 }),
          fetchSlipRows({ preflight: true, limit: 50 }),
          fetchTaxRows({ preflight: true, limit: 50 }),
          fetchSession(),
          fetchDailyBrief(),
        ]);
        if (!active) return;
        const fetchedAt = new Intl.DateTimeFormat("th-TH", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date());
        const taxReadyCount =
          typeof tax.metrics?.ready_count === "number" ? tax.metrics.ready_count : tax.rows.filter((r) => r.status === "พร้อมดาวน์โหลด").length;
        const taxProcessingCount =
          typeof tax.metrics?.processing_count === "number"
            ? tax.metrics.processing_count
            : tax.rows.filter((r) => r.status === "อยู่ระหว่างจัดทำ").length;
        const moneyPendingCount =
          typeof money.metrics?.pending_review_rows === "number"
            ? money.metrics.pending_review_rows
            : money.rows.filter((r) => r.status === "รอตรวจสอบ").length;
        const slipHeadMonth = (slip.rows[0]?.month || "").trim() || "—";
        setSnapshot({
          session,
          fetchedAt,
          moneyCount: typeof money.metrics?.total_rows === "number" ? money.metrics.total_rows : money.rows.length,
          slipCount: typeof slip.metrics?.total_rows === "number" ? slip.metrics.total_rows : slip.rows.length,
          taxCount: typeof tax.metrics?.total_rows === "number" ? tax.metrics.total_rows : tax.rows.length,
          taxReadyCount,
          taxProcessingCount,
          moneyPendingCount,
          slipHeadMonth,
          moneySource: money.source,
          slipSource: slip.source,
          taxSource: tax.source,
          moneyOk: Boolean(money.ok),
          slipOk: Boolean(slip.ok),
          taxOk: Boolean(tax.ok),
          moneyMessage: money.message,
          slipMessage: slip.message,
          taxMessage: tax.message,
          dailyRiskLevel: daily.ok ? daily.summary.risk_level : "ok",
          dailyAuditTotal: daily.ok ? daily.summary.audit_total : 0,
          dailySecurityTotal: daily.ok ? daily.summary.security_total : 0,
          dailyRecommendations: daily.ok ? daily.recommendations : [],
        });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const role = snapshot?.session.role ?? "guest";
  const isAdmin = role === "admin";
  const isFinance = role === "finance" || role === "admin";

  const centralStats = useMemo(() => {
    if (!snapshot) return [];
    return [
      {
        key: "slip-month",
        label: "งวดสลิป (จากลำดับข้อมูลที่ส่งกลับ)",
        value: snapshot.slipHeadMonth,
      },
      {
        key: "tax-ready",
        label: "ภาษีพร้อมดาวน์โหลด (ในชุดข้อมูล)",
        value: `${formatInt(snapshot.taxReadyCount)} รายการ`,
      },
      {
        key: "money-pending",
        label: "การเงินรอตรวจสอบ (ในชุดข้อมูล)",
        value: `${formatInt(snapshot.moneyPendingCount)} รายการ`,
      },
    ];
  }, [snapshot]);

  const centralSourcesLine = snapshot
    ? `แหล่งข้อมูล: การเงิน=${sourceLabel(snapshot.moneySource)} · สลิป=${sourceLabel(snapshot.slipSource)} · ภาษี=${sourceLabel(snapshot.taxSource)} · ภาษีอยู่ระหว่างจัดทำ ${formatInt(snapshot.taxProcessingCount)} รายการ`
    : "";

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -right-44 top-24 h-[520px] w-[520px] rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="absolute bottom-[-220px] left-1/3 h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] [background-size:22px_22px] opacity-35" />
      </div>

      <main className="relative mx-auto w-full max-w-6xl px-6 py-14 md:px-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-sky-100/90 backdrop-blur">
              {logoMissing ? (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-orange-300 bg-orange-50 text-[9px] font-bold text-orange-800">
                  สพป.4
                </span>
              ) : (
                <Image
                  src="/org-logo.png"
                  alt="โลโก้ สพป.อุดรธานี เขต 4"
                  width={24}
                  height={24}
                  className="rounded-full border border-orange-200 bg-white object-cover"
                  onError={() => setLogoMissing(true)}
                />
              )}
              สำนักงานเขตพื้นที่การศึกษาประถมศึกษาอุดรธานี เขต 4 — สพป.อุดรธานี เขต 4
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              ภาพรวมการเงินแบบ “เห็นของจริง”
              <span className="block bg-gradient-to-r from-sky-200 via-white to-emerald-200 bg-clip-text text-transparent">
                การเงิน · สลิป · ภาษี ในที่เดียว
              </span>
            </h1>
            <p className="mt-2 text-sm text-slate-300/85">หน้าหลักระบบจัดการ</p>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-200/80 md:text-lg">
              หน้าแรกนี้ดึงตัวเลขจาก API จริง (อ่านอย่างเดียว) เพื่อให้เห็นสถานะการเชื่อมต่อและปริมาณข้อมูลทันที พร้อมทางลัดไปหน้าที่ใช้งานจริง
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/money"
                className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-white/30 hover:bg-slate-50"
              >
                เริ่มที่โมดูลการเงิน
              </Link>
              <Link
                href="/readiness"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/10"
              >
                ตรวจความพร้อมระบบ
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
              >
                เข้าสู่ระบบ
              </Link>
            </div>
          </div>

          <aside className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur md:mt-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-200/70">สถานะล็อกอิน (PHP)</p>
                <p className="mt-2 text-lg font-semibold">
                  {loading ? "กำลังตรวจสอบ..." : snapshot?.session.authenticated ? "ล็อกอินแล้ว" : "ยังไม่ล็อกอิน"}
                </p>
                <p className="mt-1 text-sm text-slate-200/75">
                  {loading
                    ? "รอสักครู่..."
                    : snapshot?.session.authenticated
                      ? `ผู้ใช้: ${snapshot.session.username || "-"} · บทบาท: ${snapshot.session.role}`
                      : "ถ้าเปิดผ่าน Basic Auth + session แล้ว ค่าตรงนี้จะอัปเดตทันที"}
                </p>
              </div>
              <span
                className={[
                  "shrink-0 rounded-full px-3 py-1 text-xs font-semibold ring-1",
                  loading
                    ? "bg-white/5 text-slate-200 ring-white/10"
                    : snapshot?.session.authenticated
                      ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/25"
                      : "bg-amber-500/15 text-amber-100 ring-amber-400/25",
                ].join(" ")}
              >
                {loading ? "WAIT" : snapshot?.session.authenticated ? "OK" : "AUTH"}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {(isAdmin || isFinance) && (
                <Link
                  href="/executive"
                  className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45"
                >
                  แดชบอร์ดผู้บริหาร
                </Link>
              )}
              {isAdmin && (
                <>
                  <Link
                    href="/security"
                    className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45"
                  >
                    เฝ้าระวังความปลอดภัย
                  </Link>
                  <Link
                    href="/audit"
                    className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45 sm:col-span-2"
                  >
                    บันทึก Audit
                  </Link>
                  <Link
                    href="/daily-brief"
                    className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45 sm:col-span-2"
                  >
                    สรุปปฏิบัติการประจำวัน
                  </Link>
                  <Link
                    href="/workflow-log"
                    className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45 sm:col-span-2"
                  >
                    บันทึกการเปลี่ยนสถานะงาน
                  </Link>
                </>
              )}
              <Link
                href="/go-live"
                className="rounded-xl border border-white/10 bg-slate-950/30 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-950/45 sm:col-span-2"
              >
                เช็กลิสต์เปิดใช้งานจริง (พิมพ์ได้)
              </Link>
            </div>
          </aside>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "รายการการเงิน",
              value: loading ? "—" : formatInt(snapshot?.moneyCount ?? 0),
              sub: loading ? "กำลังโหลด..." : sourceLabel(snapshot?.moneySource ?? "fallback"),
              ok: snapshot?.moneyOk ?? false,
              hint: snapshot?.moneyMessage,
            },
            {
              title: "แถวข้อมูลสลิป",
              value: loading ? "—" : formatInt(snapshot?.slipCount ?? 0),
              sub: loading ? "กำลังโหลด..." : sourceLabel(snapshot?.slipSource ?? "fallback"),
              ok: snapshot?.slipOk ?? false,
              hint: snapshot?.slipMessage,
            },
            {
              title: "ภาษีพร้อมดาวน์โหลด / ทั้งหมด",
              value: loading
                ? "—"
                : `${formatInt(snapshot?.taxReadyCount ?? 0)} / ${formatInt(snapshot?.taxCount ?? 0)}`,
              sub: loading ? "กำลังโหลด..." : sourceLabel(snapshot?.taxSource ?? "fallback"),
              ok: snapshot?.taxOk ?? false,
              hint: snapshot?.taxMessage,
            },
          ].map((kpi) => (
            <article
              key={kpi.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-100/90">{kpi.title}</p>
                {!loading && (
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1",
                      kpi.ok ? "bg-emerald-500/15 text-emerald-100 ring-emerald-400/25" : "bg-amber-500/15 text-amber-100 ring-amber-400/25",
                    ].join(" ")}
                  >
                    {kpi.ok ? "API OK" : "FALLBACK"}
                  </span>
                )}
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight">{kpi.value}</p>
              <p className="mt-2 text-sm text-slate-200/70">{kpi.sub}</p>
              {!loading && kpi.hint ? <p className="mt-2 text-xs text-slate-200/55">หมายเหตุ: {kpi.hint}</p> : null}
            </article>
          ))}
        </section>

        {isAdmin ? (
          <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Executive Snapshot (รายวัน)</h3>
                <p className="mt-1 text-sm text-slate-200/80">สรุปสั้นจาก Daily Brief สำหรับผู้บริหาร</p>
              </div>
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold ring-1",
                  loading
                    ? "bg-white/5 text-slate-200 ring-white/10"
                    : snapshot?.dailyRiskLevel === "critical"
                      ? "bg-red-500/15 text-red-100 ring-red-400/25"
                      : snapshot?.dailyRiskLevel === "warn"
                        ? "bg-amber-500/15 text-amber-100 ring-amber-400/25"
                        : "bg-emerald-500/15 text-emerald-100 ring-emerald-400/25",
                ].join(" ")}
              >
                {loading ? "WAIT" : `RISK: ${(snapshot?.dailyRiskLevel || "ok").toUpperCase()}`}
              </span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs text-slate-300/80">Audit ทั้งหมด (วันนี้)</p>
                <p className="mt-1 text-2xl font-bold">{loading ? "—" : formatInt(snapshot?.dailyAuditTotal ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs text-slate-300/80">Security events (วันนี้)</p>
                <p className="mt-1 text-2xl font-bold">{loading ? "—" : formatInt(snapshot?.dailySecurityTotal ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs text-slate-300/80">คำแนะนำ</p>
                <p className="mt-1 text-sm text-slate-100">
                  {loading ? "กำลังโหลด..." : snapshot?.dailyRecommendations?.[0] || "ภาพรวมปกติ"}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <Link
                href="/daily-brief"
                className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                เปิดรายงาน Daily Brief แบบเต็ม
              </Link>
            </div>
          </section>
        ) : null}

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          {modules.map((mod) => (
            <article
              key={mod.name}
              className={[
                "group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-5 shadow-sm backdrop-blur",
                mod.accent,
              ].join(" ")}
            >
              <div className="absolute inset-0 bg-white/60 opacity-0 transition group-hover:opacity-100" />
              <div className="relative">
                <span className="inline-flex rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/10">
                  อ่านอย่างเดียว
                </span>
                <h2 className="mt-4 text-xl font-semibold text-slate-950">{mod.name}</h2>
                <p className="mt-2 min-h-16 text-sm leading-relaxed text-slate-700">{mod.desc}</p>
                <Link
                  href={mod.href}
                  className="mt-5 inline-flex rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  เข้าสู่หน้าจัดการ
                </Link>
              </div>
            </article>
          ))}
        </section>

        <section className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h3 className="text-lg font-semibold">สถานะโครงการ (พร้อมใช้งานจริง)</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-200/80">
            ระบบหลักพร้อมใช้งานแบบอ่านอย่างเดียวจากฐานข้อมูลเดิม มีเครื่องมือสำหรับปฏิบัติการจริงครบชุด (Readiness, Go-Live, UAT Sign-off, Health Check,
            Executive, Security, Audit) และรองรับการส่งออก CSV/พิมพ์รายงานในโมดูลหลัก
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/readiness"
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              ตรวจความพร้อม
            </Link>
            <Link
              href="/executive"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              ภาพรวมผู้บริหาร
            </Link>
            <Link
              href="/health"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              ตรวจสุขภาพระบบ
            </Link>
            <Link
              href="/uat-signoff"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              แบบฟอร์ม UAT
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-transparent px-4 py-2 text-sm font-semibold text-white hover:bg-white/5"
            >
              ไปหน้าเข้าสู่ระบบ
            </Link>
          </div>
        </section>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white text-slate-900 shadow-sm">
          <SystemSummary
            variant="embedded"
            loading={loading}
            updatedAt={snapshot?.fetchedAt}
            stats={centralStats}
            sourcesLine={snapshot ? centralSourcesLine : undefined}
          />
        </div>
      </main>
    </div>
  );
}
