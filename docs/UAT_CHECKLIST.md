# UAT Checklist (Pre-Go-Live)

Mark each item as `PASS` / `FAIL` / `N/A` and record evidence screenshot or URL.

## 1) Access and Security

- [ ] Basic Auth prompts correctly for unauthenticated browsers.
- [ ] Unauthorized user cannot access `/money/`, `/slip/`, `/tax/`.
- [ ] Role `finance` can access allowed pages only.
- [ ] Role `personnel` can access allowed pages only.
- [ ] Role `admin` can access all modules.
- [ ] API endpoints are not publicly writable.
- [ ] Sensitive files (`db-config.php`, etc.) are not directly accessible.

## 2) Slip Module

- [ ] `/api/slip-summary.php?debug=1` returns `source: database`.
- [ ] Slip list loads within acceptable time.
- [ ] Search by employee ID works.
- [ ] Search by employee name works.
- [ ] Filter by month works.
- [ ] Display values (month, net amount) match legacy sample records.
- [ ] Name enrichment from personnel source works as expected.

## 3) Tax Module

- [ ] Tax module page loads without error.
- [ ] Search/filter behavior matches business expectation.
- [ ] Download flow works for authorized users.
- [ ] Output format matches legacy requirement.

## 4) Money Module

- [ ] Money module page loads without error.
- [ ] Status filters and search work.
- [ ] Amount values match legacy sample records.
- [ ] Approval/review statuses behave correctly (if enabled).

## 5) Data Validation

- [ ] Compare at least 20 sample employees with legacy output.
- [ ] Compare at least 2 historical months.
- [ ] Identify and resolve mismatches before go-live.

## 6) Performance and Stability

- [ ] Main pages load under agreed threshold.
- [ ] API response time under agreed threshold.
- [ ] No critical PHP/Apache errors during test window.

## 7) Cutover Readiness

- [ ] Rollback procedure documented and tested.
- [ ] Backup confirmed and restorable.
- [ ] Stakeholder sign-off complete.

## Sign-Off

- Finance Lead: __________________ Date: __________
- Personnel Lead: ________________ Date: __________
- System Admin: __________________ Date: __________
