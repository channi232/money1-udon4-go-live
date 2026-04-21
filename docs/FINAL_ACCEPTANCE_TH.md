# FINAL ACCEPTANCE (TH)

เอกสารรับรองความพร้อมระบบใหม่ `money.udon4.go.th` เพื่อทดแทนระบบเดิมที่ถูกโจมตี/ล้าสมัย  
ผู้รับผิดชอบหลัก: ผู้ดูแลระบบ (Single Operator)

---

## 1) วัตถุประสงค์การรับมอบ

- ยืนยันว่า **เงื่อนไข/ฟังก์ชันเดิมมีครบ** (Functional Parity)
- ยืนยันว่า **ระบบใหม่ดีกว่าระบบเดิม** ด้าน Security, Reliability, Operability
- ใช้เป็นหลักฐานก่อน Go-Live และเอกสารอ้างอิงหลังใช้งานจริง

---

## 2) ขอบเขตระบบที่รับมอบ

- โมดูลหลัก: `Money`, `Slip`, `Tax`
- ระบบสนับสนุน: `Readiness`, `Go-Live`, `Go-Live Day`, `UAT Sign-off`, `Health`, `Audit`, `Security`, `Incident Log`, `Executive Snapshot`, `Daily Brief`
- ฝั่ง API: `/api/session.php`, `/api/money-summary-v3.php`, `/api/slip-summary.php`, `/api/tax-summary.php`, `/api/daily-brief.php`, `/api/security-events.php`, `/api/audit-view.php`, และ endpoint ที่เกี่ยวข้อง

---

## 3) ตารางเทียบ “ระบบเดิม” vs “ระบบใหม่”

| หมวด | ระบบเดิม | ระบบใหม่ | เกณฑ์ผ่าน |
|---|---|---|---|
| การเข้าถึงข้อมูล Money/Slip/Tax | มีใช้งานแยกระบบ | รวมในโดเมนเดียว + เมนูกลาง | เปิดใช้งานครบ 3 โมดูล |
| Export CSV/Print | มีบางจุด/ไม่เป็นมาตรฐาน | ครบทุกโมดูลหลัก + บันทึก audit | ทดสอบ export/print ผ่านครบ |
| Authentication/Role | กระจัดกระจาย | Session + Role mapping กลาง | role ถูกต้องตามผู้ใช้ |
| การป้องกัน API | ไม่สม่ำเสมอ | Method enforcement + same-origin write | POST ผิด method ต้องถูก block |
| การป้องกันไฟล์ config | เสี่ยงเข้าถึงตรง | `.htaccess` ปิดการเข้าถึงไฟล์สำคัญ | เข้าไฟล์ config ตรงไม่ได้ |
| การเฝ้าระวังความปลอดภัย | จำกัด/ไม่เป็นระบบ | Security Monitor + Threshold + History | หน้า security ใช้งานได้ |
| การตรวจย้อนหลัง | กระจาย/ขาดหลักฐาน | Audit Viewer + Incident Log | ดูย้อนหลังได้ตามสิทธิ์ |
| ความพร้อมก่อนขึ้นจริง | ไม่มี gate ชัด | Readiness checklist + Go-Live runbook | readiness ผ่านตามเกณฑ์ |
| สุขภาพระบบ | ไม่มีหน้าเดียวจบ | Health Check API สำคัญ + latency | health แสดงผลครบ |
| ความทนทาน schema เดิม | auto-detect เสี่ยงผิด | deterministic schema-map + strict mode | source=database ตามเกณฑ์ |
| การกู้คืน | ไม่เป็นมาตรฐาน | backup + rollback plan ชัดเจน | restore ทำได้ตามขั้นตอน |

---

## 4) Acceptance Criteria (ผ่าน/ไม่ผ่าน)

### A) Functional Parity
- [ ] Money แสดงข้อมูลจริงได้
- [ ] Slip แสดงข้อมูลจริงได้
- [ ] Tax แสดงข้อมูลจริงได้
- [ ] Export CSV ครบทั้ง 3 โมดูล
- [ ] Print Report ครบทั้ง 3 โมดูล

