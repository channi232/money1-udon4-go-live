# Deployment Checklist (TH)

เช็กลิสต์สั้นสำหรับ deploy ระบบ `money.udon4.go.th` ให้เสถียรและย้อนกลับได้

## ก่อน Deploy

- [ ] ยืนยันว่าโค้ดล่าสุดผ่าน `npm run lint` และ `npm run build`
- [ ] สำรองโฟลเดอร์ `/domains/money.udon4.go.th/public_html` (ยกเว้นไฟล์ขนาดใหญ่ที่ไม่จำเป็น)
- [ ] ยืนยันว่าไฟล์ API ล่าสุดถูกเตรียมครบใน `/public_html/api`
- [ ] เตรียมผู้รับผิดชอบตรวจสอบหลัง deploy (อย่างน้อย 1 admin + 1 ธุรกิจ)

## ขั้นตอน Deploy (Static Frontend)

1. รัน build ที่เครื่องพัฒนา:
   - `Set-Location "D:\FTP\การเงิน\money1.udon4.go.th\app\web"`
   - `npm.cmd run build`
2. ฝั่งเซิร์ฟเวอร์ลบโฟลเดอร์ static เดิม:
   - `_next`, `daily-brief`, `readiness`, `money`, `slip`, `tax`, `executive`, `security`, `audit`, `go-live`, `incident-log`, `login`, `404`, `_not-found`
3. **ห้ามลบ**:
   - `api`, `.htaccess`, `.htpasswd`, ไฟล์ lock ที่ใช้งานอยู่
4. อัปโหลด **เนื้อหาภายใน `out` ทั้งหมด** ไปที่ `public_html` โดยตรง
5. ยืนยันว่าไม่มี path ซ้อนแบบ `public_html/out/...`

## ขั้นตอน Deploy (PHP API)

- [ ] อัปโหลดไฟล์ API ที่เปลี่ยนล่าสุดทุกไฟล์
- [ ] ตรวจสิทธิ์ไฟล์ config:
  - `role-map.php`, `schema-map.php` เข้าถึงจากเว็บตรงไม่ได้ (ตาม `.htaccess`)
- [ ] ตรวจ endpoint debug:
  - `/api/money-summary-v3.php?debug=1`
  - `/api/slip-summary.php?debug=1`
  - `/api/tax-summary.php?debug=1`

## หลัง Deploy ทันที

- [ ] เปิดหน้าเว็บแบบ InPrivate
- [ ] กด `Ctrl+F5` และ purge CDN cache (ถ้ามี)
- [ ] เปิด `/readiness` ต้องผ่านเกณฑ์หลัก
- [ ] เปิด `/health` ตรวจ HTTP + latency + source ของ API สำคัญ
- [ ] เปิดหน้า `/` ยืนยัน KPI เป็น `API OK` และ source เป็น `database`

## Rollback Trigger

- ผู้ใช้หลักเข้าใช้งานไม่ได้ต่อเนื่อง > 15 นาที
- endpoint สำคัญล้มเหลวซ้ำ แม้ clear cache แล้ว
- ข้อมูลธุรกิจผิดอย่างมีนัยสำคัญ (จ่ายเงินจริงผิด)

## Rollback แบบเร็ว

1. ประกาศหยุด deploy และแจ้งผู้เกี่ยวข้อง
2. restore backup `public_html` ชุดก่อนหน้า
3. ตรวจ `/api/session.php`, `/readiness`, `/health`
4. ยืนยันการใช้งานหน้า `money/slip/tax`
5. บันทึก incident และสรุป post-mortem ภายใน 24 ชั่วโมง
