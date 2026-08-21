// FR-05: hotel/flight comparison + curated destination recommendations
// (Recommendations > Hotels/Restaurants, Attractions, Flights).

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getFlightOffers, getHotelOffers } = require('../services/amadeusService');

const router = express.Router();

const CURATED_DESTINATIONS = [
  { destination: 'Tokyo', country: 'Japan', tag: 'City break', days: '5–7 days', interests: ['Food', 'Architecture', 'Culture'], from_price: 2300 },
  { destination: 'Bangkok', country: 'Thailand', tag: 'Backpacking', days: '4–10 days', interests: ['Street food', 'Temples', 'Tropical'], from_price: 1200 },
  { destination: 'Paris', country: 'France', tag: 'Romantic', days: '3–5 days', interests: ['Museums', 'Walking', 'Dining'], from_price: 3400 },
  { destination: 'Gold Coast', country: 'Australia', tag: 'Family', days: '4–6 days', interests: ['Beaches', 'Theme parks'], from_price: 900 },
  { destination: 'Bali', country: 'Indonesia', tag: 'Solo', days: '7 days', interests: ['Yoga', 'Beaches', 'Culture'], from_price: 1500 },
];

router.get('/destinations', requireAuth, async (req, res) => {
  res.json({ recommendations: CURATED_DESTINATIONS });
});

// GET /api/recommendations/flights?destination=Tokyo&origin=Sydney
router.get('/flights', requireAuth, async (req, res, next) => {
  try {
    const { destination, origin } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination is required.' });
    const flights = await getFlightOffers(destination, origin || 'Sydney');
    res.json({ flights });
  } catch (err) {
    next(err);
  }
});

// GET /api/recommendations/hotels?destination=Tokyo
router.get('/hotels', requireAuth, async (req, res, next) => {
  try {
    const { destination } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination is required.' });
    const hotels = await getHotelOffers(destination);
    res.json({ hotels });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