### B) Security Uplift
- [ ] `/api/session.php` บังคับ `GET` เท่านั้น
- [ ] endpoint ที่เป็น write action บังคับ same-origin
- [ ] role mapping ใช้งานจาก config กลาง
- [ ] ป้องกัน direct access ไฟล์ config สำคัญได้
- [ ] Security events แสดงผลและสรุปได้

### C) Operational Uplift
- [ ] `/readiness` ผ่านตามเกณฑ์ปัจจุบัน
- [ ] `/health` ตรวจ API สำคัญได้ครบ
- [ ] `/go-live`, `/go-live-day`, `/uat-signoff` ใช้งานได้จริง
- [ ] `/incident-log` พร้อมใช้งานช่วง T-0 ถึง T+24h

### D) Data Integrity
- [ ] KPI หน้าแรกแสดง `API OK` ตามสภาวะปกติ
- [ ] `/api/money-summary-v3.php?debug=1` => `source=database`
- [ ] `/api/slip-summary.php?debug=1` => `source=database`
- [ ] `/api/tax-summary.php?debug=1` => `source=database`

### E) Recoverability
- [ ] backup `public_html` และ `api` ล่าสุดพร้อมใช้งาน
- [ ] rollback steps ผ่าน dry-run ขั้นต้น

---

## 5) หลักฐานที่ต้องเก็บ (Evidence Pack)

เก็บในโฟลเดอร์วันเดียวกัน เช่น `evidence/2026-04-17/`

- [ ] ภาพหน้า `/` (KPI + API OK)
- [ ] ภาพหน้า `/readiness` (ผลรวมผ่าน/ไม่ผ่าน)
- [ ] ภาพหน้า `/health` (status + latency)
- [ ] ภาพหน้า `/security` (summary + thresholds)
- [ ] ภาพหน้า `/audit` (มีรายการ)
- [ ] ผล debug API 3 ตัว (`money/slip/tax`)
- [ ] ไฟล์ CSV ที่ export จริงอย่างน้อย 1 ชุดต่อโมดูล
- [ ] UAT Sign-off ที่ลงนามแล้ว
- [ ] Go-Live Day Checklist ที่ลงบันทึกแล้ว

---

## 6) Single-Operator Decision Gate

ให้ “อนุมัติขึ้นระบบจริง” เมื่อครบทุกข้อ:

1. Readiness ผ่านตามเกณฑ์สำคัญ  
2. Health ผ่านและ latency อยู่ในเกณฑ์ยอมรับได้  
3. Money/Slip/Tax เป็น `source=database` (สภาวะปกติ)  
4. Export/Print ผ่านครบ 3 โมดูล  
5. มี backup + rollback พร้อมใช้งาน

หากมีข้อใดไม่ผ่าน ให้สถานะเป็น “Hold Go-Live”

---

## 7) สรุปผลรับมอบ

- วันที่ประเมิน: ______________________
- เวลาประเมิน: ______________________
- ผลการประเมิน: ☐ ผ่าน  ☐ ผ่านแบบมีเงื่อนไข  ☐ ไม่ผ่าน
- เงื่อนไขเพิ่มเติม (ถ้ามี): _____________________________________________

ผู้ประเมิน/ผู้อนุมัติ (Single Operator):  
ลงชื่อ _______________________________

---

## 8) Post Go-Live (24 ชั่วโมงแรก)

- [ ] ตรวจ `/security` และ `/audit` ทุก 30-60 นาที
- [ ] บันทึกเหตุผิดปกติลง `/incident-log` ทุกครั้ง
- [ ] สรุปผล T+24 ชั่วโมง พร้อมตัดสินใจคงระบบ/rollback

---

เอกสารนี้ใช้ร่วมกับ:
- `docs/DEPLOY_CHECKLIST_TH.md`
- `docs/GO_LIVE_RUNBOOK_TH.md`
# FINAL ACCEPTANCE (TH)

