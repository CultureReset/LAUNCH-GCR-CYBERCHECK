// /api/contact — receives sales lead form submissions, saves to Supabase sales_leads table
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL     = 'https://mhafixflyffflwjhcgfn.supabase.co';
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_KEY; // set in Vercel env vars
const SUPABASE_ANON    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1oYWZpeGZseWZmZmx3amhjZ2ZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTA4MzUsImV4cCI6MjA4NzM4NjgzNX0.3KW-rGnLhJQ1u3IsSeoGFfgQpcoJNdBGFOGnhc88tHw';

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
      contact_name, business_name, website_url
    } = req.body || {};

    // normalise field names (different forms use slightly different keys)
    const lead = {
      name:          name || contact_name || null,
      business_name: business || business_name || null,
      phone:         phone || null,
      email:         email || null,
      business_type: business_type || null,
      source:        source || 'unknown',
      sms_consent:   sms_consent === true,
      website_url:   website_url || null,
      status:        'new',
    };

    if (!lead.phone && !lead.email) {
      return res.status(400).json({ error: 'phone or email required' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE || SUPABASE_ANON);
    const { data, error } = await supabase
      .from('sales_leads')
      .insert(lead)
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      // Don't expose DB errors to the client — still return 200 so the UX succeeds
      return res.status(200).json({ ok: true, warning: 'saved with error' });
    }

    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(200).json({ ok: true }); // always 200 to the user
  }
};
