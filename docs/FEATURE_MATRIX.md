# Feature Matrix (Legacy -> New Platform)

Use this matrix to ensure the new platform reaches 100% legacy parity before full cutover.

## Status Legend
- `DONE` implemented and tested
- `IN_PROGRESS` under development
- `TODO` not started
- `BLOCKED` pending dependency/data decision

## Core Modules

| Area | Legacy Feature | New Feature Target | Status | Notes |
|---|---|---|---|---|
| Auth | Basic login per legacy domain | Central auth/session + role-based access | IN_PROGRESS | Backend session API working, hardening enabled |
| Portal | Separate domain entry points | Single portal (`money.udon4.go.th`) | DONE | Home, money/slip/tax routes live |
| Roles | Mixed/implicit role checks | Explicit RBAC: `finance/personnel/admin` | IN_PROGRESS | Route guard active, backend role mapping active |
| Security | Legacy mixed controls | Basic Auth + API auth + hardening + noindex | DONE | `.htaccess`, robots, session API in place |

## Slip Module

| Legacy Function | New Target | Status | Notes |
|---|---|---|---|
| View monthly slips | Read-only list with filter/search | DONE | Database source active (`source=database`) |
| Filter by person/month | Fast filter UI | DONE | Frontend filtering implemented |
| Employee name display | Full name from personal/member source | IN_PROGRESS | Enrichment pipeline active; override policy pending |
| Export/print | PDF/Excel export | TODO | To implement with standard templates |
| Detail view | Drill-down to line items | TODO | Pending schema mapping for detail table |

## Tax Module

| Legacy Function | New Target | Status | Notes |
|---|---|---|---|
| Search tax certificate | Unified search UI | TODO | Next implementation cycle |
| Generate/download certificates | API-driven download flow | TODO | Requires template and signature policy |
| Year filter | Quick year selector | TODO | Planned in parity phase |

## Money Module

| Legacy Function | New Target | Status | Notes |
|---|---|---|---|
| Financial records list | Unified list with status | IN_PROGRESS | UI ready, backend mapping pending |
| Approval/review workflow | Structured statuses and actions | TODO | Keep legacy conditions + add audit |
| Monthly summary/report | Dashboard + exports | TODO | Planned with executive dashboard |

## Cross-Cutting Improvements (Beyond Legacy)

| Improvement | Value | Status | Notes |
|---|---|---|---|
| Audit trail | Full traceability of reads/writes | TODO | Must before production cutover |
| Rate limit + abuse controls | Better resilience and security | TODO | API middleware phase |
| 2FA for admins | Stronger identity protection | TODO | Recommended for production |
| Monitoring and alerts | Faster incident response | TODO | Add uptime/log error alerts |
| Backup verification | Recovery confidence | TODO | Add scheduled restore test |

## Parity Gate (Must Pass Before Full Go-Live)

- Legacy critical workflows work end-to-end in new system.
- Role permissions match policy and cannot be bypassed.
- Monthly output matches legacy reports for at least 2 historical periods.
- UAT sign-off from finance/personnel/admin representatives.
- Rollback plan tested and documented.
