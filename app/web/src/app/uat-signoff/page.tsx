"use client";

import AuthGuard from "@/components/auth-guard";

const uatChecks = [
  "เข้าสู่ระบบและตรวจสิทธิ์ผู้ใช้งานได้ถูกต้อง",
  "เปิดหน้า Money/Slip/Tax ได้และข้อมูลโหลดจาก API จริง",
  "ทดสอบ Export CSV ครบ 3 โมดูล",
  "ทดสอบพิมพ์รายงานครบ 3 โมดูล",
  "ตรวจหน้า Daily Brief, Readiness และ Health ได้ปกติ",
  "ไม่พบ error สำคัญใน Console/Network ระหว่างทดสอบ",
];

export default function UatSignoffPage() {
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">UAT Sign-off</h1>
        <p className="mt-3 text-slate-600">แบบฟอร์มยืนยันผลทดสอบก่อนขึ้นระบบจริง (ฉบับสั้น)</p>

        <div className="no-print mt-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์แบบฟอร์ม UAT
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">เอกสาร UAT Sign-off</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">หน่วยงาน/ฝ่าย</p>
              <p className="mt-1 text-base">____________________________</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ผู้ทดสอบหลัก</p>
              <p className="mt-1 text-base">____________________________</p>
            </div>
          </div>

          <h2 className="mt-6 text-lg font-semibold">รายการตรวจสอบ UAT</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {uatChecks.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5">☐</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ผลสรุป UAT</p>
              <p className="mt-2">☐ ผ่านทั้งหมด</p>
              <p>☐ ผ่านแบบมีเงื่อนไข</p>
              <p>☐ ไม่ผ่าน</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">หมายเหตุ</p>
              <p className="mt-2 min-h-16">__________________________________________________</p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ผู้รับรองฝ่ายธุรกิจ</p>
              <p className="mt-5">ลงชื่อ ____________________________</p>
              <p>วันที่ ____________________________</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ผู้รับรองฝ่ายระบบ</p>
              <p className="mt-5">ลงชื่อ ____________________________</p>
              <p>วันที่ ____________________________</p>
            </div>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
