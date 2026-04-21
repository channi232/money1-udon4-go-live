"use client";

export type SummaryStat = {
  key: string;
  label: string;
  value: string;
};

export type SystemSummaryProps = {
  loading?: boolean;
  /** เวลาที่ประกอบชุดข้อมูล (แสดงตาม locale th-TH) */
  updatedAt?: string;
  stats?: SummaryStat[];
  /** บรรทัดเล็กใต้การ์ด เช่น แหล่งข้อมูลแต่ละโมดูล */
  sourcesLine?: string;
  /** embedded = อยู่ในกรอบพื้นหลังจากหน้าแม่แล้ว ไม่ซ้ำขอบหนา */
  variant?: "standalone" | "embedded";
};

export default function SystemSummary({
  loading,
  updatedAt,
  stats,
  sourcesLine,
  variant = "standalone",
}: SystemSummaryProps) {
  const shell =
    variant === "embedded"
      ? "rounded-2xl border-0 bg-transparent p-6 shadow-none"
      : "mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

  if (loading) {
    return (
      <section className={shell}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-lg font-semibold">ภาพรวมข้อมูลกลาง (Read-only)</h3>
          <span className="text-xs text-slate-500">กำลังโหลด...</span>
        </div>
        <p className="text-sm text-slate-500">กำลังประกอบภาพรวมจากชุดข้อมูล API เดียวกับ KPI ด้านบน</p>
      </section>
    );
  }

  if (!updatedAt || !stats?.length) {
    return (
      <section className={shell}>
        <p className="text-sm font-medium text-rose-600">ยังไม่มีข้อมูลสำหรับแสดงภาพรวม</p>
      </section>
    );
  }

  return (
    <section className={shell}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-lg font-semibold">ภาพรวมข้อมูลกลาง (Read-only)</h3>
        <span className="text-xs text-slate-500">อัปเดตล่าสุด: {updatedAt}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((s) => (
          <article key={s.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{s.label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{s.value}</p>
          </article>
        ))}
      </div>
      {sourcesLine ? <p className="mt-4 text-xs leading-relaxed text-slate-500">{sourcesLine}</p> : null}
    </section>
  );
}
