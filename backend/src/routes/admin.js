// FR-12: Admin can view logs and deactivate accounts.

const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { supabaseAdmin } = require('../config/supabaseClient');

const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/users', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/deactivate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('profiles').update({ is_active: false }).eq('id', id);
    if (error) throw error;
    await supabaseAdmin.from('admin_logs').insert({
      actor_id: req.user.id,
      target_user_id: id,
      action: 'deactivate_account',
    });
    res.json({ message: 'Account deactivated.' });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/reactivate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('profiles').update({ is_active: true }).eq('id', id);
    if (error) throw error;
    await supabaseAdmin.from('admin_logs').insert({
      actor_id: req.user.id,
      target_user_id: id,
      action: 'reactivate_account',
    });
    res.json({ message: 'Account reactivated.' });
  } catch (err) {
    next(err);
  }
});

router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { data, error } = await supabaseAdmin
      .from('admin_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    res.json({ logs: data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
