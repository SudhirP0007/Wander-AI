// FR-04: AI-generated day-by-day itinerary (Google Gemini).
//
// If GEMINI_API_KEY is configured, we call the real Gemini API. Otherwise
// we fall back to a realistic mock generator so the app runs end-to-end
// without credentials. The key is read from the environment only (see
// config/env.js / backend/.env) and is never sent to the frontend.

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

/** Build the prompt sent to Gemini, asking for strict JSON back. */
function buildPrompt({ destination, startDate, endDate, budget, interests, travelMode }) {
const start = new Date(startDate);
const end = new Date(endDate);
const dayCount = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
const interestList = (interests && interests.length ? interests : ['general sightseeing']).join(', ');

return `You are a travel-planning assistant. Create a ${dayCount}-day itinerary for a trip to ${destination}, from ${startDate} to ${endDate}.
Travellers' budget: ${budget ? `${budget} AUD total` : 'not specified'}.
Travel mode: ${travelMode || 'flexible'}.
Interests: ${interestList}.

For each day, suggest 4 activities spread across the day (morning, midday, afternoon, evening), each with a short name, a one-sentence description, and a realistic estimated cost in AUD (0 for free activities).

Respond with ONLY valid JSON, no markdown fences and no commentary, matching exactly this shape:
{
"destination": string,
"day_count": number,
"estimated_total_cost": number,
"within_budget": boolean,
"days": [
{
"day_number": number,
"day_date": "YYYY-MM-DD",
"title": string,
"activities": [
{ "time": "HH:MM", "duration_hours": number, "name": string, "description": string, "cost": number, "lat": null, "lng": null }
],
"notes": string,
"estimated_cost": number
}
]
}`;
}

/** Pull the model's JSON text out of a Gemini generateContent response. */
function parseGeminiJson(json, fallbackDestination) {
const text = json && json.candidates && json.candidates[0] &&
json.candidates[0].content && json.candidates[0].content.parts &&
json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
if (!text) throw new Error('Gemini response had no text content.');

const cleaned = text.trim()
.replace(/^```json\s*/i, '')
.replace(/^```\s*/i, '')
.replace(/```\s*$/i, '');

const parsed = JSON.parse(cleaned);
parsed.source = 'gemini';
parsed.destination = parsed.destination || fallbackDestination;
return parsed;
}

async function callGeminiReal({ destination, startDate, endDate, budget, interests, travelMode }) {
const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.gemini.model}:generateContent`;

const res = await fetch(url, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'x-goog-api-key': env.gemini.apiKey,
},
body: JSON.stringify({
contents: [{
parts: [{ text: buildPrompt({ destination, startDate, endDate, budget, interests, travelMode }) }],
}],
generationConfig: {
responseMimeType: 'application/json',
},
}),
});

if (!res.ok) {
const errText = await res.text().catch(() => '');
throw new Error(`Gemini API error ${res.status}: ${errText.slice(0, 300)}`);
}

const json = await res.json();
return parseGeminiJson(json, destination);
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
