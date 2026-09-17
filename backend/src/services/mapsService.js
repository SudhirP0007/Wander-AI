// FR-07: map view showing location/route for activities (Geoapify).
// Provides geocoding for activity names when GEOAPIFY_API_KEY is set;
// otherwise returns deterministic mock coordinates near a destination's
// approximate centre so pins/routes still render on the Map screen.

const env = require('../config/env');

// Small set of well-known centres kept as an instant lookup; any
// destination not listed here gets geocoded live instead of silently
// defaulting to an unrelated location.
const DESTINATION_CENTERS = {
  tokyo: { lat: 35.6762, lng: 139.6503 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  paris: { lat: 48.8566, lng: 2.3522 },
  sydney: { lat: -33.8688, lng: 151.2093 },
  bali: { lat: -8.3405, lng: 115.092 },
  'gold coast': { lat: -28.0167, lng: 153.4 },
  nepal: { lat: 27.7172, lng: 85.324 },
  kathmandu: { lat: 27.7172, lng: 85.324 },
  australia: { lat: -25.2744, lng: 133.7751 },
  pakistan: { lat: 30.3753, lng: 69.3451 },
};

const destinationCenterCache = new Map();

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Live-geocode a destination name to find its true centre point. */
async function geocodeDestinationCenter(destination) {
  if (!env.geoapify.apiKey) return null;
  try {
    const res = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(destination)}&apiKey=${env.geoapify.apiKey}`
    );
    if (!res.ok) {
      console.warn(`[mapsService] Destination centre geocode HTTP ${res.status} for "${destination}"`);
      return null;
    }
    const json = await res.json();
    const coords = json.features?.[0]?.geometry?.coordinates;
    if (!coords) {
      console.warn(`[mapsService] Destination centre geocode returned no results for "${destination}"`);
      return null;
    }
    console.log(`[mapsService] Destination centre for "${destination}": lat=${coords[1]}, lng=${coords[0]}`);
    return { lat: coords[1], lng: coords[0] };
  } catch (err) {
    console.warn('[mapsService] Destination centre geocode failed:', err.message);
    return null;
  }
}

async function centerFor(destination) {
  const key = (destination || '').trim().toLowerCase();
  if (DESTINATION_CENTERS[key]) return DESTINATION_CENTERS[key];
  if (destinationCenterCache.has(key)) return destinationCenterCache.get(key);

  const live = await geocodeDestinationCenter(destination);
  const center = live || { lat: 20, lng: 0 };
  destinationCenterCache.set(key, center);
  return center;
}

function mockGeocode(center, destination, label, index) {
  let h = 0;
  const seed = destination + label + index;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  const jitter = () => ((h % 1000) / 1000 - 0.5) * 0.08;
  return { lat: center.lat + jitter(), lng: center.lng + jitter() };
}

async function geocodePlace(destination, placeName, index = 0) {
  const center = await centerFor(destination);

  if (env.geoapify.apiKey) {
    try {
      const res = await fetch(
        `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(
          `${placeName}, ${destination}`
        )}&bias=proximity:${center.lng},${center.lat}&apiKey=${env.geoapify.apiKey}`
      );
      if (res.ok) {
        const json = await res.json();
        const coords = json.features?.[0]?.geometry?.coordinates;
        if (coords) {
          const candidate = { lat: coords[1], lng: coords[0] };
          if (distanceKm(candidate, center) <= 800) {
            return { ...candidate, source: 'geoapify' };
          }
          console.warn(
            `[mapsService] Rejected implausible geocode for "${placeName}, ${destination}" — ` +
            `${distanceKm(candidate, center).toFixed(0)}km from destination centre. Using mock instead.`
          );
        }
      }
    } catch (err) {
      console.warn('[mapsService] Geoapify geocode failed, falling back to mock:', err.message);
    }
  }
  return { ...mockGeocode(center, destination, placeName, index), source: 'mock' };
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