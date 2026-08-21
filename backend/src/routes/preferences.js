// Account > Saved Preferences (per-user defaults referenced from FR-14).

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, isArray } = require('../middleware/validate');

const router = express.Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('saved_preferences')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();
    if (error) throw error;
    res.json({ preferences: data || null });
  } catch (err) {
    next(err);
  }
});

router.put(
  '/',
  requireAuth,
  validate({ body: { default_interests: [isArray] } }),
  async (req, res, next) => {
    try {
      const { default_interests, default_travel_mode, default_budget, preferred_currency, dietary_notes } = req.body;
      const { data, error } = await req.supabase
        .from('saved_preferences')
        .upsert(
          {
            user_id: req.user.id,
            default_interests: default_interests || [],
            default_travel_mode: default_travel_mode || 'flexible',
            default_budget: default_budget ?? null,
            preferred_currency: preferred_currency || 'AUD',
            dietary_notes: dietary_notes || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();
      if (error) throw error;
      res.json({ preferences: data });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
