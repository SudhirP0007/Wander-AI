// Thin fetch wrapper around the WanderAI Express API.
// Session tokens (Supabase access/refresh tokens, issued by our backend's
// /api/auth/* routes) are kept in localStorage so the user stays signed
// in across page reloads. No API keys ever live in the browser — every
// third-party call (Gemini, Amadeus, Maps, OpenWeatherMap) happens
// server-side per the NFR in the requirements doc.

const Api = (() => {
  // Change this if the backend runs on a different host/port.
  const BASE_URL = window.WANDERAI_API_BASE || 'http://localhost:4000';

  const SESSION_KEY = 'wanderai_session';

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function setSession(session) {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  }

  async function refreshSession() {
    const session = getSession();
    if (!session?.refresh_token) return null;
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refresh_token }),
    });
    if (!res.ok) {
      setSession(null);
      return null;
    }
    const json = await res.json();
    setSession(json.session);
    return json.session;
  }

  async function request(path, { method = 'GET', body, auth = true, isBlob = false } = {}) {
    const doFetch = async () => {
      const headers = { 'Content-Type': 'application/json' };
      const session = getSession();
      if (auth && session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }
      return fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    };

    let res = await doFetch();

    // Transparently retry once after a token refresh on 401.
    if (res.status === 401 && auth) {
      const refreshed = await refreshSession();
      if (refreshed) res = await doFetch();
    }

    if (isBlob) {
      if (!res.ok) throw await toError(res);
      return res.blob();
    }

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = new Error(json.error || 'Request failed.');
      err.fields = json.fields;
      err.status = res.status;
      throw err;
    }
    return json;
  }

  async function toError(res) {
    try {
      const json = await res.json();
      return new Error(json.error || 'Request failed.');
    } catch {
      return new Error('Request failed.');
    }
  }

  return {
    BASE_URL,
    getSession,
    setSession,
    isAuthenticated: () => !!getSession()?.access_token,

    // Auth
    signup: (fullName, email, password) => request('/api/auth/signup', { method: 'POST', body: { fullName, email, password }, auth: false }),
    login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
    logout: () => request('/api/auth/logout', { method: 'POST' }),
    me: () => request('/api/auth/me'),

    // Itineraries
    generateItinerary: (payload) => request('/api/itineraries/generate', { method: 'POST', body: payload }),
    listItineraries: () => request('/api/itineraries'),
    getItinerary: (id) => request(`/api/itineraries/${id}`),
    regenerateDay: (id, dayNumber) => request(`/api/itineraries/${id}/days/${dayNumber}/regenerate`, { method: 'POST' }),
    rateItinerary: (id, star_rating) => request(`/api/itineraries/${id}`, { method: 'PATCH', body: { star_rating } }),

    // Budget
    getBudget: (id) => request(`/api/budget/itineraries/${id}`),
    getSeasonal: (destination) => request(`/api/budget/seasonal?destination=${encodeURIComponent(destination)}`),

    // Recommendations
    getRecommendations: () => request('/api/recommendations/destinations'),
    getFlights: (destination) => request(`/api/recommendations/flights?destination=${encodeURIComponent(destination)}`),
    getHotels: (destination) => request(`/api/recommendations/hotels?destination=${encodeURIComponent(destination)}`),

    // Map
    getDayStops: (itineraryId, dayNumber) => request(`/api/map/itineraries/${itineraryId}/days/${dayNumber}`),

    // Preferences
    getPreferences: () => request('/api/preferences'),
    savePreferences: (payload) => request('/api/preferences', { method: 'PUT', body: payload }),

    // Export
    exportPdf: (id) => request(`/api/export/itineraries/${id}/pdf`, { isBlob: true }),

    // Admin
    adminListUsers: () => request('/api/admin/users'),
    adminDeactivate: (id) => request(`/api/admin/users/${id}/deactivate`, { method: 'POST' }),
    adminReactivate: (id) => request(`/api/admin/users/${id}/reactivate`, { method: 'POST' }),
  };
})();