เอกสารรับรองความพร้อมระบบใหม่ `money.udon4.go.th` เพื่อทดแทนระบบเดิมที่ถูกโจมตี/ล้าสมัย  
ผู้รับผิดชอบหลัก: ผู้ดูแลระบบ (Single Operator)

---

## 1) วัตถุประสงค์การรับมอบ

- ยืนยันว่า **เงื่อนไข/ฟังก์ชันเดิมมีครบ** (Functional Parity)
- ยืนยันว่า **ระบบใหม่ดีกว่าระบบเดิม** ด้าน Security, Reliability, Operability
- ใช้เป็นหลักฐานก่อน Go-Live และเอกสารอ้างอิงหลังใช้งานจริง

---

## 2) ขอบเขตระบบที่รับมอบ

- โมดูลหลัก: `Money`, `Slip`, `Tax`
- ระบบสนับสนุน: `Readiness`, `Go-Live`, `Go-Live Day`, `UAT Sign-off`, `Health`, `Audit`, `Security`, `Incident Log`, `Executive Snapshot`, `Daily Brief`
- ฝั่ง API: `/api/session.php`, `/api/money-summary-v3.php`, `/api/slip-summary.php`, `/api/tax-summary.php`, `/api/daily-brief.php`, `/api/security-events.php`, `/api/audit-view.php`, และ endpoint ที่เกี่ยวข้อง

---

## 3) ตารางเทียบ “ระบบเดิม” vs “ระบบใหม่”

| หมวด | ระบบเดิม | ระบบใหม่ | เกณฑ์ผ่าน |
|---|---|---|---|
| การเข้าถึงข้อมูล Money/Slip/Tax | มีใช้งานแยกระบบ | รวมในโดเมนเดียว + เมนูกลาง | เปิดใช้งานครบ 3 โมดูล |
| Export CSV/Print | มีบางจุด/ไม่เป็นมาตรฐาน | ครบทุกโมดูลหลัก + บันทึก audit | ทดสอบ export/print ผ่านครบ |
| Authentication/Role | กระจัดกระจาย | Session + Role mapping กลาง | role ถูกต้องตามผู้ใช้ |
| การป้องกัน API | ไม่สม่ำเสมอ | Method enforcement + same-origin write | POST ผิด method ต้องถูก block |
| การป้องกันไฟล์ config | เสี่ยงเข้าถึงตรง | `.htaccess` ปิดการเข้าถึงไฟล์สำคัญ | เข้าไฟล์ config ตรงไม่ได้ |
| การเฝ้าระวังความปลอดภัย | จำกัด/ไม่เป็นระบบ | Security Monitor + Threshold + History | หน้า security ใช้งานได้ |
| การตรวจย้อนหลัง | กระจาย/ขาดหลักฐาน | Audit Viewer + Incident Log | ดูย้อนหลังได้ตามสิทธิ์ |
| ความพร้อมก่อนขึ้นจริง | ไม่มี gate ชัด | Readiness checklist + Go-Live runbook | readiness ผ่านตามเกณฑ์ |
| สุขภาพระบบ | ไม่มีหน้าเดียวจบ | Health Check API สำคัญ + latency | health แสดงผลครบ |
| ความทนทาน schema เดิม | auto-detect เสี่ยงผิด | deterministic schema-map + strict mode | source=database ตามเกณฑ์ |
| การกู้คืน | ไม่เป็นมาตรฐาน | backup + rollback plan ชัดเจน | restore ทำได้ตามขั้นตอน |

---

## 4) Acceptance Criteria (ผ่าน/ไม่ผ่าน)

### A) Functional Parity
- [ ] Money แสดงข้อมูลจริงได้
- [ ] Slip แสดงข้อมูลจริงได้
- [ ] Tax แสดงข้อมูลจริงได้
- [ ] Export CSV ครบทั้ง 3 โมดูล
- [ ] Print Report ครบทั้ง 3 โมดูล

