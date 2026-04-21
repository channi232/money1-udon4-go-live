# Sprint-2 Execution Plan (Thai)

แผนนี้ใช้สำหรับเริ่มพัฒนาเชิงลึกหลังจบ Sprint-1 stabilization โดยเน้น “ทำงานจริงได้เร็ว + วัดผลได้”

## 1) เป้าหมาย Sprint-2 (2 สัปดาห์)

- ยกระดับการทำงานจริงของ 3 โมดูลให้ใช้งานในระดับทีมปฏิบัติการได้ลื่น
- ลดเวลาหาเหตุด้วย trace/incident workflow ที่ครบวงจร
- ปิดช่องว่าง UX ที่ทำให้ผู้ใช้ต้องคลิกหลายครั้งเกินจำเป็น

## 2) งานหลักตามโมดูล

### Money (Priority-1)
- เพิ่ม `saved view` แบบหลาย preset ต่อผู้ใช้ (ไม่ใช่แค่ล่าสุด)
- เพิ่ม quick action สำหรับคิวสูง (mass print/export ตามเกณฑ์)
- เพิ่มสรุป metric ที่ export ได้ (ยอดรวม/เฉลี่ย/คิวสูง)

### Tax (Priority-1)
- เพิ่ม `print คิวสูง` แบบ one-click
- เพิ่มสรุป metric ตามมุมมอง (ready / in_review / rejected / priority)
- ปรับ search ให้รองรับคำไทย-อังกฤษผสมและเลขบัตร masked ได้แม่นขึ้น

### Slip (Priority-1)
- เพิ่ม `print คิวสูง` แบบ one-click
- เพิ่มสรุป metric ตามมุมมอง (net total / avg / high queue)
- ปรับ preset ให้ตรงเวรงานจริง (ตรวจคิวสูง, ตรวจ monitoring, ปิดคิว)

## 3) งานข้ามโมดูล (Shared)

- ตั้งมาตรฐาน label/preset/tooltip ให้ตรงกันทั้ง 3 โมดูล
- เพิ่ม regression smoke script (manual checklist + เวลาทดสอบจริง)
- ปรับหน้า incident-log ให้บันทึก/export พร้อม metadata ของกะงาน (shift)

## 4) Definition of Done (DoD)

- Build ผ่าน + ไม่มี lints ใหม่
- ผ่าน `docs/SPRINT1_REGRESSION_CHECKLIST_TH.md` ในขอบเขตที่เกี่ยวข้อง
- ผู้ใช้งานหลักอย่างน้อย 1 บทบาททดสอบและยืนยันผล
- มี commit message อธิบายเหตุผลและผลลัพธ์ชัดเจน

## 5) ลำดับการทำ (แนะนำ)

1. ปิดงาน one-click print/export คิวสูงให้ `tax` และ `slip`
2. เพิ่ม metric panel ให้ `tax` และ `slip`
3. เก็บงาน shared UX consistency
4. ปิดเอกสารสรุปผล Sprint-2 + release note

