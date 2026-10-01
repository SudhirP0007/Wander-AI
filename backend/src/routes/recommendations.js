const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { getHotelOffers } = require('../services/amadeusService');
const { getFlightOffers } = require('../services/skyScraperService');
const { searchPlaces } = require('../services/mapsService');

const router = express.Router();

const CURATED_DESTINATIONS = [
  { destination: 'Tokyo', country: 'Japan', tag: 'City break', days: '5-7 days', interests: ['Food', 'Architecture', 'Culture'], from_price: 2300 },
  { destination: 'Bangkok', country: 'Thailand', tag: 'Backpacking', days: '4-10 days', interests: ['Street food', 'Temples', 'Tropical'], from_price: 1200 },
  { destination: 'Paris', country: 'France', tag: 'Romantic', days: '3-5 days', interests: ['Museums', 'Walking', 'Dining'], from_price: 3400 },
  { destination: 'Gold Coast', country: 'Australia', tag: 'Family', days: '4-6 days', interests: ['Beaches', 'Theme parks'], from_price: 900 },
  { destination: 'Bali', country: 'Indonesia', tag: 'Solo', days: '7 days', interests: ['Yoga', 'Beaches', 'Culture'], from_price: 1500 },
];

function seededPrice(seed, min, max) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return min + (h % (max - min));
}

function mockRestaurants(destination) {
  const types = [
    { label: 'Local street food stalls', cuisine: 'Street food', priceRange: '$' },
    { label: destination + ' family-run bistro', cuisine: 'Local', priceRange: '$$' },
    { label: destination + ' rooftop dining', cuisine: 'Fusion', priceRange: '$$$' },
    { label: destination + ' fine dining', cuisine: 'Fine dining', priceRange: '$$$$' },
  ];
  const restaurants = types.map(function (t, i) {
    return {
      name: t.label,
      cuisine: t.cuisine,
      price_range: t.priceRange,
      avg_meal_cost: seededPrice(t.label + destination, 8, 90),
      currency: 'AUD',
      guest_rating: Math.max(6.5, 9.0 - i * 0.3).toFixed(1),
      search_url: 'https://www.google.com/search?q=' + encodeURIComponent(t.label + ' ' + destination + ' restaurant'),
    };
  });
  return restaurants.sort(function (a, b) { return a.avg_meal_cost - b.avg_meal_cost; });
}

router.get('/destinations', requireAuth, async (req, res) => {
  res.json({ recommendations: CURATED_DESTINATIONS });
});

router.get('/flights', requireAuth, async (req, res, next) => {
  try {
    const { destination, origin } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination is required.' });
    const flights = await getFlightOffers(destination, origin || 'Sydney');
    const withLinks = flights.map(function (f) {
      return Object.assign({}, f, {
        search_url: 'https://www.google.com/travel/flights?q=' + encodeURIComponent('flights from ' + (origin || 'Sydney') + ' to ' + destination),
      });
    });
    res.json({ flights: withLinks });
  } catch (err) {
    next(err);
  }
});

router.get('/hotels', requireAuth, async (req, res, next) => {
  try {
    const { destination } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination is required.' });

    const hotels = await getHotelOffers(destination);
    const places = await searchPlaces(destination, 'accommodation.hotel', hotels.length || 8);

    const withLinks = hotels.map(function (h, i) {
      const place = places[i];
      const name = place ? place.name : h.name;
      return Object.assign({}, h, {
        name,
        address: place ? place.address : h.address,
        search_url: 'https://www.google.com/search?q=' + encodeURIComponent(name + ' ' + destination),
      });
    });
    res.json({ hotels: withLinks });
  } catch (err) {
    next(err);
  }
});

router.get('/restaurants', requireAuth, async (req, res, next) => {
  try {
    const { destination } = req.query;
    if (!destination) return res.status(400).json({ error: 'destination is required.' });

    const places = await searchPlaces(destination, 'catering.restaurant', 8);
    if (places.length) {
      const priceRanges = ['$', '$$', '$$$', '$$$$'];
      const restaurants = places
        .map(function (place, i) {
          return {
            name: place.name,
            address: place.address,
            cuisine: 'Local',
            price_range: priceRanges[i % priceRanges.length],
            avg_meal_cost: seededPrice(place.name + destination, 8, 90),
            currency: 'AUD',
            guest_rating: Math.max(6.5, 9.0 - (i % 4) * 0.3).toFixed(1),
            search_url: 'https://www.google.com/search?q=' + encodeURIComponent(place.name + ' ' + destination + ' restaurant'),
          };
        })
        .sort(function (a, b) { return a.avg_meal_cost - b.avg_meal_cost; });
      return res.json({ restaurants });
    }

    res.json({ restaurants: mockRestaurants(destination) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;