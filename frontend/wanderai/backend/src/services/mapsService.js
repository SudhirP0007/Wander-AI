// FR-07: map view showing location/route for activities (Google Maps).
// Provides geocoding for activity names when GOOGLE_MAPS_API_KEY is set;
// otherwise returns deterministic mock coordinates near a destination's
// approximate centre so pins/routes still render on the Map screen.

const env = require('../config/env');

const DESTINATION_CENTERS = {
  tokyo: { lat: 35.6762, lng: 139.6503 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  paris: { lat: 48.8566, lng: 2.3522 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  bali: { lat: -8.3405, lng: 115.092 },
  'gold coast': { lat: -28.0167, lng: 153.4 },
};

function centerFor(destination) {
  const key = (destination || '').trim().toLowerCase();
  return DESTINATION_CENTERS[key] || { lat: 0, lng: 0 };
}

function mockGeocode(destination, label, index) {
  const center = centerFor(destination);
  let h = 0;
  const seed = destination + label + index;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  const jitter = () => ((h % 1000) / 1000 - 0.5) * 0.08;
  return { lat: center.lat + jitter(), lng: center.lng + jitter() };
}

async function geocodePlace(destination, placeName, index = 0) {
  if (env.googleMaps.apiKey) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          `${placeName}, ${destination}`
        )}&key=${env.googleMaps.apiKey}`
      );
      if (res.ok) {
        const json = await res.json();
        const loc = json.results?.[0]?.geometry?.location;
        if (loc) return { lat: loc.lat, lng: loc.lng, source: 'google_maps' };
      }
    } catch (err) {
      console.warn('[mapsService] Google Maps geocode failed, falling back to mock:', err.message);
    }
  }
  return { ...mockGeocode(destination, placeName, index), source: 'mock' };
}

/** Enrich a day's activities array with lat/lng for the Map screen. */
async function enrichActivitiesWithCoordinates(destination, activities) {
  return Promise.all(
    activities.map(async (a, i) => {
      const coords = await geocodePlace(destination, a.name, i);
      return { ...a, lat: coords.lat, lng: coords.lng };
    })
  );
}

module.exports = { geocodePlace, enrichActivitiesWithCoordinates, centerFor };
