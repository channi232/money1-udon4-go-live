# money1.udon4.go.th

New isolated project workspace for the unified finance platform.

## Scope
- Consolidate `money`, `slip`, and `tax` into one modern application.
- Keep legacy systems untouched during migration.
- Connect to existing databases (`epay`, `personal`, `reserve`, `slip`) through controlled service layers.

## Safety Rules
- Do not copy legacy source code directly into this folder.
- Rebuild modules with reviewed code only.
- Validate every imported SQL/script before execution.
- Keep credentials out of source control (`.env` only).

## Initial Structure
- `app/` application source code
- `docs/` architecture, migration plans, runbooks
- `infra/` deployment and environment templates
- `scripts/` safe utility and migration scripts

## Next Steps
1. Define target tech stack.
2. Design auth/role model and audit logging.
3. Build a clean MVP portal UI.
4. Integrate each module and database one by one.

## Operations Docs
- `docs/GO_LIVE_RUNBOOK_TH.md` - คู่มือขั้นตอนวัน Go-Live
- `docs/POST_GO_LIVE_24H_MONITORING_TH.md` - เช็กลิสต์เฝ้าระวัง 24 ชั่วโมงแรกหลังเปิดใช้งาน
- `docs/INCIDENT_TEMPLATE_TH.md` - แบบฟอร์มบันทึก incident สำหรับทีม support/ops
- `docs/PRE_MODULE_KICKOFF_CHECKLIST_TH.md` - เช็กลิสต์ปิดงานก่อนเริ่มพัฒนาเชิงลึก 3 โมดูล
- `docs/PRIORITY_POLICY_TH.md` - เกณฑ์ Priority กลางสำหรับ money/tax/slip
- `docs/SPRINT1_REGRESSION_CHECKLIST_TH.md` - เช็กลิสต์ regression ก่อนปล่อยงานรอบย่อย
- `docs/SPRINT2_EXECUTION_PLAN_TH.md` - แผนเริ่ม Sprint-2 แบบลงมือทำได้ทันที
- `docs/SPRINT2_REGRESSION_SHORT_TH.md` - เช็กลิสต์ regression รอบสั้นก่อน deploy งาน Sprint-2
- `docs/LEGACY_UI_LABEL_MAPPING_TH.md` - ตารางเทียบคำระบบเดิมกับคำมาตรฐานระบบใหม่
