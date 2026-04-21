"use client";

import AuthGuard from "@/components/auth-guard";
import Link from "next/link";

const checklist = [
  "ยืนยัน Basic Auth และบัญชี admin ใช้งานได้",
  "ยืนยัน /api/session.php?debug=1 ได้ authenticated=true",
  "Money / Slip / Tax แสดง source=database",
  "ทดสอบ Export CSV ทุกโมดูล",
  "ทดสอบ Print Report ทุกโมดูล",
  "ทดสอบหน้า Audit Viewer (admin only)",
  "ทดสอบหน้า Security Monitor + Threshold save/reset",
  "ทดสอบหน้า Executive Dashboard + Export/Print",
  "ทดสอบหน้า Go-Live Readiness ผ่านครบ",
  "ตรวจสิทธิ์ไฟล์สำคัญ (.htaccess/.htpasswd/config) ถูกต้อง",
  "ยืนยันมี backup ก่อนเปิดใช้งานจริง",
  "กำหนดผู้รับผิดชอบ monitor หลังเปิดใช้งาน",
];

const rollbackPlan = [
  "สำรองโฟลเดอร์ /public_html ปัจจุบันไว้เป็น zip",
  "เก็บชุดไฟล์ out ล่าสุดไว้บนเครื่อง admin",
  "หากเกิดปัญหา ให้ restore ชุด backup และ restart session",
  "ตรวจ /api/session.php และ /readiness หลัง rollback",
];

const goLiveGate = [
  {
    gate: "Readiness",
    passCriteria: "/readiness ผ่านครบทุกข้อ (100%)",
    owner: "System Admin",
  },
  {
    gate: "Security",
    passCriteria: "Session/Auth Header/Method enforcement ผ่าน",
    owner: "System Admin",
  },
  {
    gate: "Business Validation",
    passCriteria: "เทียบข้อมูลอย่างน้อย 20 ราย + 2 งวดข้อมูล",
    owner: "Finance + Personnel",
  },
  {
    gate: "Rollback Ready",
    passCriteria: "มี backup ล่าสุด + ทดสอบ restore ขั้นต้นแล้ว",
    owner: "System Admin",
  },
];

const cutoverTimeline = [
  {
    window: "T-1 วัน",
    action: "Freeze การแก้โค้ด, ทำ backup เต็มชุด, ยืนยันผู้รับผิดชอบเวรเฝ้าระวัง",
    verify: "มีไฟล์ backup + รายชื่อผู้รับผิดชอบ",
  },
  {
    window: "T-2 ชั่วโมง",
    action: "รัน /readiness และยืนยันผ่านครบ, ตรวจ session.php/debug อีกครั้ง",
    verify: "ภาพหลักฐาน readiness ล่าสุด",
  },
  {
    window: "T-0 (เริ่ม Go-Live)",
    action: "ประกาศเริ่มใช้งาน, เฝ้าดู /security และ /audit แบบ realtime",
    verify: "ไม่มี error รุนแรงใน 30 นาทีแรก",
  },
  {
    window: "T+2 ชั่วโมง",
    action: "สุ่มตรวจธุรกรรมจริง 10-20 รายการจาก 3 โมดูล",
    verify: "ข้อมูลตรงความคาดหวังธุรกิจ",
  },
  {
    window: "T+24 ชั่วโมง",
    action: "สรุปรายงานวันแรก, ตัดสินใจคงระบบใหม่หรือ rollback",
    verify: "ลงนามรับรองผลโดยผู้รับผิดชอบ",
  },
];

const rollbackTriggers = [
  "ผู้ใช้หลักเข้าใช้งานไม่ได้ต่อเนื่อง > 15 นาที",
  "ข้อมูลผิดเชิงธุรกิจที่กระทบการจ่ายเงินจริง",
  "มีเหตุความปลอดภัยระดับวิกฤตที่ยังควบคุมไม่ได้",
];

