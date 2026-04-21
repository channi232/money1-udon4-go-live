# PHP Auth API (Preview Stage)

This API reads the authenticated user from Apache Basic Auth and exposes a session endpoint for the frontend.

## Upload target

Upload these files to:

`/domains/money.udon4.go.th/public_html/api/`

- `session.php`
- `slip-summary.php`
- `tax-summary.php`
- `money-summary.php`
- `money-summary-v3.php`
- `audit-log.php`
- `audit-view.php`
- `rate-limit.php`
- `security-events.php`
- `security-thresholds.php`
- `role-config-status.php`
- `schema-config-status.php`
- `daily-brief.php`
- `security-common.php`
- `role-map.php` (editable role mapping, protected by `.htaccess`)
- `schema-map.php` (editable deterministic schema mapping, protected by `.htaccess`)
- `.htaccess`
- `logs/.htaccess`
- `logs/ratelimit/.htaccess`
- `db-config.php` (create from sample, do not commit real password)
- `personal-db-config.php` (optional, for enriching slip names from personal DB)
- `epay-db-config.php` (for tax module)

## Role mapping

Edit `role-map.php`:

```php
return [
    'previewadmin' => 'admin',
    'finance01' => 'finance',
    'personnel01' => 'personnel',
];
```

Use the same usernames that exist in your Basic Auth password file (`.htpasswd`).
The mapping is case-insensitive (the API normalizes username to lowercase).
Admin check endpoint:
- `https://money.udon4.go.th/api/role-config-status.php`

## Deterministic schema mapping

Edit `schema-map.php` to lock target table/columns for each module (`money`, `slip`, `tax`).

- `strict=true` means API will not auto-detect other tables/columns when mapping fails.
- Recommended to use `table_candidates` (ordered list) instead of one fixed `table` for deterministic but resilient matching.
- Recommended in production to avoid accidental schema drift.
- Admin check endpoint:
  - `https://money.udon4.go.th/api/schema-config-status.php`

## Slip API Setup

1. Copy `db-config.sample.php` to `db-config.php`
2. Fill read-only database credentials for `udon4_slip`
3. Test endpoint:
   - `https://money.udon4.go.th/api/slip-summary.php`
4. If SQL schema is different, edit query in `slip-summary.php`

## Personal Name Enrichment (Optional)

To replace `fullName` from employee code with real names:
1. Upload `personal-db-config.php` to `/api/`
2. Ensure credentials can read table `member` in personal DB
3. API will enrich rows by matching `employeeId` with `member.ID_per`

## Tax API Setup

1. Upload `epay-db-config.php` to `/api/`
2. Confirm credentials can connect `udon4_epay`
3. Test endpoint:
   - `https://money.udon4.go.th/api/tax-summary.php?debug=1`

## Money API Setup

1. Uses existing `db-config.php` (currently `udon4_slip`)
2. Test endpoint:
   - `https://money.udon4.go.th/api/money-summary-v3.php?debug=1`

## Audit Log Setup

1. Upload `audit-log.php` and `logs/.htaccess`
2. The frontend auto-calls this endpoint when users click Export CSV or Print.
3. Log file path on server:
   - `/domains/money.udon4.go.th/public_html/api/logs/audit.log`
4. Admin audit viewer endpoint:

## Daily Ops Brief (Admin)

- Endpoint: `https://money.udon4.go.th/api/daily-brief.php`
- Optional query: `?date=YYYY-MM-DD`
- Purpose: สรุปรายวันอัตโนมัติจาก audit + security พร้อมระดับความเสี่ยงและข้อเสนอแนะ
   - `https://money.udon4.go.th/api/audit-view.php?limit=50`

## Rate Limit

- API has per-IP rate limiting (returns HTTP `429` when exceeded).
- Current defaults:
  - `session.php`: 180 requests / 60 sec
  - `money-summary-v3.php`, `slip-summary.php`, `tax-summary.php`: 120 requests / 60 sec
  - `audit-log.php`: 60 requests / 60 sec
  - `audit-view.php`: 30 requests / 60 sec
- Runtime counter files are stored under:
  - `/domains/money.udon4.go.th/public_html/api/logs/ratelimit/`
- Security events (429) are logged to:
  - `/domains/money.udon4.go.th/public_html/api/logs/security.log`
- Admin monitoring endpoint:
  - `https://money.udon4.go.th/api/security-events.php?limit=100`
- Admin threshold endpoint:
  - `https://money.udon4.go.th/api/security-thresholds.php`
  - `GET` returns current thresholds + change history (last 20)
  - `POST` updates thresholds
  - `POST {"reset_defaults": true}` resets to recommended defaults
- Automatic cleanup (background, probabilistic trigger via API requests):
  - `audit.log` / `security.log`: keep last 90 days
  - `logs/ratelimit/*`: remove files older than 2 days

## Request ID and Error Code (Ops)

All summary endpoints (`money-summary-v3.php`, `tax-summary.php`, `slip-summary.php`) now include:
- response header: `X-Request-Id`
- response field: `request_id`
- on debug mode (`?debug=1` for admin): `debug.trace` with `module`, `request_id`, `duration_ms`, `stage`

When API falls back due to backend issue, payload also includes `error_code`.
Use `request_id` + `error_code` together for triage.

### Money `error_code`
- `MONEY_DB_CONFIG_NOT_FOUND` - missing `db-config.php`
- `MONEY_DB_CONFIG_INVALID` - invalid config payload/keys
- `MONEY_DB_UNAVAILABLE` - cannot connect DB
- `MONEY_SCHEMA_TABLE_NOT_FOUND` - strict schema table not found
- `MONEY_NO_TABLE_FOUND` - no readable candidate table
- `MONEY_REQUIRED_COLUMNS_UNMAPPED` - required columns cannot be mapped
- `MONEY_QUERY_FAILED` - SQL execution failed

### Tax `error_code`
- `TAX_DB_CONFIG_NOT_FOUND` - missing `epay-db-config.php`
- `TAX_DB_CONFIG_INVALID` - invalid config payload/keys
- `TAX_DB_UNAVAILABLE` - cannot connect DB
- `TAX_SCHEMA_TABLE_NOT_FOUND` - strict schema table not found
- `TAX_NO_TABLE_FOUND` - no readable candidate table
- `TAX_REQUIRED_COLUMNS_UNMAPPED` - required columns cannot be mapped
- `TAX_QUERY_FAILED` - SQL execution failed

### Slip `error_code`
- `SLIP_DB_CONFIG_NOT_FOUND` - missing `db-config.php`
- `SLIP_DB_CONFIG_INVALID` - invalid config payload/keys
- `SLIP_DB_UNAVAILABLE` - cannot connect DB
- `SLIP_SCHEMA_CANDIDATE_TABLES_NOT_FOUND` - strict candidate tables not found
- `SLIP_SCHEMA_TABLE_NOT_FOUND` - strict schema table not found
- `SLIP_NO_READABLE_TABLE_FOUND` - cannot find readable table
- `SLIP_REQUIRED_COLUMNS_UNMAPPED` - required columns cannot be mapped
- `SLIP_QUERY_FAILED` - SQL execution failed
