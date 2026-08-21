# WanderAI — AI Travel Planner

Full-stack build for ICT307 Project 1, Assessment 2 → implementation. A smart
trip-planning assistant: sign up, describe a trip (or fill in a form),
get an AI-generated day-by-day itinerary with weather, budget breakdown,
map view, and flight/hotel recommendations.

**Stack:** Node.js + Express (backend) · Supabase / PostgreSQL (auth + database)
· plain HTML/CSS/JS frontend (matches the original prototype's stack).

External APIs (Google Gemini, Amadeus, Google Maps, OpenWeatherMap) are
**optional**: every route falls back to realistic mock data when a key
isn't configured, so the full sign-up → plan → itinerary → budget → map
flow works end-to-end out of the box. Swap in real keys later without
changing any route contracts — see "Plugging in real APIs" below.

## Project structure

```
wanderai/
  backend/                 Express API
    src/
      config/               env + Supabase client setup
      middleware/            auth (Supabase JWT), validation, error handler
      routes/                 auth, itineraries, budget, recommendations,
                               weather, map, preferences, admin, export
      services/               Gemini / Amadeus / Maps / OpenWeatherMap
                               integrations (real call + mock fallback)
      db/schema.sql            Postgres schema + RLS policies for Supabase
    package.json
    .env.example
  frontend/                 Static HTML/CSS/JS (open directly or serve)
    index.html
    css/styles.css           unchanged design tokens from the prototype
    js/api.js                 fetch wrapper + session storage
    js/app.js                  screen navigation + API wiring
```

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. In **Project Settings → API**, copy the **Project URL**, **anon public
   key**, and **service_role key** (keep the service role key secret).
3. Open the **SQL Editor** in the Supabase dashboard, paste the contents
   of `backend/src/db/schema.sql`, and run it. This creates:
   - `profiles` (extends `auth.users` with `role`, `is_active`, etc. — a
     trigger auto-creates a row on signup)
   - `itineraries`, `itinerary_days`
   - `saved_preferences`
   - `admin_logs`
   - Row Level Security policies so users only see their own data
     (admins see everything).
4. By default every new user has `role = 'traveller'`. To make yourself
   an admin (for the FR-12 dashboard on the Account page), run:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@example.com';
   ```
5. (Optional) In **Authentication → Providers**, you can disable "Confirm
   email" while developing so signups get a session immediately instead
   of requiring an email confirmation click.

## 2. Configure and run the backend

```bash
cd backend
cp .env.example .env
# edit .env: paste your Supabase URL, anon key, and service role key
npm install
npm start        # or: npm run dev  (auto-restarts on changes)
```

The API listens on `http://localhost:4000` by default (`PORT` in `.env`).
`GET /health` should return `{"status":"ok"}` once it's running.

> **Note:** this sandbox couldn't reach the npm registry to pre-install
> dependencies, so `npm install` hasn't been run here — run it in your
> own environment. All backend source files have been syntax-checked
> (`node --check`) and are ready to install and run.

## 3. Run the frontend

The frontend is plain static files — no build step. Two options:

**Quickest:** open `frontend/index.html` directly in a browser.

**Recommended (avoids some browser CORS/file:// quirks):** serve it with
any static file server, e.g.:
```bash
cd frontend
npx serve .          # or: python3 -m http.server 5500
```

If your backend isn't on `http://localhost:4000`, set the frontend's API
base before `app.js` loads by adding this to `index.html`'s `<head>`:
```html
<script>window.WANDERAI_API_BASE = 'https://your-backend-host';</script>
```
Also add your frontend's origin to `CORS_ORIGIN` in `backend/.env`.

## 4. Try the end-to-end flow

1. **Account → Sign up** — creates a Supabase Auth user (password hashed
   by Supabase, never touches our DB in plaintext) and a `profiles` row.
2. **Plan Trip → Travel Details** (or the **Chatbot Assistant** sub-tab) —
   enter a destination, dates, budget, and interests.
3. **Generate itinerary** — calls Gemini (or the mock generator),
   enriches each day with weather, persists it to Supabase, and opens
   the **Itinerary** screen.
4. **Itinerary** — day-by-day activities & costs; **Regenerate** rebuilds
   a single day; **Export to PDF** downloads a generated PDF.
5. **Budget** — live cost-vs-budget breakdown, sample flight/hotel
   prices, seasonal comparison.
6. **Map** — Day 1 stops plotted with mock/real coordinates.
7. **Recommendations** — curated destinations; "Plan this" jumps back
   into Plan Trip with the destination pre-filled.
8. **Account** — saved trips list, saved preferences, and (if your user
   has `role = 'admin'`) a panel to deactivate/reactivate accounts and
   view the audit log (FR-12).

## Functional requirements coverage

| ID | Requirement | Where |
|----|-------------|-------|
| FR-01 | Register/login (email+password) | `routes/auth.js`, Supabase Auth |
| FR-02 | Enter destination/dates/budget/interests | Plan Trip form + chatbot |
| FR-03 | Client + server validation with errors | `middleware/validate.js`, `app.js` form checks |
| FR-04 | AI-generated day-by-day itinerary | `services/geminiService.js` (mock fallback) |
| FR-05 | Hotel/flight price comparison | `services/amadeusService.js`, Recommendations/Budget screens |
| FR-06 | Day-by-day itinerary view | Itinerary screen |
| FR-07 | Map view for activities | `services/mapsService.js`, Map screen |
| FR-08 | Daily weather per day | `services/weatherService.js` |
| FR-09 | Itineraries persisted/retrievable | Supabase `itineraries`/`itinerary_days` |
| FR-10 | Export itinerary as PDF | `routes/export.js` (pdfkit) |
| FR-11 | Regenerate/edit individual days | `POST /itineraries/:id/days/:n/regenerate`, PATCH for manual edits |
| FR-12 | Admin: view logs, deactivate accounts | `routes/admin.js`, Account → Admin panel |
| FR-13 | Budget summary vs. stated budget | `routes/budget.js`, Budget screen |
| FR-14 | Travel mode selector influencing recs | `travel_mode` on itinerary, used by mock generator |
| FR-15 | Star rating for itineraries (Could Have) | `star_rating` column + `PATCH /itineraries/:id` |
| FR-16 | Multi-language (Could Have) | Not implemented — out of scope for this pass |

## Non-functional notes

- **Security:** Supabase Auth handles password hashing/salting; the
  backend never stores plaintext passwords. All third-party API keys
  (Gemini, Amadeus, Maps, OpenWeatherMap, plus the Supabase service role
  key) live only in `backend/.env` and are never sent to the browser.
  `helmet`, CORS allow-listing, and rate limiting are enabled by default.
- **Accessibility:** form fields use `<label for>`, radio/checkbox tiles
  wrap native inputs (keyboard/focus-accessible), and the design tokens
  in `css/styles.css` preserve the prototype's contrast-checked palette.
- **Maintainability:** clear separation between `routes/` (HTTP layer),
  `services/` (external API + mock logic), and `middleware/` (auth,
  validation). Environment-based config in `config/env.js`.
- **Responsiveness:** itinerary generation happens in one request; the
  frontend disables the submit button and shows a status message while
  waiting so the UI never appears frozen.

## Plugging in real APIs

Every service file documents exactly where to add the real call:

- `services/geminiService.js` → `callGeminiReal()` — build a prompt from
  the trip inputs, call the Gemini API, parse its JSON itinerary.
- `services/amadeusService.js` → OAuth2 client-credentials flow, then
  `/v2/shopping/flight-offers` and hotel search.
- `services/mapsService.js` → already calls the real Google Geocoding
  API automatically once `GOOGLE_MAPS_API_KEY` is set.
- `services/weatherService.js` → already calls the real OpenWeatherMap
  forecast API automatically once `OPENWEATHERMAP_API_KEY` is set.

Just add the keys to `backend/.env` — no frontend changes needed, since
the browser never talks to these APIs directly.

## Known limitations / next steps

- Chat-based trip requests use a small regex-based parser to pull
  destination/days/budget out of free text before calling the same
  `/generate` endpoint as the form — good enough for a demo, but a real
  build would route free text through Gemini directly for extraction.
- The Map screen renders simple normalized pins/paths rather than an
  embedded Google Maps widget; swapping in the Maps JavaScript SDK on
  the frontend is a drop-in replacement once you have a browser-key
  restricted to your domain.
- `npm install` for the backend hasn't been run in this environment
  (no registry access) — run it locally before starting the server.