### B) Security Uplift
- [ ] `/api/session.php` บังคับ `GET` เท่านั้น
- [ ] endpoint ที่เป็น write action บังคับ same-origin
- [ ] role mapping ใช้งานจาก config กลาง
- [ ] ป้องกัน direct access ไฟล์ config สำคัญได้
- [ ] Security events แสดงผลและสรุปได้

### C) Operational Uplift
- [ ] `/readiness` ผ่านตามเกณฑ์ปัจจุบัน
- [ ] `/health` ตรวจ API สำคัญได้ครบ
- [ ] `/go-live`, `/go-live-day`, `/uat-signoff` ใช้งานได้จริง
- [ ] `/incident-log` พร้อมใช้งานช่วง T-0 ถึง T+24h

### D) Data Integrity
- [ ] KPI หน้าแรกแสดง `API OK` ตามสภาวะปกติ
- [ ] `/api/money-summary-v3.php?debug=1` => `source=database`
- [ ] `/api/slip-summary.php?debug=1` => `source=database`
- [ ] `/api/tax-summary.php?debug=1` => `source=database`

### E) Recoverability
- [ ] backup `public_html` และ `api` ล่าสุดพร้อมใช้งาน
- [ ] rollback steps ผ่าน dry-run ขั้นต้น

---

## 5) หลักฐานที่ต้องเก็บ (Evidence Pack)

เก็บในโฟลเดอร์วันเดียวกัน เช่น `evidence/2026-04-17/`

- [ ] ภาพหน้า `/` (KPI + API OK)
- [ ] ภาพหน้า `/readiness` (ผลรวมผ่าน/ไม่ผ่าน)
- [ ] ภาพหน้า `/health` (status + latency)
- [ ] ภาพหน้า `/security` (summary + thresholds)
- [ ] ภาพหน้า `/audit` (มีรายการ)
- [ ] ผล debug API 3 ตัว (`money/slip/tax`)
- [ ] ไฟล์ CSV ที่ export จริงอย่างน้อย 1 ชุดต่อโมดูล
- [ ] UAT Sign-off ที่ลงนามแล้ว
- [ ] Go-Live Day Checklist ที่ลงบันทึกแล้ว

---

## 6) Single-Operator Decision Gate

ให้ “อนุมัติขึ้นระบบจริง” เมื่อครบทุกข้อ:

1. Readiness ผ่านตามเกณฑ์สำคัญ  
2. Health ผ่านและ latency อยู่ในเกณฑ์ยอมรับได้  
3. Money/Slip/Tax เป็น `source=database` (สภาวะปกติ)  
4. Export/Print ผ่านครบ 3 โมดูล  
5. มี backup + rollback พร้อมใช้งาน

หากมีข้อใดไม่ผ่าน ให้สถานะเป็น “Hold Go-Live”

---

## 7) สรุปผลรับมอบ

- วันที่ประเมิน: ______________________
- เวลาประเมิน: ______________________
- ผลการประเมิน: ☐ ผ่าน  ☐ ผ่านแบบมีเงื่อนไข  ☐ ไม่ผ่าน
- เงื่อนไขเพิ่มเติม (ถ้ามี): _____________________________________________

ผู้ประเมิน/ผู้อนุมัติ (Single Operator):  
ลงชื่อ _______________________________

---

## 8) Post Go-Live (24 ชั่วโมงแรก)

- [ ] ตรวจ `/security` และ `/audit` ทุก 30-60 นาที
- [ ] บันทึกเหตุผิดปกติลง `/incident-log` ทุกครั้ง
- [ ] สรุปผล T+24 ชั่วโมง พร้อมตัดสินใจคงระบบ/rollback

---

เอกสารนี้ใช้ร่วมกับ:
- `docs/DEPLOY_CHECKLIST_TH.md`
- `docs/GO_LIVE_RUNBOOK_TH.md`
