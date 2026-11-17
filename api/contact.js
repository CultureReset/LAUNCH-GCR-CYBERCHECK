// /api/contact — saves GCR sales lead to Supabase, then calls cybercheck-api to send SMS + email
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://mhafixflyffflwjhcgfn.supabase.co';
// Same profiles "websites" publishable key used in index.html. Publishable keys are meant for client use.
const SUPABASE_PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_8AGgfn1H4jieakGWIe2UcQ_JrAeaUKB';

const CYBERCHECK_API = process.env.CYBERCHECK_API_URL || 'https://cybercheck-api-database.vercel.app';

module.exports = async function handler(req, res) {
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

    // Insert only; Prefer: return=minimal. Do not request the row back.
    const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE);
    const { error } = await supabase
      .from('sales_leads')
      .insert(lead);

    if (error) console.error('Supabase insert error:', error);

    // Fire SMS + email via cybercheck-api (has Twilio + Brevo env vars)
    fetch(`${CYBERCHECK_API}/api/gcr/lead-notify`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        name:          resolvedName,
        business_name: resolvedBiz,
        phone:         lead.phone,
        email:         lead.email,
        business_type: lead.business_type,
        interests:     interests || [],
        source:        lead.source,
      }),
    }).catch(e => console.error('lead-notify call failed:', e.message));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(200).json({ ok: true });
  }
};
