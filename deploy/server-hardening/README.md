# Server Hardening Files

Copy `.htaccess` from this folder to:

`/domains/money.udon4.go.th/public_html/.htaccess`

This adds:
- HTTPS redirect
- Security headers
- Directory listing disabled
- Basic sensitive-file blocking

## Important
- Keep this site in preview mode until real backend auth is ready.
- For strong protection during development, enable one of:
  - Cloudflare Access (recommended)
  - Apache Basic Auth with password (template: `.htaccess.preview-lock`)
  - IP allowlist (office/VPN only)

## Enable Basic Auth Quickly
1. Create password file:
   - `htpasswd -c /domains/money.udon4.go.th/public_html/.htpasswd previewadmin`
2. Append the content of `.htaccess.preview-lock` to `/public_html/.htaccess`
3. Test in browser; it should ask for username/password before loading any page.
