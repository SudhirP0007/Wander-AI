const { createClient } = require('@supabase/supabase-js');
const env = require('./env');

let warned = false;
function warnIfMissing() {
  if (!env.supabase.url || !env.supabase.anonKey) {
    if (!warned) {
      // eslint-disable-next-line no-console
      console.warn(
        '[supabase] SUPABASE_URL / SUPABASE_ANON_KEY are not set. ' +
          'Auth and database routes will fail until backend/.env is configured. ' +
          'See .env.example.'
      );
      warned = true;
    }
  }
}
warnIfMissing();

// Admin client — uses the service role key, bypasses RLS. Server-side only.
// Used for admin routes (deactivate accounts, view all logs) and for the
// trigger-driven profile bootstrap. Never send this client's key to the browser.
const supabaseAdmin = createClient(
  env.supabase.url || 'https://placeholder.supabase.co',
  env.supabase.serviceRoleKey || env.supabase.anonKey || 'placeholder-key',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Per-request client — carries the caller's access token so Postgres RLS
// policies apply as that user (not as the service role).
function supabaseForRequest(accessToken) {
  return createClient(
    env.supabase.url || 'https://placeholder.supabase.co',
    env.supabase.anonKey || 'placeholder-key',
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
}

module.exports = { supabaseAdmin, supabaseForRequest };
