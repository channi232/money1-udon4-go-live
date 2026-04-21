# เอกสารส่งมอบระบบ (Handover Note)

อัปเดตล่าสุด: 17 เม.ย. 2569

## 1) ภาพรวมระบบ

ระบบใหม่รวมโมดูลหลักไว้ในโดเมนเดียว `money.udon4.go.th`

- `Money` (สรุปข้อมูลการเงิน)
- `Slip` (สรุปสลิปเงินเดือน)
- `Tax` (สรุปภาษี)
- `Executive` (ภาพรวมผู้บริหาร)
- `Readiness` (ตรวจความพร้อมก่อน Go-Live)
- `Go-Live` (เช็กลิสต์เปิดใช้งานจริง)
- `Audit` (ประวัติ Export/Print)
- `Security` (ติดตามเหตุการณ์ Rate Limit)

สถาปัตยกรรม:

- Frontend: Next.js Static Export (อัปขึ้น `public_html`)
- Backend API: PHP ในโฟลเดอร์ `public_html/api`
- Data Source: ฐานข้อมูลเดิมแบบ read-only
- Auth: Apache Basic Auth + `session.php` map role

## 2) โครงสร้างโฟลเดอร์ที่สำคัญ

- Frontend source: `app/web/src`
- Frontend build output: `app/web/out`
- API source: `deploy/php-auth-api`
- Server hardening/auth: `deploy/server-hardening`

## 3) ขั้นตอน deploy มาตรฐาน

1. Build frontend ใน local
   - `npm run build` (ที่ `app/web`)
2. อัปไฟล์ `app/web/out/*` ไปที่ `/domains/money.udon4.go.th/public_html/`
3. ถ้ามีแก้ API ให้อัปไฟล์จาก `deploy/php-auth-api/*` ไปที่ `/public_html/api/`
4. ทดสอบหลัง deploy
   - `/api/session.php?debug=1`
   - `/money`, `/slip`, `/tax`
   - `/executive`, `/readiness`, `/go-live`
   - `/audit`, `/security`

## 4) บัญชีและสิทธิ์

Basic Auth ปัจจุบัน:

- username: `previewadmin`
- role map: `admin` (ตั้งใน `session.php`)

ไฟล์ที่เกี่ยวข้อง:

- `/public_html/.htaccess`
- `/public_html/.htpasswd`
- `/public_html/api/session.php`

## 5) ความปลอดภัยที่มีแล้ว

- Basic Auth lock ทั้งโดเมน (โหมด preview)
- Security headers + HTTPS redirect
- ปิด index listing
- ป้องกันไฟล์ config สำคัญใน `/api/.htaccess`
- Rate Limit ฝั่ง API
- บันทึก security event (429) และ audit event
- หน้า Security monitor + ตั้ง threshold ได้

## 6) การดูแลรายวัน (Daily Ops)

เช็กวันละ 1 ครั้ง:

1. หน้า `Security`
   - ดู 429 วันนี้/7 วัน
   - ดู top endpoint และ top IP
2. หน้า `Audit`
   - ดู event export/print ผิดปกติ
3. หน้า `Readiness`
   - ต้องผ่านครบทุกเช็กในวันใช้งานจริง

## 7) การจัดการปัญหาเร่งด่วน

### 7.1 ล็อกอินไม่ได้

- เปิด `/api/session.php?debug=1`
- ตรวจ `authenticated` และ `auth_source`
- ถ้าเป็น `false` ให้ตรวจ
  - root `.htaccess` เปิด Basic Auth หรือไม่
  - path `AuthUserFile` ถูกต้องหรือไม่
  - `.htpasswd` ถูกต้องหรือไม่

### 7.2 API 500

- ตรวจไฟล์ API ล่าสุดถูกอัปจริง
- ตรวจ `.htaccess` ใน `/api`
- ตรวจว่า config ไฟล์มีอยู่ครบ (`db-config.php`, ฯลฯ)

### 7.3 Favicon ไม่เปลี่ยน

- ตอนนี้ใช้ `logo-udon.ico` เพื่อลด cache เก่า
- อัปไฟล์ build ใหม่ทั้งชุด และ hard refresh

## 8) แผน rollback

1. เก็บ backup `/public_html` ก่อน deploy ทุกครั้ง
2. ถ้าเกิดปัญหา ให้ restore backup ทันที
3. ทดสอบจุดขั้นต่ำหลัง rollback
   - `/api/session.php?debug=1`
   - `/readiness`
   - `/money`

## 9) ข้อแนะนำต่อเนื่อง

- เพิ่ม alert แจ้งเตือนแบบ external (เช่น LINE Notify / Email) จาก security threshold
- ทำรอบเปลี่ยนรหัส Basic Auth ตามรอบเวลา
- วางแผนย้ายจาก Basic Auth ไป SSO/Identity Provider ในระยะถัดไป
