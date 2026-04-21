# Target Architecture (Draft)

## Product Goal
Single portal for finance operations with modern UX:
- Payroll slip module
- Tax certificate module
- Finance operations module

## High-Level Design
- Frontend: one responsive web app (portal + module navigation)
- Backend API: modular services with shared auth, audit, and role checks
- Data layer: separate connectors for each existing database

## Data Sources
- `udon4_epay`
- `udon4_personal`
- `udon4_reserve`
- `udon4_slip`

## Integration Principle
- Read-first integration for reporting and dashboard.
- Write operations enabled per module only after validation.
- Every write must be auditable.

## Security Baseline
- Central authentication and role-based access control
- Input validation on all endpoints
- Database least-privilege accounts per module
- Audit trail for login, data reads, and writes

## Migration Strategy
1. Build new portal shell and auth.
2. Integrate slip features first.
3. Add tax workflows.
4. Add money workflows.
5. UAT and controlled cutover with rollback plan.
