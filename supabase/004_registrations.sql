-- FreezeLine: household sign-up + home survey (the /register page).
-- Paste into Supabase Dashboard -> SQL Editor -> Run (after 001-003). Safe to re-run.
-- Holds names, emails, phone numbers and addresses: RLS on, NO anon access. The /api/register
-- route and scripts write with the service role; nothing in the browser reads this table.

create table if not exists public.registrations (
  id                    uuid primary key default gen_random_uuid(),

  -- who
  full_name             text not null check (char_length(full_name) between 2 and 120),
  email                 text not null unique check (email = lower(email) and char_length(email) <= 254),
  phone                 text not null check (phone ~ '^\+1[2-9][0-9]{9}$'),           -- E.164, US only
  preferred_language    text not null default 'en' check (preferred_language in ('en', 'es')),

  -- where
  address_line1         text not null check (char_length(address_line1) between 3 and 160),
  address_line2         text check (char_length(address_line2) <= 80),                 -- apt / unit
  city                  text not null default 'Houston' check (char_length(city) between 2 and 80),
  state                 text not null default 'TX' check (state ~ '^[A-Z]{2}$'),
  zip                   text not null check (zip ~ '^[0-9]{5}$'),
  -- The home this sign-up matches on the map. Null until matched (address matching comes later;
  -- placeholder rows are linked to a real OSM home directly).
  home_id               text references public.homes(id) on delete set null,

  -- home survey (all optional; null = not answered)
  dwelling_type         text check (dwelling_type in ('house', 'apartment')),
  pipe_locations        text[] check (pipe_locations <@ array['basement', 'crawlspace', 'garage', 'none', 'not_sure']::text[]),
  knows_shutoff         boolean,
  has_generator         boolean,
  someone_home_3_days   text check (someone_home_3_days in ('yes', 'no', 'not_sure')),
  emergency_name        text check (char_length(emergency_name) <= 120),
  emergency_phone       text check (emergency_phone ~ '^\+1[2-9][0-9]{9}$'),

  -- consent to automated texts and calls (required before any outreach)
  consent_texts_calls   boolean not null check (consent_texts_calls),
  consent_at            timestamptz not null default now(),
  consent_version       text not null,

  source                text not null default 'signup' check (source in ('signup', 'placeholder')),
  simulated             boolean not null default false,  -- true for placeholder rows
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists registrations_home_idx on public.registrations (home_id);
create index if not exists registrations_zip_idx  on public.registrations (zip);

-- ---------- access: server only ----------
alter table public.registrations enable row level security;
revoke all on public.registrations from anon, authenticated;
grant usage on schema public to service_role;
grant all on public.registrations to service_role;
