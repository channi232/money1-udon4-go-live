# Pre-Module Kickoff Checklist (Thai)

เอกสารนี้ใช้ปิดงานเตรียมความพร้อมก่อนเริ่มพัฒนาเชิงลึกใน 3 โมดูลจริง (`money`, `tax`, `slip`)

## A) Baseline อ้างอิง (ต้องล็อกก่อนเริ่ม)

- Repository: `https://github.com/channi232/money1-udon4-go-live`
- Release: `v1.0.0-go-live`
- Release URL: `https://github.com/channi232/money1-udon4-go-live/releases/tag/v1.0.0-go-live`
- Current HEAD (ล่าสุด): `ce323c1`
- Recent hardening commits:
  - `ce323c1` incident sorting + presets
  - `216d9db` incident free-text search
  - `01678d7` incident filters + filtered export

## B) ความพร้อมเชิงปฏิบัติการ (Go-Live Stabilized)

- [x] โมดูล `money` เปิดใช้งานจริงได้
- [x] โมดูล `tax` เปิดใช้งานจริงได้
- [x] โมดูล `slip` เปิดใช้งานจริงได้
- [x] API มี `request_id` และ `X-Request-Id`
- [x] API มี `error_code` สำหรับ fallback/error สำคัญ
- [x] หน้า admin มีปุ่ม `คัดลอก trace` ทุกโมดูล
- [x] มีหน้า `incident-log` ใช้งานจริง (form + local persistence + export)
- [x] มีตัวกรอง/ค้นหา/เรียงลำดับ/quick preset ใน incident-log

## C) Security & Config Hygiene

- [x] กันไฟล์ config สำคัญออกจาก git แล้ว (`db-config.php`, `epay-db-config.php`, `personal-db-config.php`)
- [x] กัน `.htpasswd` ออกจาก git แล้ว
- [ ] ยืนยันสิทธิ์ไฟล์ config บน production (owner/permission) อีกครั้งก่อนเริ่ม sprint โมดูล
- [ ] ทดสอบ restore backup ล่าสุดแบบจับเวลา (ต้องทำจริงอย่างน้อย 1 รอบ)

## D) Ops เอกสารและ SOP

- [x] `docs/GO_LIVE_RUNBOOK_TH.md`
- [x] `docs/POST_GO_LIVE_24H_MONITORING_TH.md`
- [x] `docs/INCIDENT_TEMPLATE_TH.md`
- [ ] Brief ทีมเวรให้ใช้ flow เดียวกัน (รับแจ้ง → copy trace → incident log → สรุป)

## E) Gate ก่อนเข้า Sprint โมดูล

ให้เริ่มงานโมดูลจริงได้เมื่อผ่านทุกข้อด้านล่าง:

- [ ] ธุรกิจอนุมัติ scope รอบถัดไปของแต่ละโมดูล (ไม่เกิน 3-5 งานหลัก/โมดูล)
- [ ] กำหนด owner ต่อโมดูลชัดเจน (`money` / `tax` / `slip`)
- [ ] กำหนด Definition of Done (DoD) กลางร่วมกัน
- [ ] ตกลง policy hotfix ระหว่าง sprint (ใครอนุมัติ, เงื่อนไข rollback)

## F) Kickoff Plan (แนะนำ 5 วันแรก)

### Day 1: Scope Lock + Data Contract
- ปิด schema-map ที่จำเป็น
- ลิสต์ field จริงที่ต้องใช้ต่อโมดูล

### Day 2: Money Deep Tasks
- workflow edge cases + export + error UX

### Day 3: Tax Deep Tasks
- status mapping พิเศษ + year/search behavior

### Day 4: Slip Deep Tasks
- workflow/trace/incident integration กับเคสจริง

### Day 5: Cross-module Hardening
- regression test + release candidate + sign-off

## G) สิ่งที่ “ต้องไม่ทำ” ระหว่างเริ่ม sprint

- ไม่แก้หลายโมดูลพร้อมกันโดยไม่มี issue/scope ชัด
- ไม่ deploy ข้ามขั้น (ต้อง build ผ่าน + smoke test อย่างน้อย 3 โมดูล)
- ไม่ merge งานที่ไม่มี traceable note (issue/commit message/ผลทดสอบ)

