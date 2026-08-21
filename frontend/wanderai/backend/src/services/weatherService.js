// FR-08: daily weather per itinerary day (OpenWeatherMap). Mocked when
// OPENWEATHERMAP_API_KEY is unset so the itinerary UI still shows weather.

const env = require('../config/env');

const CONDITIONS = [
  { summary: 'Clear', icon: 'sun', temp: [22, 30] },
  { summary: 'Cloudy', icon: 'cloud', temp: [16, 24] },
  { summary: 'Rain', icon: 'rain', temp: [12, 19] },
  { summary: 'Partly cloudy', icon: 'cloud-sun', temp: [18, 26] },
];

function mockWeatherForDate(destination, dateStr) {
  let h = 0;
  const seed = destination + dateStr;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  const cond = CONDITIONS[h % CONDITIONS.length];
  const [min, max] = cond.temp;
  const temp = min + (h % (max - min + 1));
  return { summary: cond.summary, icon: cond.icon, temp_c: temp, source: 'mock' };
}

async function getDailyWeather(destination, dateStr) {
  if (env.openWeatherMap.apiKey) {
    try {
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(destination)}&appid=${env.openWeatherMap.apiKey}&units=metric`
      );
      if (res.ok) {
        const json = await res.json();
        const match = (json.list || []).find((entry) => entry.dt_txt?.startsWith(dateStr));
        if (match) {
          return {
            summary: match.weather?.[0]?.main || 'Unknown',
            icon: match.weather?.[0]?.icon || '',
            temp_c: Math.round(match.main?.temp ?? 0),
            source: 'openweathermap',
          };
        }
      }
    } catch (err) {
      console.warn('[weatherService] OpenWeatherMap call failed, falling back to mock:', err.message);
    }
  }
  return mockWeatherForDate(destination, dateStr);
}

module.exports = { getDailyWeather };
