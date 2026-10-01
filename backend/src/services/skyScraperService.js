// FR-05 (flights): Sky-scrapper / "Air Scraper" (RapidAPI) — real flight
// search, used alongside amadeusService (which still covers hotels).
// Falls back to realistic mock data when RAPIDAPI_KEY is unset, or if the
// live lookup fails for any reason (e.g. an unrecognised city name).

const env = require('../config/env');

const RAPIDAPI_HOST = 'sky-scrapper.p.rapidapi.com';
const BASE_URL = `https://${RAPIDAPI_HOST}`;

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
source: 'mock',
}));
}

async function rapidGet(path, params) {
const url = new URL(`${BASE_URL}${path}`);
Object.entries(params).forEach(([k, v]) => {
if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
});
const res = await fetch(url, {
headers: {
'x-rapidapi-key': env.rapidApi.key,
'x-rapidapi-host': RAPIDAPI_HOST,
},
});
if (!res.ok) throw new Error(`Sky-scrapper API error ${res.status}`);
return res.json();
}

/** Resolve a free-text city/airport name to the skyId + entityId the search endpoint needs. */
async function resolveAirport(query) {
const json = await rapidGet('/api/v1/flights/searchAirport', { query, locale: 'en-US' });
const best = json && json.data && json.data[0];
if (!best) throw new Error(`No airport match for "${query}"`);
const nav = best.navigation && best.navigation.relevantFlightParams;
return {
skyId: best.skyId || (nav && nav.skyId),
entityId: best.entityId || (nav && nav.entityId),
};
}

function defaultDate() {
const d = new Date();
d.setDate(d.getDate() + 30);
return d.toISOString().slice(0, 10);
}

async function getFlightOffersReal(destination, originCity, date) {
const [origin, dest] = await Promise.all([
resolveAirport(originCity),
resolveAirport(destination),
]);
if (!origin.skyId || !dest.skyId) throw new Error('Could not resolve one or both airports.');

const json = await rapidGet('/api/v2/flights/searchFlights', {
originSkyId: origin.skyId,
destinationSkyId: dest.skyId,
originEntityId: origin.entityId,
destinationEntityId: dest.entityId,
date: date || defaultDate(),
cabinClass: 'economy',
adults: 1,
sortBy: 'best',
currency: 'AUD',
market: 'en-AU',
countryCode: 'AU',
});

const itineraries = (json && json.data && json.data.itineraries) || [];
return itineraries.slice(0, 5).map((it) => {
const leg = (it.legs && it.legs[0]) || {};
const carrier = leg.carriers && leg.carriers.marketing && leg.carriers.marketing[0];
const stopCount = leg.stopCount || 0;
return {
airline: (carrier && carrier.name) || 'Unknown airline',
route: `${originCity} → ${destination}`,
stops: stopCount === 0 ? 'Direct' : `${stopCount} stop${stopCount > 1 ? 's' : ''}`,
duration_hours: leg.durationInMinutes ? +(leg.durationInMinutes / 60).toFixed(1) : null,
price: (it.price && it.price.raw) != null ? it.price.raw : null,
currency: 'AUD',
source: 'sky-scrapper',
};
});
}

async function getFlightOffers(destination, originCity = 'Sydney', date) {
  let flights;
  if (env.rapidApi.key) {
    try {
      const real = await getFlightOffersReal(destination, originCity, date);
      flights = real.length ? real : null;
    } catch (err) {
      console.warn('[skyScraperService] Falling back to mock flights:', err.message);
    }
  }
  if (!flights) flights = mockFlights(destination, originCity);
  return flights.slice().sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

module.exports = { getFlightOffers };