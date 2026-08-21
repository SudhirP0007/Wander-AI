-- =====================================================================
-- WanderAI — Supabase / PostgreSQL schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) after
-- creating your project. Supabase Auth already provides `auth.users`;
-- we extend it with a `public.profiles` table that carries app-specific
-- fields (display name, role, currency, etc).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles  (extends auth.users — FR-01, FR-12)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  role text not null default 'traveller' check (role in ('traveller', 'admin')),
  default_currency text not null default 'AUD',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'App-level profile data for each auth.users row. role drives admin access (FR-12); is_active lets admins deactivate accounts.';

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. itineraries  (FR-02, FR-04, FR-09, FR-13, FR-14, FR-15)
-- ---------------------------------------------------------------------
create table if not exists public.itineraries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  destination text not null,
  start_date date not null,
  end_date date not null,
  travellers text, -- e.g. 'Solo', '2 travellers', 'Family (3-4)', 'Group (5+)'
  budget numeric(12,2) not null default 0,
  currency text not null default 'AUD',
  interests text[] not null default '{}',
  travel_mode text default 'flexible' check (travel_mode in ('flexible','flight','train','road_trip')),
  status text not null default 'draft' check (status in ('draft','active','completed','archived')),
  estimated_cost numeric(12,2) default 0,
  star_rating smallint check (star_rating between 1 and 5), -- FR-15 (Could Have)
  raw_ai_response jsonb, -- store the raw Gemini/mock response for traceability
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_itineraries_owner on public.itineraries(owner_id);

-- ---------------------------------------------------------------------
-- 3. itinerary_days  (FR-06, FR-07, FR-08, FR-11)
-- ---------------------------------------------------------------------
create table if not exists public.itinerary_days (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  day_number int not null,
  day_date date,
  title text,        -- e.g. 'Shinjuku & Shibuya'
  weather jsonb,      -- { summary, temp_c, icon } — FR-08 (OpenWeatherMap)
  activities jsonb not null default '[]', -- [{time, duration, name, description, cost, lat, lng}]
  notes text,
  estimated_cost numeric(12,2) default 0,
  regenerated_count int not null default 0, -- tracks FR-11 usage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (itinerary_id, day_number)
);

create index if not exists idx_days_itinerary on public.itinerary_days(itinerary_id);

-- ---------------------------------------------------------------------
-- 4. saved_preferences  (per-user defaults — Account > Saved Preferences)
-- ---------------------------------------------------------------------
create table if not exists public.saved_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_interests text[] not null default '{}',
  default_travel_mode text default 'flexible',
  default_budget numeric(12,2),
  preferred_currency text not null default 'AUD',
  dietary_notes text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. admin_logs  (FR-12 — audit trail)
-- ---------------------------------------------------------------------
create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null, -- admin who performed the action
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null, -- e.g. 'deactivate_account', 'reactivate_account', 'view_dashboard'
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_logs_target on public.admin_logs(target_user_id);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_days enable row level security;
alter table public.saved_preferences enable row level security;
alter table public.admin_logs enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles policies
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- itineraries policies
create policy "itineraries_select_own_or_admin" on public.itineraries
  for select using (owner_id = auth.uid() or public.is_admin());
create policy "itineraries_insert_own" on public.itineraries
  for insert with check (owner_id = auth.uid());
create policy "itineraries_update_own_or_admin" on public.itineraries
  for update using (owner_id = auth.uid() or public.is_admin());
create policy "itineraries_delete_own_or_admin" on public.itineraries
  for delete using (owner_id = auth.uid() or public.is_admin());

-- itinerary_days policies (via parent itinerary ownership)
create policy "days_select_own_or_admin" on public.itinerary_days
  for select using (
    exists (select 1 from public.itineraries i where i.id = itinerary_id and (i.owner_id = auth.uid() or public.is_admin()))
  );
create policy "days_write_own_or_admin" on public.itinerary_days
  for all using (
    exists (select 1 from public.itineraries i where i.id = itinerary_id and (i.owner_id = auth.uid() or public.is_admin()))
  ) with check (
    exists (select 1 from public.itineraries i where i.id = itinerary_id and (i.owner_id = auth.uid() or public.is_admin()))
  );

-- saved_preferences policies
create policy "prefs_select_own" on public.saved_preferences
  for select using (user_id = auth.uid() or public.is_admin());
create policy "prefs_upsert_own" on public.saved_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- admin_logs policies (admin only)
create policy "logs_select_admin" on public.admin_logs
  for select using (public.is_admin());
create policy "logs_insert_admin" on public.admin_logs
  for insert with check (public.is_admin());

-- =====================================================================
-- Notes
-- =====================================================================
-- * The backend uses the Supabase SERVICE ROLE key for privileged admin
--   operations (deactivating accounts, reading all logs) and the
--   per-request user JWT (via supabase-js with the caller's access
--   token) for everything else, so RLS above is enforced normally.
-- * To promote a user to admin: update public.profiles set role='admin'
--   where email = '...';
