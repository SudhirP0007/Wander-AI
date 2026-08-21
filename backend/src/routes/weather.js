const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getDailyWeather } = require('../services/weatherService');

const router = express.Router();

// GET /api/weather?destination=Tokyo&date=2026-06-12  (FR-08)
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { destination, date } = req.query;
    if (!destination || !date) {
      return res.status(400).json({ error: 'destination and date query params are required.' });
    }
    const weather = await getDailyWeather(destination, date);
    res.json({ weather });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
