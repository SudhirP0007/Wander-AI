// WanderAI frontend — screen navigation + wiring to the Express API.
// Kept as a single global `WanderAI` namespace (matches the prototype's
// plain HTML/CSS/JS stack — see project brief: only switch to a
// framework if clearly better, which a capstone-scope SPA doesn't need).

const WanderAI = (() => {
let state = {
currentItinerary: null, // { itinerary, days }
lastGeneratedDestination: null,
};

// ---------------------------------------------------------------
// Screen navigation
// ---------------------------------------------------------------
function show(screen, opts) {
document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
const el = document.getElementById('screen-' + screen);
if (el) el.classList.add('active');
document.querySelectorAll('nav.primary button').forEach((b) => b.classList.toggle('active', b.dataset.screen === screen));
window.scrollTo({ top: 0, behavior: 'smooth' });

if (screen === 'account' && typeof opts === 'string') switchAuth(opts);
if (screen === 'itinerary') renderItineraryScreen();
if (screen === 'budget') renderBudgetScreen();
if (screen === 'map') renderMapScreen();
if (screen === 'recommendations') renderRecommendations();
if (screen === 'account') renderAccountScreen();
}

document.addEventListener('DOMContentLoaded', () => {
document.querySelectorAll('nav.primary button').forEach((b) => {
b.addEventListener('click', () => show(b.dataset.screen));
});

wireRadioPills();
wireCheckTiles();
wirePlanForm();
wireAuthForms();
refreshAuthUi();
});

function wireRadioPills() {
document.querySelectorAll('.radio-pill').forEach((pill) => {
pill.addEventListener('click', () => {
const group = pill.closest('.radio-group');
group.querySelectorAll('.radio-pill').forEach((p) => p.classList.remove('selected'));
pill.classList.add('selected');
const input = pill.querySelector('input');
if (input) input.checked = true;
});
});
}

function wireCheckTiles() {
document.querySelectorAll('.check-tile').forEach((tile) => {
tile.addEventListener('click', (e) => {
if (e.target.tagName !== 'INPUT') {
const cb = tile.querySelector('input');
cb.checked = !cb.checked;
}
tile.classList.toggle('selected', tile.querySelector('input').checked);
});
});
}

// ---------------------------------------------------------------
// Plan Trip — sub-tabs (Travel Details / Chatbot Assistant)
// ---------------------------------------------------------------
function switchPlanTab(which) {
document.querySelectorAll('#screen-plan .auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.planTab === which));
document.getElementById('plan-details').classList.toggle('active', which === 'details');
document.getElementById('plan-chat').classList.toggle('active', which === 'chat');
}

function startPlanFor(destination) {
show('plan');
switchPlanTab('details');
const input = document.getElementById('dest');
if (input) input.value = destination;
}

function useSuggestion(text) {
document.getElementById('home-chat-input').value = text;
document.getElementById('home-chat-input').focus();
}

function goToChatFromHome() {
const v = document.getElementById('home-chat-input').value.trim();
show('plan');
switchPlanTab('chat');
if (v) {
document.getElementById('chat-input').value = v;
sendChatMsg();
}
}

// ---------------------------------------------------------------
// Chatbot Assistant — lightweight NLU: pulls destination/days/budget
// out of free text and calls the same /generate endpoint as the form,
// so both paths in the sitemap (Travel Details, Chatbot Assistant)
// produce a real, persisted itinerary via the AI generation route.
//
// Destination extraction looks for a locative preposition (in/to/
// around/near/through) followed by a place name — case-insensitively,
// so "plan to nepal" and "5 days in Tokyo" both work. If nothing
// matches, destination comes back null and the caller asks the user
// to clarify instead of silently assuming a default city.
// ---------------------------------------------------------------
function parseChatMessage(text) {
const destMatch = text.match(/\b(?:in|to|around|near|through)\s+([A-Za-z][A-Za-z\s]{1,25}?)(?:\s+on\b|\s+for\b|\s+with\b|\s+under\b|\s+starting\b|,|\.|$)/i);
const daysMatch = text.match(/(\d+)\s*-?\s*(day|days|week|weeks)/i);
const budgetMatch = text.match(/\$\s?(\d{2,6})/);
let days = 5;
if (daysMatch) {
const n = parseInt(daysMatch[1], 10);
days = /week/i.test(daysMatch[2]) ? n * 7 : n;
}
const interestKeywords = ['food', 'architecture', 'nature', 'nightlife', 'museums', 'shopping', 'beaches', 'adventure'];
const interests = interestKeywords.filter((k) => new RegExp(k, 'i').test(text));

const start = new Date();
start.setDate(start.getDate() + 14);
const end = new Date(start);
end.setDate(end.getDate() + Math.max(1, days) - 1);

const destination = destMatch
? destMatch[1].trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
: null;

return {
destination,
startDate: start.toISOString().slice(0, 10),
endDate: end.toISOString().slice(0, 10),
budget: budgetMatch ? Number(budgetMatch[1]) : 2000,
interests,
travelMode: 'flexible',
travellers: /family|kids/i.test(text) ? 'Family (3-4)' : /two of us|couple|2 /i.test(text) ? '2 travellers' : 'Solo',
};
}

async function sendChatMsg() {
const inp = document.getElementById('chat-input');
const v = inp.value.trim();
if (!v) return;
addUserMsg(v);
inp.value = '';

if (!Api.isAuthenticated()) {
addBotMsg("You'll need to sign in first so I can save your itinerary. Redirecting you to Account…");
setTimeout(() => show('account', 'login'), 1400);
return;
}

const payload = parseChatMessage(v);
if (!payload.destination) {
addBotMsg('I couldn\'t quite catch the destination — could you mention where you\'d like to go? e.g. "a trip to Nepal" or "5 days in Kathmandu".');
return;
}

addBotMsg('Got it — let me put together a day-by-day plan for that…');
try {
const result = await Api.generateItinerary(payload);
state.currentItinerary = result;
addBotMsg(`Done! I've created a ${result.days.length}-day plan for ${result.itinerary.destination}. Opening your itinerary now.`);
setTimeout(() => show('itinerary'), 900);
} catch (err) {
addBotMsg(`Sorry, I couldn't generate that itinerary: ${err.message}`);
}
}

function addUserMsg(text) {
const wrap = document.getElementById('chat-msgs');
wrap.insertAdjacentHTML('beforeend', `<div class="msg user"><div class="avatar">${initial()}</div><div class="bubble">${escapeHtml(text)}</div></div>`);
wrap.scrollTop = wrap.scrollHeight;
}
function addBotMsg(text) {
const wrap = document.getElementById('chat-msgs');
wrap.insertAdjacentHTML('beforeend', `<div class="msg"><div class="avatar">W</div><div class="bubble">${escapeHtml(text)}</div></div>`);
wrap.scrollTop = wrap.scrollHeight;
}
function escapeHtml(s) {
return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function initial() {
const session = Api.getSession();
return (session?.user?.email || 'U')[0].toUpperCase();
}

// ---------------------------------------------------------------
// Plan Trip — Travel Details form (FR-02, FR-03)
// ---------------------------------------------------------------
function wirePlanForm() {
const form = document.getElementById('plan-form');
form.addEventListener('submit', async (e) => {
e.preventDefault();
clearFieldErrors();

if (!Api.isAuthenticated()) {
show('account', 'login');
return;
}

const fd = new FormData(form);
const interests = fd.getAll('interests');
const payload = {
destination: fd.get('destination')?.trim(),
travellers: fd.get('travellers'),
startDate: fd.get('startDate'),
endDate: fd.get('endDate'),
budget: Number(fd.get('budget')),
travelMode: fd.get('travelMode') || 'flexible',
interests,
};

// Client-side validation mirrors the server-side rules (FR-03).
const errors = {};
if (!payload.destination) errors.destination = 'Destination is required.';
if (!payload.startDate) errors.startDate = 'Start date is required.';
if (!payload.endDate) errors.endDate = 'End date is required.';
if (payload.startDate && payload.endDate && new Date(payload.endDate) < new Date(payload.startDate)) {
errors.endDate = 'End date must be on or after the start date.';
}
if (!payload.budget || payload.budget <= 0) errors.budget = 'Enter a budget greater than 0.';
if (interests.length > 5) errors.interests = 'Choose up to 5 interests.';

if (Object.keys(errors).length) {
showFieldErrors(errors);
return;
}

const btn = document.getElementById('plan-submit-btn');
const meta = document.getElementById('plan-form-meta');
btn.disabled = true;
btn.textContent = 'Generating…';
meta.textContent = 'Calling the AI planner — this usually takes a few seconds.';

try {
const result = await Api.generateItinerary(payload);
state.currentItinerary = result;
show('itinerary');
} catch (err) {
if (err.fields) showFieldErrors(err.fields);
meta.textContent = err.message || 'Something went wrong generating your itinerary.';
meta.classList.add('error');
} finally {
btn.disabled = false;
btn.textContent = 'Generate itinerary →';
}
});
}

function showFieldErrors(errors) {
Object.entries(errors).forEach(([field, msg]) => {
const el = document.getElementById('err-' + field);
if (el) {
el.textContent = msg;
el.classList.add('error');
}
const input = document.querySelector(`#plan-form [name="${field}"]`);
if (input) input.classList.add('invalid');
});
}
function clearFieldErrors() {
document.querySelectorAll('#plan-form .hint.error').forEach((el) => {
el.classList.remove('error');
if (el.id === 'err-destination') el.textContent = 'Search city, country or region';
else if (el.id === 'err-budget') el.textContent = 'Total trip budget across all travellers';
else if (el.id === 'err-interests') el.textContent = 'Multi-select. Up to 5 interests.';
else el.textContent = '';
});
document.querySelectorAll('#plan-form .invalid').forEach((el) => el.classList.remove('invalid'));
}

// ---------------------------------------------------------------
// Itinerary screen (FR-06, FR-09, FR-11)
// ---------------------------------------------------------------
async function renderItineraryScreen() {
const titleEl = document.getElementById('itinerary-title');
const subEl = document.getElementById('itinerary-subtitle');
const daysEl = document.getElementById('itinerary-days');

if (!state.currentItinerary && Api.isAuthenticated()) {
try {
const { itineraries } = await Api.listItineraries();
if (itineraries?.length) {
state.currentItinerary = await Api.getItinerary(itineraries[0].id);
}
} catch {
/* ignore — show empty state below */
}
}

if (!state.currentItinerary) {
titleEl.textContent = 'No itinerary yet';
subEl.textContent = 'Head to Plan Trip to generate your first day-by-day plan.';
daysEl.innerHTML = '';
setSummary(null);
return;
}

const { itinerary, days } = state.currentItinerary;
titleEl.textContent = itinerary.title;
subEl.textContent = `${itinerary.start_date} – ${itinerary.end_date} · ${itinerary.travellers} · ${itinerary.currency}$${itinerary.budget} budget`;

daysEl.innerHTML = days
.map((day) => {
const weather = day.weather ? `${weatherEmoji(day.weather.icon)} ${day.weather.temp_c}°C · ${day.weather.summary}` : '';
const activities = (day.activities || [])
.map(
(a) => `
<div class="activity">
<div><div class="time">${a.time || ''}</div><div class="meta">${a.duration_hours ? a.duration_hours + 'h' : ''}</div></div>
<div class="body"><h4>${escapeHtml(a.name || '')}</h4><p>${escapeHtml(a.description || '')}</p></div>
<div class="cost">${a.cost === 0 ? 'Free' : `$${a.cost}`}</div>
</div>`
)
.join('');
return `
<div class="day-card">
<div class="day-card-head">
<div>
<h3>Day ${day.day_number} · ${escapeHtml(day.title || '')}</h3>
</div>
<div style="display:flex;gap:14px;align-items:center;">
<div class="weather">${weather}</div>
<button class="day-regen" onclick="WanderAI.regenerateDay(${day.day_number})">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
Regenerate
</button>
</div>
</div>
<div class="activities">${activities}</div>
</div>`;
})
.join('');

setSummary({
days: days.length,
travellers: itinerary.travellers,
activities: days.reduce((s, d) => s + (d.activities?.length || 0), 0),
cost: `${itinerary.currency}$${itinerary.estimated_cost ?? 0}`,
});
}

function weatherEmoji(icon) {
return { sun: '☀️', cloud: '⛅', rain: '🌧', 'cloud-sun': '🌤' }[icon] || '🌡️';
}

function setSummary(summary) {
document.getElementById('sum-days').textContent = summary?.days ?? '–';
document.getElementById('sum-travellers').textContent = summary?.travellers ?? '–';
document.getElementById('sum-activities').textContent = summary?.activities ?? '–';
document.getElementById('sum-cost').textContent = summary?.cost ?? '–';
}

async function regenerateDay(dayNumber) {
if (!state.currentItinerary) return;
try {
const { day } = await Api.regenerateDay(state.currentItinerary.itinerary.id, dayNumber);
const idx = state.currentItinerary.days.findIndex((d) => d.day_number === dayNumber);
if (idx >= 0) state.currentItinerary.days[idx] = day;
renderItineraryScreen();
} catch (err) {
alert('Could not regenerate that day: ' + err.message);
}
}

async function exportPdf() {
if (!state.currentItinerary) {
alert('Generate an itinerary first.');
return;
}
try {
const blob = await Api.exportPdf(state.currentItinerary.itinerary.id);
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `${state.currentItinerary.itinerary.destination}-itinerary.pdf`;
a.click();
URL.revokeObjectURL(url);
} catch (err) {
alert('Export failed: ' + err.message);
}
}

// ---------------------------------------------------------------
// Budget screen (FR-13)
// ---------------------------------------------------------------
async function renderBudgetScreen() {
const subtitle = document.getElementById('budget-subtitle');
const barCard = document.getElementById('budget-bar-card');
const bar = document.getElementById('budget-bar');
const legend = document.getElementById('budget-legend');
const status = document.getElementById('budget-status');
const pricesEl = document.getElementById('budget-prices');
const seasonalEl = document.getElementById('budget-seasonal');

if (!state.currentItinerary) {
subtitle.textContent = 'Generate an itinerary first to see a live budget breakdown.';
barCard.style.display = 'none';
return;
}

const { itinerary } = state.currentItinerary;
try {
const budget = await Api.getBudget(itinerary.id);
subtitle.textContent = `${budget.currency}$${budget.estimated_total} estimated · ${budget.currency}$${budget.budget} budget · ${budget.currency}$${Math.abs(budget.difference)} ${budget.within_budget ? 'to spare' : 'over budget'}`;
barCard.style.display = 'block';
bar.innerHTML = budget.breakdown.map((b) => `<div style="background:${b.color};width:${b.percent}%;">${b.percent ? b.category + ' ' + b.percent + '%' : ''}</div>`).join('');
legend.innerHTML = budget.breakdown.map((b) => `<div class="legend-item"><span class="legend-swatch" style="background:${b.color}"></span> ${b.category} · ${budget.currency}$${b.amount}</div>`).join('');
status.classList.toggle('over', !budget.within_budget);
status.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> ${budget.within_budget ? `Under budget — you have ${budget.currency}$${budget.difference} to spare.` : `Over budget by ${budget.currency}$${Math.abs(budget.difference)}.`}`;
} catch (err) {
subtitle.textContent = 'Could not load budget: ' + err.message;
}

try {
const [{ flights }, { hotels }] = await Promise.all([Api.getFlights(itinerary.destination), Api.getHotels(itinerary.destination)]);
pricesEl.innerHTML =
flights
.slice(0, 2)
.map((f) => `<div class="activity" style="grid-template-columns:1fr auto;"><div class="body"><h4>${f.route}</h4><p>${f.airline} · ${f.duration_hours}h · ${f.stops}</p></div><div class="cost">$${f.price}</div></div>`)
.join('') +
hotels
.slice(0, 2)
.map((h) => `<div class="activity" style="grid-template-columns:1fr auto;"><div class="body"><h4>${h.name}</h4><p>${h.star_rating}-star · ${h.guest_rating} guest rating${h.breakfast_included ? ' · breakfast included' : ''}</p></div><div class="cost">$${h.price_per_night}/night</div></div>`)
.join('');
} catch (err) {
pricesEl.innerHTML = `<p style="color:var(--warn);">Could not load prices: ${err.message}</p>`;
}

try {
const seasonal = await Api.getSeasonal(itinerary.destination);
seasonalEl.innerHTML = seasonal.seasons.map((s) => `<div class="seasonal-row"><span>${s.season} (${s.months})</span><strong>${s.relative_cost}</strong></div>`).join('');
} catch {
seasonalEl.innerHTML = '';
}
}

// ---------------------------------------------------------------
// Map screen (FR-07)
// ---------------------------------------------------------------
async function renderMapScreen() {
const listEl = document.getElementById('map-list');
const subtitle = document.getElementById('map-subtitle');
const canvas = document.getElementById('map-canvas');
const route = document.getElementById('map-route');

if (!state.currentItinerary) {
subtitle.textContent = 'Generate an itinerary to see stops here.';
return;
}

const { itinerary } = state.currentItinerary;
try {
const data = await Api.getDayStops(itinerary.id, 1);
subtitle.textContent = `Day ${data.day_number} · ${data.destination}`;
listEl.innerHTML =
`<div style="padding: 20px;"><h3 style="margin:0;font-size:18px;">Day ${data.day_number} stops</h3><p style="margin:4px 0 0;font-size:13px;color:var(--ink-muted);">${escapeHtml(data.destination)}</p></div>` +
data.stops
.map((s, i) => `<div class="map-stop"><div class="num">${i + 1}</div><div><h5>${escapeHtml(s.name)}</h5><p>${s.time || ''} · ${s.cost === 0 ? 'Free' : '$' + s.cost}</p></div></div>`)
.join('');

// Normalize stop coordinates into a 0-100 canvas box for simple pins
// (a production build would swap this for the real Google Maps
// JS SDK using GOOGLE_MAPS_API_KEY on the frontend's map screen).
const lats = data.stops.map((s) => s.lat).filter((v) => v != null);
const lngs = data.stops.map((s) => s.lng).filter((v) => v != null);
const minLat = Math.min(...lats), maxLat = Math.max(...lats);
const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
const norm = (v, min, max, pad = 15) => (max === min ? 50 : pad + ((v - min) / (max - min)) * (100 - pad * 2));

canvas.querySelectorAll('.map-pin').forEach((p) => p.remove());
const points = data.stops.map((s, i) => {
const left = norm(s.lat, minLat, maxLat);
const top = norm(s.lng, minLng, maxLng);
const pin = document.createElement('div');
pin.className = 'map-pin';
pin.style.left = left + '%';
pin.style.top = top + '%';
pin.textContent = i + 1;
canvas.appendChild(pin);
return [left, top];
});
route.innerHTML = points.length > 1 ? `<path d="M ${points.map((p) => p.join(' ')).join(' L ')}" fill="none" stroke="#E07A3C" stroke-width=".7" stroke-dasharray="1 1.5"/>` : '';
} catch (err) {
subtitle.textContent = 'Could not load map data: ' + err.message;
}
}

// ---------------------------------------------------------------
// Recommendations screen (FR-05)
// ---------------------------------------------------------------
async function renderRecommendations() {
const grid = document.getElementById('rec-grid');
if (!Api.isAuthenticated()) {
grid.innerHTML = '<p style="color:var(--ink-muted);">Sign in to see personalised recommendations.</p>';
return;
}
try {
const { recommendations } = await Api.getRecommendations();
grid.innerHTML = recommendations
.map(
(r) => `
<div class="rec-card">
<div class="rec-thumb" style="background-image:url('https://source.unsplash.com/600x400/?${encodeURIComponent(r.destination)}');"><span class="tag">${r.tag}</span></div>
<div class="rec-body">
<h3>${escapeHtml(r.destination)}</h3>
<p class="place">${escapeHtml(r.country)} · ${r.days} · ${r.interests.join(', ')}</p>
<div class="meta">
<div class="price">From A$${r.from_price} <span>per person</span></div>
<a class="btn-mini" onclick="WanderAI.startPlanFor('${escapeHtml(r.destination)}')">Plan this →</a>
</div>
</div>
</div>`
)
.join('');
} catch (err) {
grid.innerHTML = `<p style="color:var(--warn);">Could not load recommendations: ${err.message}</p>`;
}
}

// ---------------------------------------------------------------
// Account screen — auth forms + signed-in profile (FR-01)
// ---------------------------------------------------------------
function switchAuth(which) {
document.querySelectorAll('#account-guest .auth-tab').forEach((t) => t.classList.toggle('active', t.dataset.auth === which));
document.querySelectorAll('#account-guest .auth-pane').forEach((p) => p.classList.toggle('active', p.id === which + '-form'));
}

function wireAuthForms() {
document.getElementById('login-form').addEventListener('submit', async (e) => {
e.preventDefault();
const errEl = document.getElementById('login-error');
errEl.textContent = '';
const fd = new FormData(e.target);
try {
const { session, profile, user } = await Api.login(fd.get('email'), fd.get('password'));
Api.setSession({ ...session, user, profile });
refreshAuthUi();
show('home');
} catch (err) {
errEl.textContent = err.message;
}
});

document.getElementById('signup-form').addEventListener('submit', async (e) => {
e.preventDefault();
const errEl = document.getElementById('signup-error');
errEl.textContent = '';
const fd = new FormData(e.target);
try {
const { session, user, message } = await Api.signup(fd.get('fullName'), fd.get('email'), fd.get('password'));
if (session) {
Api.setSession({ ...session, user });
refreshAuthUi();
show('plan');
} else {
errEl.style.color = 'var(--ok)';
errEl.textContent = message;
}
} catch (err) {
errEl.style.color = 'var(--warn)';
errEl.textContent = err.message;
}
});
}

async function logout() {
try {
await Api.logout();
} catch {
/* ignore network errors on logout */
}
Api.setSession(null);
state.currentItinerary = null;
refreshAuthUi();
show('home');
}

function refreshAuthUi() {
const session = Api.getSession();
const guestEl = document.getElementById('topbar-auth-guest');
const userEl = document.getElementById('topbar-auth-user');
if (session?.access_token) {
guestEl.style.display = 'none';
userEl.style.display = 'flex';
document.getElementById('topbar-user-name').textContent = session.user?.user_metadata?.full_name || session.user?.email || 'Account';
} else {
guestEl.style.display = 'flex';
userEl.style.display = 'none';
}
}

async function renderAccountScreen() {
const session = Api.getSession();
const guestPane = document.getElementById('account-guest');
const userPane = document.getElementById('account-user');

if (!session?.access_token) {
guestPane.style.display = 'block';
userPane.style.display = 'none';
return;
}
guestPane.style.display = 'none';
userPane.style.display = 'block';

let me;
try {
me = await Api.me();
} catch {
logout();
return;
}

const name = me.user.user_metadata?.full_name || me.user.email;
document.getElementById('account-welcome').textContent = `Welcome back, ${name.split(' ')[0]}.`;
document.getElementById('account-avatar').textContent = name[0].toUpperCase();
document.getElementById('account-name').textContent = name;
document.getElementById('account-email').textContent = me.user.email;

try {
const { preferences } = await Api.getPreferences();
if (preferences?.preferred_currency) {
const sel = document.getElementById('account-currency');
[...sel.options].forEach((o) => (o.selected = o.value.startsWith(preferences.preferred_currency)));
}
if (preferences?.default_travel_mode) {
document.getElementById('account-default-mode').value = preferences.default_travel_mode;
}
} catch {
/* no saved preferences yet */
}

try {
const { itineraries } = await Api.listItineraries();
const listEl = document.getElementById('saved-trips-list');
if (!itineraries?.length) {
listEl.innerHTML = '<p style="color:var(--ink-muted);font-size:14px;">No saved trips yet — plan your first trip!</p>';
} else {
listEl.innerHTML = itineraries
.map(
(t) => `
<div class="saved-trip">
<div><h4>${escapeHtml(t.title)}</h4><p>${t.start_date} – ${t.end_date} · ${escapeHtml(t.travellers || '')} · ${t.currency}$${t.estimated_cost ?? 0}</p></div>
<div style="display:flex;gap:10px;align-items:center;">
<span class="status-pill ${t.status === 'active' ? 'status-active' : 'status-done'}">${t.status}</span>
<button class="btn btn-ghost" style="font-size:13px;padding:6px 12px;" onclick="WanderAI.openSavedTrip('${t.id}')">Open</button>
</div>
</div>`
)
.join('');
}
} catch (err) {
document.getElementById('saved-trips-list').innerHTML = `<p style="color:var(--warn);">Could not load saved trips: ${err.message}</p>`;
}

const adminPanel = document.getElementById('admin-panel');
if (me.profile?.role === 'admin') {
adminPanel.style.display = 'block';
renderAdminPanel();
} else {
adminPanel.style.display = 'none';
}
}

async function openSavedTrip(id) {
try {
state.currentItinerary = await Api.getItinerary(id);
show('itinerary');
} catch (err) {
alert('Could not open trip: ' + err.message);
}
}

async function savePreferences() {
const currency = document.getElementById('account-currency').value.split(' ')[0];
const mode = document.getElementById('account-default-mode').value;
try {
await Api.savePreferences({ preferred_currency: currency, default_travel_mode: mode, default_interests: [] });
alert('Preferences saved.');
} catch (err) {
alert('Could not save preferences: ' + err.message);
}
}

// ---------------------------------------------------------------
// Admin panel (FR-12)
// ---------------------------------------------------------------
async function renderAdminPanel() {
const el = document.getElementById('admin-users');
try {
const { users } = await Api.adminListUsers();
el.innerHTML = users
.map(
(u) => `
<div class="admin-user-row">
<span>${escapeHtml(u.full_name || u.email)} ${u.is_active ? '' : '<em style="color:var(--warn)">(deactivated)</em>'}</span>
<button class="btn btn-ghost" style="padding:4px 10px;font-size:12px;" onclick="WanderAI.toggleUser('${u.id}', ${u.is_active})">${u.is_active ? 'Deactivate' : 'Reactivate'}</button>
</div>`
)
.join('');
} catch (err) {
el.innerHTML = `<p style="color:var(--warn);font-size:13px;">${err.message}</p>`;
}
}

async function toggleUser(id, isActive) {
try {
if (isActive) await Api.adminDeactivate(id);
else await Api.adminReactivate(id);
renderAdminPanel();
} catch (err) {
alert('Action failed: ' + err.message);
}
}

return {
show,
switchPlanTab,
startPlanFor,
useSuggestion,
goToChatFromHome,
sendChatMsg,
regenerateDay,
exportPdf,
switchAuth,
logout,
savePreferences,
openSavedTrip,
toggleUser,
};
})();
