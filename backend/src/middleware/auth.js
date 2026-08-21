const { supabaseAdmin, supabaseForRequest } = require('../config/supabaseClient');

/**
 * Verifies the bearer token issued by Supabase Auth on the frontend,
 * attaches `req.user` (Supabase auth user) and `req.supabase` (a client
 * scoped to that user's JWT, so RLS policies apply) and `req.profile`
 * (the row from public.profiles, including `role`).
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Missing Authorization bearer token.' });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    req.user = data.user;
    req.accessToken = token;
    req.supabase = supabaseForRequest(token);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile && profile.is_active === false) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
    }

    req.profile = profile || null;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (!req.profile || req.profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
