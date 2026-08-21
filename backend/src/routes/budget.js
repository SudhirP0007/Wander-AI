// FR-13: budget summary — estimated cost vs. stated budget.

const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const CATEGORY_COLORS = {
  Accommodation: '#2E5E4E',
  Flights: '#4A8A73',
  Food: '#E07A3C',
  Activities: '#C4A57B',
  Transport: '#8E897F',
};

router.get('/itineraries/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: itinerary, error: itErr } = await req.supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .single();
    if (itErr || !itinerary) return res.status(404).json({ error: 'Itinerary not found.' });

    const { data: days, error: dayErr } = await req.supabase
      .from('itinerary_days')
      .select('activities, estimated_cost')
      .eq('itinerary_id', id);
    if (dayErr) throw dayErr;

    // Very simple category split, illustrative of a real cost-breakdown
    // engine: activities' costs count as "Food"/"Activities" by keyword,
    // plus fixed shares assumed for flights/accommodation.
    let foodCost = 0;
    let activityCost = 0;
    (days || []).forEach((d) => {
      (d.activities || []).forEach((a) => {
        const isFood = /lunch|dinner|breakfast|food|tasting|cafe|restaurant/i.test(a.name || '');
        if (isFood) foodCost += Number(a.cost) || 0;
        else activityCost += Number(a.cost) || 0;
      });
    });

    const flightsCost = Math.round((itinerary.budget || 0) * 0.24);
    const accomCost = Math.round((itinerary.budget || 0) * 0.38);
    const transportCost = Math.round((foodCost + activityCost) * 0.2);

    const breakdown = [
      { category: 'Accommodation', amount: accomCost, color: CATEGORY_COLORS.Accommodation },
      { category: 'Flights', amount: flightsCost, color: CATEGORY_COLORS.Flights },
      { category: 'Food', amount: Math.round(foodCost), color: CATEGORY_COLORS.Food },
      { category: 'Activities', amount: Math.round(activityCost), color: CATEGORY_COLORS.Activities },
      { category: 'Transport', amount: Math.round(transportCost), color: CATEGORY_COLORS.Transport },
    ];
    const total = breakdown.reduce((s, b) => s + b.amount, 0);
    const budget = Number(itinerary.budget) || 0;

    res.json({
      currency: itinerary.currency || 'AUD',
      budget,
      estimated_total: total,
      difference: budget - total,
      within_budget: total <= budget,
      breakdown: breakdown.map((b) => ({ ...b, percent: total ? Math.round((b.amount / total) * 100) : 0 })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/budget/seasonal?destination=Tokyo  (Budget Planner > Seasonal Comparison)
router.get('/seasonal', requireAuth, async (req, res) => {
  const { destination = 'your destination' } = req.query;
  const seasons = [
    { season: 'Low season', months: 'Jan–Mar', relative_cost: '−18%' },
    { season: 'Shoulder season', months: 'Apr–May, Sep–Oct', relative_cost: 'baseline' },
    { season: 'Peak season', months: 'Jun–Aug, Dec', relative_cost: '+22%' },
  ];
  res.json({ destination, seasons });
});

module.exports = router;
