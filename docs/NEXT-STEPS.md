# Immediate Next Steps

## 1) Prepare Runtime
- Install Node.js LTS (includes npm/npx).
- Optional: install PHP + MySQL client for legacy data checks.
- Run `powershell -ExecutionPolicy Bypass -File .\scripts\check-prerequisites.ps1`.

## 2) Scaffold Real App
After Node.js is ready, run inside `app/`:

```powershell
npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes
```

## 3) Build Unified Modules
- Create module routes: `/money`, `/slip`, `/tax`
- Add centralized login and role checks
- Build API connectors for: `udon4_epay`, `udon4_personal`, `udon4_reserve`, `udon4_slip`

## 4) Security Baseline
- Keep all secrets in `.env`
- Use read-only DB credentials in early integration
- Add audit logging for login/read/write events
