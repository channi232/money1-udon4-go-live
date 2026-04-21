"use client";

import AuthGuard from "@/components/auth-guard";

const timeline = [
  { time: "T-60 นาที", task: "ตรวจ /readiness และ /health ล่าสุด", owner: "System Admin" },
  { time: "T-30 นาที", task: "ยืนยันผู้รับผิดชอบ monitor และช่องทางสื่อสาร incident", owner: "System Admin" },
  { time: "T-0", task: "ประกาศเริ่มเปิดใช้งานจริงและเริ่มเฝ้าดูความปลอดภัย/Audit", owner: "Admin + Finance" },
  { time: "T+30 นาที", task: "สุ่มตรวจธุรกรรมจริง 5 รายการ (Money/Slip/Tax)", owner: "Finance + Personnel" },
  { time: "T+2 ชั่วโมง", task: "สรุปผลรอบแรกและบันทึก Incident Log", owner: "Admin" },
  { time: "T+24 ชั่วโมง", task: "ตัดสินใจคงระบบใหม่/rollback พร้อมลงนามปิดรอบ", owner: "ผู้อนุมัติ" },
];

export default function GoLiveDayPage() {
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">เช็กลิสต์วันเปิดใช้งานจริง</h1>
        <p className="mt-3 text-slate-600">เช็กลิสต์วันเปิดใช้งานจริงแบบหน้าเดียว (พิมพ์ใช้งานได้ทันที)</p>

        <div className="no-print mt-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์เช็กลิสต์วันเปิดใช้งานจริง
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">เอกสารวันเปิดใช้งานจริง</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">วัน/เวลาเริ่มเปิดใช้งานจริง</p>
              <p className="mt-1">__________________________</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ผู้ควบคุมหลัก</p>
              <p className="mt-1">__________________________</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm text-slate-600">ช่องทาง Incident</p>
              <p className="mt-1">__________________________</p>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">เวลา</th>
                  <th className="py-2">รายการ</th>
                  <th className="py-2">ผู้รับผิดชอบ</th>
                  <th className="py-2">สถานะ</th>
                  <th className="py-2">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {timeline.map((row) => (
                  <tr key={row.time} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{row.time}</td>
                    <td className="py-2">{row.task}</td>
                    <td className="py-2">{row.owner}</td>
                    <td className="py-2">☐ เสร็จ</td>
                    <td className="py-2">________________</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            ผลสรุปวันแรก: ☐ ผ่านตามแผน ☐ ต้องติดตามเพิ่มเติม ☐ พิจารณา rollback
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
