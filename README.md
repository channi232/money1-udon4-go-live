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
