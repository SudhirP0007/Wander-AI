// FR-04: AI-generated day-by-day itinerary (Google Gemini).
//
// If GEMINI_API_KEY is configured, we call the real Gemini API. Otherwise
// we fall back to a realistic mock generator so the app runs end-to-end
// without credentials. Swap `callGemini` for the real fetch() call when
// you have a key — the request/response shape below is what the rest of
// the app expects either way.

const env = require('../config/env');

const INTEREST_ACTIVITY_LIBRARY = {
  food: ['Local food market tour', 'Chef-led tasting menu', 'Street food crawl', 'Cooking class'],
  architecture: ['Old town walking tour', 'Landmark building visit', 'Rooftop viewpoint', 'Historic district stroll'],
  nature: ['Botanical gardens', 'Coastal or riverside walk', 'National park day trip', 'Sunrise lookout hike'],
  nightlife: ['Rooftop bar', 'Live music venue', 'Night market', 'Evening river cruise'],
  museums: ['Contemporary art museum', 'National history museum', 'Local gallery district', 'Science & technology museum'],
  shopping: ['Boutique shopping district', 'Central market', 'Design/craft stores', 'Flagship shopping street'],
  beaches: ['Beach relaxation morning', 'Snorkelling or swimming spot', 'Sunset beach walk', 'Waterfront cafe'],
  adventure: ['Guided hiking trail', 'Bike tour', 'Water sports session', 'Zipline or adventure park'],
  'family-friendly': ['Interactive kids museum', 'Amusement or theme park', 'Wildlife/aquarium visit', 'Park & playground time'],
};

function pick(arr, i) {
  return arr[i % arr.length];
}

function buildMockItinerary({ destination, startDate, endDate, budget, interests = [], travelMode }) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dayCount = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
  const usedInterests = interests.length ? interests : ['food', 'architecture'];

  const days = [];
  let runningCost = 0;

  for (let d = 0; d < dayCount; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);

    const activities = [3, 12, 15, 19].map((hour, idx) => {
      const interest = pick(usedInterests, d + idx);
      const options = INTEREST_ACTIVITY_LIBRARY[interest] || INTEREST_ACTIVITY_LIBRARY.food;
      const name = pick(options, d + idx);
      const cost = idx === 0 ? 0 : Math.round(15 + ((d * 7 + idx * 11) % 60));
      runningCost += cost;
      const startHour = [9, 12, 14, 19][idx];
      return {
        time: `${String(startHour).padStart(2, '0')}:00`,
        duration_hours: idx === 0 ? 2 : 1.5,
        name: `${name} — ${destination}`,
        description: `Suggested ${interest} activity for day ${d + 1}, tailored to a ${travelMode || 'flexible'} trip.`,
        cost,
        lat: null,
        lng: null,
      };
    });

    days.push({
      day_number: d + 1,
      day_date: date.toISOString().slice(0, 10),
      title: `${destination} · Day ${d + 1}`,
      activities,
      notes: '',
      estimated_cost: activities.reduce((s, a) => s + a.cost, 0),
    });
  }

  return {
    source: 'mock',
    destination,
    day_count: dayCount,
    estimated_total_cost: runningCost,
    within_budget: budget ? runningCost <= Number(budget) : null,
    days,
  };
}

async function callGeminiReal({ destination, startDate, endDate, budget, interests, travelMode }) {
  // Real integration point. Uncomment and adapt once GEMINI_API_KEY is set.
  //
  // const res = await fetch(
  //   `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent?key=${env.gemini.apiKey}`,
  //   {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       contents: [{
  //         parts: [{ text: buildPrompt({ destination, startDate, endDate, budget, interests, travelMode }) }],
  //       }],
  //     }),
  //   }
  // );
  // const json = await res.json();
  // return parseGeminiJson(json); // parse the model's JSON itinerary out of the response text
  throw new Error('Real Gemini integration not configured — set GEMINI_API_KEY and implement callGeminiReal().');
}

async function generateItinerary(params) {
  if (env.gemini.apiKey) {
    try {
      return await callGeminiReal(params);
    } catch (err) {
      console.warn('[geminiService] Falling back to mock itinerary:', err.message);
    }
  }
  return buildMockItinerary(params);
}

/** FR-11: regenerate/edit a single day without touching the others. */
async function regenerateDay({ destination, dayNumber, date, interests, travelMode }) {
  const mock = buildMockItinerary({
    destination,
    startDate: date,
    endDate: date,
    budget: null,
    interests,
    travelMode,
  });
  const day = mock.days[0];
  day.day_number = dayNumber;
  day.title = `${destination} · Day ${dayNumber} (regenerated)`;
  return day;
}

module.exports = { generateItinerary, regenerateDay };
