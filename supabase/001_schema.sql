-- FreezeLine schema (Phase 1A)
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
-- Freeze risk is computed in code (deterministic engine), so there is no per-hour risk table.
-- Every row carries `simulated` so sample data is always labeled.

-- ---------- zones: pressure zones with a base pressure ----------
create table if not exists public.zones (
  id                 text primary key,               -- e.g. 'heights'
  name               text not null,                  -- e.g. 'Heights Pressure Zone'
  neighborhood       text not null,
  base_pressure_psi  numeric(5,1) not null check (base_pressure_psi > 0),
  min_pressure_psi   numeric(5,1) not null default 20, -- TX boil-water threshold
  center_lat         double precision not null,
  center_lng         double precision not null,
  simulated          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- ---------- homes: one row per (simulated) house ----------
create table if not exists public.homes (
  id                        text primary key,        -- stable id, e.g. 'heights-0001' (makes seeding idempotent)
  zone_id                   text not null references public.zones(id) on delete cascade,
  neighborhood              text not null,
  label                     text not null,           -- display name, e.g. 'Simulated Home #0001'
  lat                       double precision not null,
  lng                       double precision not null,
  year_built                int  not null check (year_built between 1880 and 2030),
  foundation                text not null check (foundation in ('slab', 'pier_and_beam')),
  exterior_wall_pipes       boolean not null,
  outdoor_faucets           int  not null check (outdoor_faucets between 0 and 6),
  attic_or_crawlspace_pipes boolean not null,
  insulation                text not null check (insulation in ('poor', 'fair', 'good')),
  simulated                 boolean not null default true,
  created_at                timestamptz not null default now()
);
create index if not exists homes_zone_idx on public.homes (zone_id);

-- ---------- drip_plans: who drips, which faucet, who shouldn't ----------
create table if not exists public.drip_plans (
  id             uuid primary key default gen_random_uuid(),
  home_id        text not null references public.homes(id) on delete cascade,
  zone_id        text not null references public.zones(id) on delete cascade,
  plan_for       timestamptz not null,               -- storm hour the plan applies to
  action         text not null check (action in ('drip', 'do_not_drip', 'shut_off_outdoor')),
  faucet         text,                               -- e.g. 'kitchen (exterior wall)'
  drip_rate_gpm  numeric(5,3),
  reason         text,
  created_by     text not null default 'engine' check (created_by in ('engine', 'agent', 'operator')),
  simulated      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists drip_plans_home_idx on public.drip_plans (home_id);
create index if not exists drip_plans_zone_time_idx on public.drip_plans (zone_id, plan_for);

-- ---------- events: timeline of storm + agent activity ----------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  zone_id      text references public.zones(id) on delete cascade,
  home_id      text references public.homes(id) on delete cascade,
  type         text not null,                        -- e.g. 'pressure_reading', 'burst', 'plan_published', 'agent_action'
  occurred_at  timestamptz not null,
  payload      jsonb not null default '{}'::jsonb,
  simulated    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists events_time_idx on public.events (occurred_at);

-- ---------- outreach: SMS / voice messages to homeowners ----------
create table if not exists public.outreach (
  id            uuid primary key default gen_random_uuid(),
  home_id       text not null references public.homes(id) on delete cascade,
  drip_plan_id  uuid references public.drip_plans(id) on delete set null,
  channel       text not null check (channel in ('sms', 'voice')),
  to_number     text,                                -- contact info: NOT exposed to anon
  message       text not null,
  status        text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  provider_id   text,                                -- Twilio SID / ElevenLabs call id
  sent_at       timestamptz,
  simulated     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists outreach_home_idx on public.outreach (home_id);

-- ---------- Row Level Security: on for every table ----------
alter table public.zones      enable row level security;
alter table public.homes      enable row level security;
alter table public.drip_plans enable row level security;
alter table public.events     enable row level security;
alter table public.outreach   enable row level security;

-- Read-only SELECT policies for anon on the tables the frontend reads.
drop policy if exists "anon read zones"      on public.zones;
drop policy if exists "anon read homes"      on public.homes;
drop policy if exists "anon read drip_plans" on public.drip_plans;
drop policy if exists "anon read events"     on public.events;
create policy "anon read zones"      on public.zones      for select to anon using (true);
create policy "anon read homes"      on public.homes      for select to anon using (true);
create policy "anon read drip_plans" on public.drip_plans for select to anon using (true);
create policy "anon read events"     on public.events     for select to anon using (true);
-- outreach: RLS on, no anon policy -> anon sees nothing (it holds phone numbers).
-- Server code uses the service role key, which bypasses RLS.

-- Automatic table exposure is off, so grant explicitly.
grant usage on schema public to anon;
grant select on public.zones, public.homes, public.drip_plans, public.events to anon;
revoke all on public.outreach from anon;

-- Service role (scripts + server code) needs full access to every table.
grant usage on schema public to service_role;
grant all on public.zones, public.homes, public.drip_plans, public.events, public.outreach to service_role;
