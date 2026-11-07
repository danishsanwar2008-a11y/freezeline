-- FreezeLine Phase 3.5: real OSM homes, household calls (sample), crews.
-- Paste into Supabase Dashboard -> SQL Editor -> Run (after 001 and 002). Safe to re-run.
-- Household and crew data is server-only: RLS on, no anon access.

-- ---------- homes: real footprint info + simulated household details ----------
alter table public.homes add column if not exists osm_id bigint;
alter table public.homes add column if not exists street text;
alter table public.homes add column if not exists area_m2 int;
alter table public.homes add column if not exists has_faucet_shutoff boolean not null default false;
alter table public.homes add column if not exists elderly boolean not null default false;
alter table public.homes add column if not exists mobility_limited boolean not null default false;
alter table public.homes add column if not exists lives_alone boolean not null default false;

-- ---------- outreach: allow calls and door checks ----------
alter table public.outreach drop constraint if exists outreach_channel_check;
alter table public.outreach add constraint outreach_channel_check check (channel in ('sms', 'voice', 'door'));
alter table public.outreach drop constraint if exists outreach_status_check;
alter table public.outreach add constraint outreach_status_check
  check (status in ('queued', 'sent', 'delivered', 'failed', 'replied', 'answered', 'no_answer', 'scheduled'));

-- ---------- household_calls: the agent's (sample) call answers + assessment per home per hour ----------
create table if not exists public.household_calls (
  id            uuid primary key default gen_random_uuid(),
  home_id       text not null references public.homes(id) on delete cascade,
  plan_for      timestamptz not null,
  contact       text not null check (contact in ('none', 'texted', 'called', 'door')),
  answers       jsonb not null default '{}'::jsonb,
  assessment    text not null check (assessment in ('ready', 'needs_reminder', 'needs_crew', 'waiting', 'no_answer', 'not_contacted')),
  reason_key    text not null,
  reason_params jsonb not null default '{}'::jsonb,
  confidence    text not null check (confidence in ('confirmed', 'estimated')),
  flagged_by    text references public.homes(id) on delete set null, -- a neighbor asked us to check on this home
  simulated     boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (home_id, plan_for)
);
create index if not exists household_calls_time_idx on public.household_calls (plan_for, assessment);

-- ---------- crews (sample) ----------
create table if not exists public.crews (
  id         int primary key,
  name       text not null,
  depot_lat  double precision not null,
  depot_lng  double precision not null,
  simulated  boolean not null default true
);
insert into public.crews (id, name, depot_lat, depot_lng) values
  (1, 'Crew 1', 29.7925, -95.4005),  -- near Houston Heights
  (2, 'Crew 2', 29.7380, -95.3790),  -- between Montrose and Third Ward
  (3, 'Crew 3', 29.7020, -95.4400)   -- near Meyerland
on conflict (id) do update set name = excluded.name, depot_lat = excluded.depot_lat, depot_lng = excluded.depot_lng;

-- ---------- crew_assignments: proposed by the agent, assigned by an official (or Auto) ----------
create table if not exists public.crew_assignments (
  id          uuid primary key default gen_random_uuid(),
  crew_id     int references public.crews(id) on delete cascade, -- null while only proposed for the queue
  home_id     text not null references public.homes(id) on delete cascade,
  plan_for    timestamptz not null,
  status      text not null check (status in ('proposed', 'assigned')),
  reason      text not null,
  simulated   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (home_id, plan_for)
);
-- A crew helps one home at a time per storm hour.
create unique index if not exists crew_one_home_uidx on public.crew_assignments (crew_id, plan_for) where status = 'assigned';

-- ---------- access: server only ----------
alter table public.household_calls  enable row level security;
alter table public.crews            enable row level security;
alter table public.crew_assignments enable row level security;
revoke all on public.household_calls, public.crews, public.crew_assignments from anon;
grant usage on schema public to service_role;
grant all on public.household_calls, public.crews, public.crew_assignments to service_role;

-- Homes now carry household details (sample): stop exposing the homes table to anon.
-- The console and homeowner pages read homes on the server with the service role.
drop policy if exists "anon read homes" on public.homes;
revoke select on public.homes from anon;
