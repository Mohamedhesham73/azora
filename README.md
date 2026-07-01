# AZORA — Cyber Wing

Product / instructions page for the **AZORA Cyber Wing** — a sound-reactive,
Wi-Fi controlled RGB LED wall art piece powered by WLED.

Single static page, no build step.

## Files
- `index.html` — the full page (CSS inline)
- `app.js` — scroll-reveal animation (kept external so the CSP can forbid inline scripts)
- `logo.jpeg` — AZORA wordmark
- `qr-code.jpeg` — QR to connect to the `WLED-AP` access point
- `vercel.json` — HTTP security headers (see below)

## Local preview
Just open `index.html` in a browser.

## Deploy
Static site — deploy the folder as-is to Vercel (no framework, no build command).

## Security
`vercel.json` applies hardened response headers to every route:
- **Content-Security-Policy** — locks scripts to `'self'`, images to self/`data:`,
  and fonts/styles to self + Google Fonts only. No inline scripts allowed.
- **HSTS** (2 yrs, preload), **X-Frame-Options: DENY** + `frame-ancestors 'none'`
  (clickjacking), **X-Content-Type-Options: nosniff**, strict **Referrer-Policy**,
  and a locked-down **Permissions-Policy** (camera/mic/geo/payment off).

Headers only take effect once deployed to Vercel — they are not applied when opening the file locally.
