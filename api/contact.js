// /api/contact — receives sales lead form submissions, saves to Supabase sales_leads table
// then sends SMS + email confirmation to the lead and notifies the owner
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = 'https://mhafixflyffflwjhcgfn.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oYWZpeGZseWZmZmx3amhjZ2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTA4MzUsImV4cCI6MjA4NzM4NjgzNX0.3KW-rGnLhJQ1u3IsSeoGFfgQpcoJNdBGFOGnhc88tHw';

const OWNER_PHONE = '+12058104950';
const OWNER_EMAIL = 'info@cybercheckinc.com';

/* ── SMS via Twilio ─────────────────────────────────────────────── */
async function sendSMS(to, body) {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return;

  // normalise phone to E.164
  const clean = to.replace(/\D/g, '');
  const e164  = clean.startsWith('1') ? '+' + clean : '+1' + clean;
  if (e164.length < 12) return; // invalid

  const params = new URLSearchParams({
    To:   e164,
    From: from,
    Body: body,
  });

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
    },
    body: params.toString(),
  });
}

/* ── Email via Brevo ────────────────────────────────────────────── */
async function sendEmail({ to, subject, html }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) return;

  await fetch('https://api.brevo.com/v3/smtp/email', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key':      key,
    },
    body: JSON.stringify({
      sender:   { name: 'CyberCheck LLC', email: OWNER_EMAIL },
      to:       [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
}

/* ── Main handler ───────────────────────────────────────────────── */
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      name, business, phone, email,
      business_type, source, sms_consent,
      contact_name, business_name, website_url,
      interests,
    } = req.body || {};

    const resolvedName = name || contact_name || null;
    const resolvedBiz  = business || business_name || null;

    const lead = {
      name:          resolvedName,
      business_name: resolvedBiz,
      phone:         phone || null,
      email:         email || null,
      business_type: business_type || null,
      source:        source || 'unknown',
      sms_consent:   sms_consent === true,
      website_url:   website_url || null,
      interests:     Array.isArray(interests) && interests.length ? interests.join(', ') : null,
      status:        'new',
    };

    if (!lead.phone && !lead.email) {
      return res.status(400).json({ error: 'phone or email required' });
    }

    // Save to Supabase
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE || SUPABASE_ANON);
    const { data, error } = await supabase
      .from('sales_leads')
      .insert(lead)
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
    }

    // Fire notifications in parallel — don't let failures block the 200 response
    const notifications = [];

    // SMS to lead
    if (lead.phone && lead.sms_consent) {
      const greeting = resolvedName ? `Hi ${resolvedName.split(' ')[0]}, ` : '';
      notifications.push(
        sendSMS(lead.phone,
          `${greeting}thanks for your interest in Gulf Coast Radar + CyberCheck! ` +
          `We'll be in touch shortly to get your page built. ` +
          `Reply STOP to opt out or HELP for support. Msg & data rates may apply.`
        ).catch(e => console.error('Lead SMS error:', e))
      );
    }

    // SMS to owner
    if (lead.phone || lead.email) {
      const interestStr = lead.interests ? ` | Interests: ${lead.interests}` : '';
      notifications.push(
        sendSMS(OWNER_PHONE,
          `New GCR lead! ${resolvedName || 'Unknown'} / ${resolvedBiz || 'Unknown'} / ${lead.phone || ''} / ${lead.email || ''} / ${lead.business_type || ''}${interestStr} | Source: ${lead.source}`
        ).catch(e => console.error('Owner SMS error:', e))
      );
    }

    // Email to lead
    if (lead.email) {
      notifications.push(
        sendEmail({
          to:      lead.email,
          subject: 'Welcome to Gulf Coast Radar — We\'ll Be in Touch!',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#050e1f;color:#fff;padding:32px;border-radius:12px;">
              <div style="text-align:center;margin-bottom:24px;">
                <strong style="font-size:22px;color:#00b4d8;">Gulf Coast Radar</strong>
                <span style="color:#94a3b8;"> + </span>
                <strong style="font-size:22px;color:#e76f51;">CyberCheck</strong>
              </div>
              <h2 style="color:#fff;margin:0 0 16px;">Hey ${resolvedName ? resolvedName.split(' ')[0] : 'there'}! 👋</h2>
              <p style="color:#94a3b8;line-height:1.6;">
                Thanks for your interest in <strong style="color:#fff;">Gulf Coast Radar powered by CyberCheck</strong>.
                We received your info and our team will be reaching out shortly to get your business live on the platform.
              </p>
              ${lead.interests ? `<p style="color:#94a3b8;line-height:1.6;">You indicated interest in: <strong style="color:#00b4d8;">${lead.interests}</strong></p>` : ''}
              <p style="color:#94a3b8;line-height:1.6;">
                In the meantime, if you have any questions feel free to reach out:
              </p>
              <div style="background:#0a1a35;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:0;color:#fff;"><strong>CyberCheck LLC</strong></p>
                <p style="margin:4px 0;color:#94a3b8;">(205) 810-4950</p>
                <p style="margin:4px 0;color:#94a3b8;">info@cybercheckinc.com</p>
              </div>
              <p style="color:#555;font-size:12px;margin-top:24px;">
                You received this because you submitted a form on our website.
                Reply STOP to any of our SMS messages to opt out of text communications.
              </p>
            </div>
          `,
        }).catch(e => console.error('Lead email error:', e))
      );
    }

    // Email to owner
    notifications.push(
      sendEmail({
        to:      OWNER_EMAIL,
        subject: `New GCR Lead: ${resolvedName || 'Unknown'} — ${resolvedBiz || 'Unknown Business'}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#0077b6;">New Lead — Gulf Coast Radar</h2>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;width:140px;">Name</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${resolvedName || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Business</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${resolvedBiz || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Phone</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${lead.phone || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Email</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${lead.email || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Type</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${lead.business_type || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Interests</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${lead.interests || '—'}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">Source</td><td style="padding:8px;border-bottom:1px solid #e2e8f0;">${lead.source}</td></tr>
              <tr><td style="padding:8px;background:#f1f5f9;font-weight:bold;">SMS Consent</td><td style="padding:8px;">${lead.sms_consent ? '✅ Yes' : '❌ No'}</td></tr>
            </table>
          </div>
        `,
      }).catch(e => console.error('Owner email error:', e))
    );

    await Promise.allSettled(notifications);

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(200).json({ ok: true });
  }
};
