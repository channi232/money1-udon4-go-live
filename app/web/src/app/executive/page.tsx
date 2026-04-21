"use client";

import AuthGuard from "@/components/auth-guard";
import { useEffect, useMemo, useState } from "react";
import { fetchMoneyRows } from "@/lib/money-api";
import { fetchSlipRows } from "@/lib/slip-api";
import { fetchTaxRows } from "@/lib/tax-api";
import { fetchAuditRows } from "@/lib/audit-view-api";
import { fetchSecurityEvents } from "@/lib/security-events-api";

type ExecutiveState = {
  moneyCount: number;
  moneyTotal: number;
  slipCount: number;
  slipTotal: number;
  taxCount: number;
  auditCount: number;
  auditToday: number;
  secToday429: number;
  sec7d429: number;
  sourceMoney: string;
  sourceSlip: string;
  sourceTax: string;
};

const INITIAL: ExecutiveState = {
  moneyCount: 0,
  moneyTotal: 0,
  slipCount: 0,
  slipTotal: 0,
  taxCount: 0,
  auditCount: 0,
  auditToday: 0,
  secToday429: 0,
  sec7d429: 0,
  sourceMoney: "-",
  sourceSlip: "-",
  sourceTax: "-",
};

function isTodayIso(iso: string): boolean {
  return (iso || "").slice(0, 10) === new Date().toISOString().slice(0, 10);
}

function exportExecutiveCsv(data: ExecutiveState, updatedAt: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  const rows = [
    ["updated_at", updatedAt],
    ["money_count", String(data.moneyCount)],
    ["money_total", String(data.moneyTotal)],
    ["money_source", data.sourceMoney],
    ["slip_count", String(data.slipCount)],
    ["slip_total", String(data.slipTotal)],
    ["slip_source", data.sourceSlip],
    ["tax_count", String(data.taxCount)],
    ["tax_source", data.sourceTax],
    ["audit_count", String(data.auditCount)],
    ["audit_today", String(data.auditToday)],
    ["security_today_429", String(data.secToday429)],
    ["security_7d_429", String(data.sec7d429)],
  ];
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `executive-summary-${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExecutivePage() {
  const [data, setData] = useState<ExecutiveState>(INITIAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchMoneyRows(),
      fetchSlipRows(),
      fetchTaxRows(),
      fetchAuditRows({ limit: 200 }),
      fetchSecurityEvents({ limit: 200 }),
    ])
      .then(([money, slip, tax, audit, sec]) => {
        if (!active) return;
        const moneyTotal = money.rows.reduce((sum, r) => sum + r.amount, 0);
        const slipTotal = slip.rows.reduce((sum, r) => sum + r.net, 0);
        const auditToday = audit.rows.filter((r) => isTodayIso(r.ts)).length;
        setData({
          moneyCount: money.rows.length,
          moneyTotal,
          slipCount: slip.rows.length,
          slipTotal,
          taxCount: tax.rows.length,
          auditCount: audit.rows.length,
          auditToday,
          secToday429: sec.summary?.today_count ?? 0,
          sec7d429: sec.summary?.seven_day_count ?? 0,
          sourceMoney: money.source,
          sourceSlip: slip.source,
          sourceTax: tax.source,
        });
        setError("");
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("โหลดข้อมูลสรุปไม่สำเร็จ");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updatedAt = useMemo(
    () => new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date()),
    [],
  );

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">แดชบอร์ดผู้บริหาร</h1>
        <p className="mt-3 text-slate-600">ภาพรวมผู้บริหาร: การเงิน สลิป ภาษี และความปลอดภัย ในหน้าเดียว</p>
        <p className="mt-1 text-sm text-slate-500">อัปเดตล่าสุด: {updatedAt}</p>
        <div className="no-print mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => exportExecutiveCsv(data, updatedAt)}
          >
            ส่งออก CSV สรุปผู้บริหาร
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์รายงานผู้บริหาร
          </button>
        </div>
        <div className="print-only mt-4 rounded-lg border border-slate-300 bg-white p-3">
          <h2 className="text-xl font-bold">รายงานสรุปผู้บริหาร</h2>
          <p className="text-sm text-slate-700">วันที่พิมพ์: {updatedAt}</p>
          <p className="text-sm text-slate-700">
            Money {data.moneyCount} รายการ | Slip {data.slipCount} รายการ | Tax {data.taxCount} รายการ
          </p>
        </div>

        {error ? <p className="mt-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p> : null}
        {loading ? <p className="mt-3 text-sm text-slate-500">กำลังโหลดข้อมูล...</p> : null}

        <section className="mt-6 grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm text-slate-500">โมดูลการเงิน</h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.moneyCount.toLocaleString()} รายการ</p>
            <p className="text-sm text-slate-600">ยอดรวม {data.moneyTotal.toLocaleString()} บาท</p>
            <p className="mt-1 text-xs text-slate-500">แหล่งข้อมูล: {data.sourceMoney}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm text-slate-500">โมดูลสลิป</h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.slipCount.toLocaleString()} รายการ</p>
            <p className="text-sm text-slate-600">ยอดรวมสุทธิ {data.slipTotal.toLocaleString()} บาท</p>
            <p className="mt-1 text-xs text-slate-500">แหล่งข้อมูล: {data.sourceSlip}</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm text-slate-500">โมดูลภาษี</h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.taxCount.toLocaleString()} รายการ</p>
            <p className="text-sm text-slate-600">เอกสารพร้อมดาวน์โหลด/ติดตาม</p>
            <p className="mt-1 text-xs text-slate-500">แหล่งข้อมูล: {data.sourceTax}</p>
          </article>
        </section>

        <section className="mt-4 grid gap-3 md:grid-cols-2">
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm text-slate-500">กิจกรรม Audit</h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.auditCount.toLocaleString()} เหตุการณ์ล่าสุด</p>
            <p className="text-sm text-slate-600">วันนี้เกิด {data.auditToday.toLocaleString()} เหตุการณ์</p>
          </article>
          <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm text-slate-500">ความปลอดภัย (Rate Limit)</h2>
            <p className="mt-1 text-2xl font-bold text-slate-900">{data.secToday429.toLocaleString()} ครั้งวันนี้</p>
            <p className="text-sm text-slate-600">7 วันล่าสุด {data.sec7d429.toLocaleString()} ครั้ง</p>
          </article>
        </section>
      </main>
    </AuthGuard>
  );
}
