# LAUNCH-GCR-CYBERCHECK

The April 2026 launch page for Gulf Coast Radar and CyberCheck: one landing page with a contact form, plus the privacy policy, terms of service and SMS terms.

Static HTML on Vercel with one serverless function. Nothing current depends on it.

## How it works

- `index.html` is the landing page.
- `api/contact.js` saves each sales lead to Supabase, then asks the CyberCheck API to send the lead notification by SMS and email. The service key comes from an environment variable.
- `privacy.html`, `terms.html` and `sms-terms.html` are the legal pages required for SMS messaging.
