# Sprint-1 Regression Checklist (Thai)

ใช้เช็กลิสต์นี้ทุกครั้งก่อนปล่อยรอบย่อยของ `money`, `tax`, `slip` เพื่อป้องกัน regression

## 1) Common (ทุกโมดูล)

- [ ] เปิดหน้าโมดูลได้ปกติ ไม่มี error หน้าเปล่า
- [ ] แสดง `แหล่งข้อมูลปัจจุบัน` ถูกต้อง
- [ ] ปุ่ม `คัดลอก trace` ใช้งานได้ (admin)
- [ ] ตัวกรอง + ตัวเรียง + preset ทำงานตรงตามคาด
- [ ] Export CSV ได้ไฟล์และ encoding ภาษาไทยถูกต้อง
- [ ] พิมพ์รายงานได้และจำนวนรายการตรงกับมุมมอง
- [ ] Saved view โหลดกลับมาถูกต้องหลัง refresh
- [ ] ปุ่มรีเซ็ตมุมมองคืนค่าเริ่มต้นจริง

## 2) Money

- [ ] คอลัมน์ Priority แสดงผลถูกต้อง (สูง/กลาง/ปกติ)
- [ ] ปุ่ม `Export คิวสูง` ได้เฉพาะคิวสูง
- [ ] ปุ่ม `พิมพ์คิวสูง` กรองมุมมองแล้วพิมพ์ได้
- [ ] ค่า summary (ยอดรวม/เฉลี่ย/คิวสูง) ตรงกับข้อมูลที่กรองอยู่
- [ ] Workflow bulk action และ undo ยังทำงานถูกต้อง

## 3) Tax

- [ ] Priority จาก workflow/status mapping ถูกต้อง
- [ ] ปุ่ม `Export คิวสูง` ได้เฉพาะคิวสูง
- [ ] year filter + search ทำงานร่วมกับ sort/preset ได้ถูกต้อง
- [ ] Workflow action ต่อแถวและ bulk ยังทำงานถูกต้อง

## 4) Slip

- [ ] Priority จาก workflow/net threshold ถูกต้อง
- [ ] ปุ่ม `Export คิวสูง` ได้เฉพาะคิวสูง
- [ ] month filter + search ทำงานร่วมกับ sort/preset ได้ถูกต้อง
- [ ] Workflow action ต่อแถวและ bulk ยังทำงานถูกต้อง

## 5) Incident Log (Ops)

- [ ] เพิ่ม incident / ลบ / รีเซ็ต ได้
- [ ] Trace helper parse `req/code/stage` ถูกต้อง
- [ ] Filter + search + sort + preset ใช้งานร่วมกันได้
- [ ] Export CSV ตามมุมมองที่กรองอยู่จริง

## 6) Sign-off

- [ ] Admin sign-off:
- [ ] Finance sign-off:
- [ ] Personnel sign-off:
- [ ] วันเวลา:

