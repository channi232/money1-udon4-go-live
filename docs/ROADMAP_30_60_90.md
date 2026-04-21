# Roadmap 30 / 60 / 90 Days

## Day 0-30: Legacy Parity First

### Goals
- Stabilize auth/security baseline in production-preview mode.
- Complete read-only parity for Slip module with real database data.
- Lock feature matrix and define acceptance criteria.

### Deliverables
- Slip API uses real data (`source: database`) and validated sample outputs.
- Security hardening checklist complete.
- UAT checklist finalized and started.

### Success Criteria
- No critical errors in preview.
- At least 80% parity for Slip workflows.

---

## Day 31-60: Full Functional Coverage

### Goals
- Complete parity for Tax and Money critical workflows.
- Add standardized exports/reports.
- Improve data quality and role-based controls.

### Deliverables
- Tax and Money API endpoints wired to real databases.
- Unified report/export framework.
- Role and audit event mapping documented.

### Success Criteria
- 100% parity for critical legacy workflows.
- UAT pass rate >= 90% on mandatory checks.

---

## Day 61-90: Modernization and Go-Live Readiness

### Goals
- Add value beyond legacy (dashboard, monitoring, alerting, better UX).
- Complete production controls and rollback readiness.
- Prepare full cutover.

### Deliverables
- Executive dashboard and operational metrics.
- Monitoring + alerting + backup verification.
- Cutover runbook and rollback test evidence.

### Success Criteria
- Business sign-off from all key roles.
- Zero P1 blocker before final cutover.

---

## Execution Rules

- Never break legacy conditions; extend safely.
- Keep read-only mode first for each new integration.
- Promote features by toggle/phase; avoid big-bang release.
- Every release must include security verification and rollback point.