const rollbackSteps = [
  "ประกาศสถานะ incident และหยุดการเปลี่ยนแปลงทั้งหมด",
  "restore โฟลเดอร์ public_html จาก backup ล่าสุดที่ผ่านการตรวจ",
  "ยืนยัน endpoint สำคัญ: /api/session.php, /readiness, /money, /slip, /tax",
  "แจ้งผู้ใช้งานว่าระบบกลับสู่สถานะก่อนหน้า พร้อมเวลาคาดการณ์แก้ไข",
  "เก็บหลักฐานเหตุการณ์และทำ post-incident review ภายใน 24 ชั่วโมง",
];

export default function GoLivePage() {
  const printedAt = new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());

  return (
    <AuthGuard allowedRoles={["admin"]}>
      <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12">
        <h1 className="text-3xl font-bold">Go-Live Checklist</h1>
        <p className="mt-3 text-slate-600">เช็กลิสต์ขั้นสุดท้ายก่อนเปิดใช้งานจริง และแผน rollback หากเกิดเหตุฉุกเฉิน</p>

        <div className="no-print mt-3">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            onClick={() => window.print()}
          >
            พิมพ์เช็กลิสต์ Go-Live
          </button>
        </div>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="print-only mb-4 border-b border-slate-300 pb-3">
            <h2 className="text-xl font-bold">เอกสารตรวจความพร้อมก่อน Go-Live</h2>
            <p className="text-sm text-slate-700">วันที่พิมพ์: {printedAt}</p>
          </div>

          <h2 className="text-lg font-semibold">1) Checklist ก่อนเปิดใช้งาน</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {checklist.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5">☐</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-lg font-semibold">2) Go-Live Gate (ผ่านก่อนเปิดใช้งาน)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">Gate</th>
                  <th className="py-2">เกณฑ์ผ่าน</th>
                  <th className="py-2">ผู้รับผิดชอบ</th>
                  <th className="py-2">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {goLiveGate.map((item) => (
                  <tr key={item.gate} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{item.gate}</td>
                    <td className="py-2">{item.passCriteria}</td>
                    <td className="py-2">{item.owner}</td>
                    <td className="py-2">☐ ผ่าน</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-6 text-lg font-semibold">3) Cutover Timeline (Runbook)</h2>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm text-slate-900">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2">ช่วงเวลา</th>
                  <th className="py-2">กิจกรรม</th>
                  <th className="py-2">หลักฐานยืนยัน</th>
                  <th className="py-2">ลงชื่อ</th>
                </tr>
              </thead>
              <tbody>
                {cutoverTimeline.map((item) => (
                  <tr key={item.window} className="border-b border-slate-100">
                    <td className="py-2 font-medium">{item.window}</td>
                    <td className="py-2">{item.action}</td>
                    <td className="py-2">{item.verify}</td>
                    <td className="py-2">________________</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-6 text-lg font-semibold">4) เงื่อนไขตัดสินใจ Rollback</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {rollbackTriggers.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-lg font-semibold">5) แผน Rollback ฉุกเฉิน</h2>
          <ul className="mt-2 space-y-2 text-sm text-slate-800">
            {[...rollbackPlan, ...rollbackSteps].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Go-Live Decision: อนุมัติเปิดใช้งานจริง ☐ ใช่ / ☐ ไม่ใช่ | ผู้อนุมัติ __________________ | เวลา __________________
          </div>

          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            หมายเหตุ: หลังเปิดใช้งานจริง 24 ชั่วโมงแรก ให้ติดตามหน้า Security และ Audit อย่างใกล้ชิด และบันทึกเหตุการณ์ทุกรายการ
          </div>
          <p className="mt-2 text-sm text-slate-600">แนะนำให้บันทึกเหตุการณ์ระหว่าง Go-Live ที่หน้า Incident Log เพื่อใช้สรุปปิดงานวันแรก</p>
          <div className="no-print mt-4 flex flex-wrap gap-2">
            <Link
              href="/health"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
            >
              เปิดหน้า Health Check
            </Link>
            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              เอกสาร deploy อยู่ที่ `docs/DEPLOY_CHECKLIST_TH.md`
            </span>
          </div>
        </section>
      </main>
    </AuthGuard>
  );
}
