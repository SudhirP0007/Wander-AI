// FR-01: registration/login via Supabase Auth (email + password).
// Supabase handles password hashing/salting server-side — we never see
// or store plaintext passwords here; we just proxy the calls so the
// SUPABASE_ANON_KEY stays on the server if you don't want it in the
// frontend bundle. (The frontend may also call supabase-js directly with
// the anon key, which is safe to expose — see README.)

const express = require('express');
const { supabaseAdmin, supabaseForRequest } = require('../config/supabaseClient');
const { validate, isRequired, isEmail, minLength } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post(
  '/signup',
  validate({
    body: {
      email: [isRequired, isEmail],
      password: [isRequired, minLength(8)],
      fullName: [isRequired],
    },
  }),
  async (req, res, next) => {
    try {
      const { email, password, fullName } = req.body;
      const { data, error } = await supabaseAdmin.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) return res.status(400).json({ error: error.message });
      res.status(201).json({
        user: data.user,
        session: data.session, // null if email confirmation is required
        message: data.session
          ? 'Account created.'
          : 'Account created. Check your email to confirm your address before logging in.',
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/login',
  validate({ body: { email: [isRequired, isEmail], password: [isRequired] } }),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
      if (error) return res.status(401).json({ error: 'Invalid email or password.' });

      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profile && profile.is_active === false) {
        return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
      }

      res.json({ user: data.user, session: data.session, profile });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await req.supabase.auth.signOut();
    res.json({ message: 'Logged out.' });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user, profile: req.profile });
});

router.post(
  '/refresh',
  validate({ body: { refreshToken: [isRequired] } }),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;
      const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });
      if (error) return res.status(401).json({ error: 'Could not refresh session.' });
      res.json({ session: data.session, user: data.user });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
