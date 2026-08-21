// FR-02/03/04/06/09/11/13/14/15 — trip preferences, itinerary
// generation, persistence, retrieval, per-day regeneration, star rating.

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { validate, isRequired, isNumber, isPositive, isDate, isArray, oneOf } = require('../middleware/validate');
const { generateItinerary, regenerateDay } = require('../services/geminiService');
const { getDailyWeather } = require('../services/weatherService');

const router = express.Router();

const TRAVEL_MODES = ['flexible', 'flight', 'train', 'road_trip'];

// ---------------------------------------------------------------------
// POST /api/itineraries/generate  — FR-02, FR-03, FR-04
// Validates trip preferences, calls the AI (or mock) itinerary
// generator, enriches with weather, and persists the result.
// ---------------------------------------------------------------------
router.post(
  '/generate',
  requireAuth,
  validate({
    body: {
      destination: [isRequired],
      startDate: [isRequired, isDate],
      endDate: [isRequired, isDate],
      budget: [isRequired, isNumber, isPositive],
      interests: [isArray],
      travelMode: [oneOf(TRAVEL_MODES)],
    },
  }),
  async (req, res, next) => {
    try {
      const { destination, startDate, endDate, budget, interests = [], travellers, travelMode = 'flexible' } = req.body;

      if (new Date(endDate) < new Date(startDate)) {
        return res.status(400).json({ error: 'Validation failed.', fields: { endDate: 'End date must be on or after the start date.' } });
      }
      if (interests.length > 5) {
        return res.status(400).json({ error: 'Validation failed.', fields: { interests: 'Choose up to 5 interests.' } });
      }

      const ai = await generateItinerary({ destination, startDate, endDate, budget, interests, travelMode });

      // Enrich each day with weather (FR-08) before persisting.
      const daysWithWeather = await Promise.all(
        ai.days.map(async (day) => ({
          ...day,
          weather: await getDailyWeather(destination, day.day_date),
        }))
      );

      const { data: itinerary, error: itErr } = await req.supabase
        .from('itineraries')
        .insert({
          owner_id: req.user.id,
          title: `${destination} · ${ai.day_count}-day itinerary`,
          destination,
          start_date: startDate,
          end_date: endDate,
          travellers: travellers || 'Solo',
          budget,
          interests,
          travel_mode: travelMode,
          status: 'active',
          estimated_cost: ai.estimated_total_cost,
          raw_ai_response: ai,
        })
        .select()
        .single();
      if (itErr) throw itErr;

      const dayRows = daysWithWeather.map((d) => ({
        itinerary_id: itinerary.id,
        day_number: d.day_number,
        day_date: d.day_date,
        title: d.title,
        weather: d.weather,
        activities: d.activities,
        notes: d.notes || '',
        estimated_cost: d.estimated_cost,
      }));

      const { data: days, error: daysErr } = await req.supabase
        .from('itinerary_days')
        .insert(dayRows)
        .select();
      if (daysErr) throw daysErr;

      res.status(201).json({ itinerary, days });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/itineraries  — FR-09 (Account > Saved Trips)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('itineraries')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ itineraries: data });
  } catch (err) {
    next(err);
  }
});

// GET /api/itineraries/:id  — FR-06, FR-09
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { data: itinerary, error: itErr } = await req.supabase.from('itineraries').select('*').eq('id', id).single();
    if (itErr || !itinerary) return res.status(404).json({ error: 'Itinerary not found.' });

    const { data: days, error: daysErr } = await req.supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .order('day_number', { ascending: true });
    if (daysErr) throw daysErr;

    res.json({ itinerary, days });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/itineraries/:id  — rename, change status, star rating (FR-15)
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, status, star_rating } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (title !== undefined) patch.title = title;
    if (status !== undefined) patch.status = status;
    if (star_rating !== undefined) patch.star_rating = star_rating;

    const { data, error } = await req.supabase.from('itineraries').update(patch).eq('id', id).select().single();
    if (error) throw error;
    res.json({ itinerary: data });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await req.supabase.from('itineraries').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// PATCH /api/itineraries/:id/days/:dayNumber  — manual edit of a day (FR-11)
router.patch('/:id/days/:dayNumber', requireAuth, async (req, res, next) => {
  try {
    const { id, dayNumber } = req.params;
    const { activities, notes, title } = req.body;
    const patch = { updated_at: new Date().toISOString() };
    if (activities !== undefined) patch.activities = activities;
    if (notes !== undefined) patch.notes = notes;
    if (title !== undefined) patch.title = title;
    if (activities !== undefined) {
      patch.estimated_cost = activities.reduce((s, a) => s + (Number(a.cost) || 0), 0);
    }

    const { data, error } = await req.supabase
      .from('itinerary_days')
      .update(patch)
      .eq('itinerary_id', id)
      .eq('day_number', Number(dayNumber))
      .select()
      .single();
    if (error) throw error;
    res.json({ day: data });
  } catch (err) {
    next(err);
  }
});

// POST /api/itineraries/:id/days/:dayNumber/regenerate  — FR-11
router.post('/:id/days/:dayNumber/regenerate', requireAuth, async (req, res, next) => {
  try {
    const { id, dayNumber } = req.params;

    const { data: itinerary, error: itErr } = await req.supabase
      .from('itineraries')
      .select('destination, interests, travel_mode')
      .eq('id', id)
      .single();
    if (itErr || !itinerary) return res.status(404).json({ error: 'Itinerary not found.' });

    const { data: existingDay, error: dayErr } = await req.supabase
      .from('itinerary_days')
      .select('*')
      .eq('itinerary_id', id)
      .eq('day_number', Number(dayNumber))
      .single();
    if (dayErr || !existingDay) return res.status(404).json({ error: 'Day not found.' });

    const regenerated = await regenerateDay({
      destination: itinerary.destination,
      dayNumber: Number(dayNumber),
      date: existingDay.day_date,
      interests: itinerary.interests,
      travelMode: itinerary.travel_mode,
    });
    const weather = await getDailyWeather(itinerary.destination, existingDay.day_date);

    const { data: updated, error: updateErr } = await req.supabase
      .from('itinerary_days')
      .update({
        title: regenerated.title,
        activities: regenerated.activities,
        estimated_cost: regenerated.estimated_cost,
        weather,
        regenerated_count: (existingDay.regenerated_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingDay.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    res.json({ day: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
