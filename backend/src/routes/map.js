const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { enrichActivitiesWithCoordinates, centerFor } = require('../services/mapsService');

const router = express.Router();

// GET /api/map/itineraries/:id/days/:dayNumber  (FR-07)
router.get('/itineraries/:id/days/:dayNumber', requireAuth, async (req, res, next) => {
  try {
    const { id, dayNumber } = req.params;
    const { data: itinerary, error: itErr } = await req.supabase
      .from('itineraries')
      .select('id, destination')
      .eq('id', id)
      .single();
    if (itErr || !itinerary) return res.status(404).json({ error: 'Itinerary not found.' });

    const { data: day, error: dayErr } = await req.supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .eq('day_number', Number(dayNumber))
      .single();
    if (dayErr || !day) return res.status(404).json({ error: 'Day not found.' });

    const activities = await enrichActivitiesWithCoordinates(itinerary.destination, day.activities || []);
    res.json({
      center: centerFor(itinerary.destination),
      destination: itinerary.destination,
      day_number: day.day_number,
      stops: activities,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
