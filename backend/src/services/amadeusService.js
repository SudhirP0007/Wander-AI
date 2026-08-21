// FR-05: hotel and flight price comparison (Amadeus).
// Falls back to realistic mock data when AMADEUS_CLIENT_ID/SECRET are unset.

const env = require('../config/env');

function seededPrice(seed, min, max) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return min + (h % (max - min));
}

function mockFlights(destination, originCity = 'Sydney') {
  const airlines = ['Qantas', 'Jetstar', 'Singapore Airlines', 'Emirates', 'Air New Zealand'];
  return airlines.slice(0, 3).map((airline, i) => ({
    airline,
    route: `${originCity} → ${destination}`,
    stops: i === 0 ? 'Direct' : `${i} stop`,
    duration_hours: 8 + i * 2,
    price: seededPrice(airline + destination, 380, 1450),
    currency: 'AUD',
  }));
}

function mockHotels(destination) {
  const names = [
    `${destination} Central Hotel`,
    `Grand ${destination} Suites`,
    `${destination} Boutique Stay`,
    `${destination} Budget Inn`,
  ];
  return names.map((name, i) => ({
    name,
    star_rating: 5 - i,
    guest_rating: (9.2 - i * 0.6).toFixed(1),
    price_per_night: seededPrice(name, 60, 420),
    currency: 'AUD',
    breakfast_included: i % 2 === 0,
  }));
}

async function getFlightOffers(destination, originCity) {
  if (env.amadeus.clientId && env.amadeus.clientSecret) {
    // Real integration point: OAuth2 client-credentials flow against
    // https://test.api.amadeus.com/v1/security/oauth2/token then call
    // /v2/shopping/flight-offers. Left as a stub until credentials exist.
    console.warn('[amadeusService] Real Amadeus integration not implemented yet — using mock flights.');
  }
  return mockFlights(destination, originCity);
}

async function getHotelOffers(destination) {
  if (env.amadeus.clientId && env.amadeus.clientSecret) {
    console.warn('[amadeusService] Real Amadeus integration not implemented yet — using mock hotels.');
  }
  return mockHotels(destination);
}

module.exports = { getFlightOffers, getHotelOffers };
