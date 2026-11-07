-- FreezeLine Phase 3: Claude result cache + photo-check results.
-- Paste into Supabase Dashboard -> SQL Editor -> Run (after 001_schema.sql). Safe to re-run.
-- Both tables are server-only: RLS on, no anon policies, service role has full access.

-- Cached Claude outputs (friendly plan text, translations, SMS drafts), keyed by a hash of the input.
create table if not exists public.ai_cache (
  key         text primary key,
  value       jsonb not null,
  model       text not null,
  created_at  timestamptz not null default now()
);

-- Photo check results only (the photo itself is never stored).
create table if not exists public.photo_checks (
  home_id         text primary key references public.homes(id) on delete cascade,
  outdoor_faucet  text not null check (outdoor_faucet in ('covered', 'bare', 'unclear')),
  note            text,
  checked_at      timestamptz not null default now(),
  simulated       boolean not null default true
);

alter table public.ai_cache     enable row level security;
alter table public.photo_checks enable row level security;

revoke all on public.ai_cache, public.photo_checks from anon;
grant usage on schema public to service_role;
grant all on public.ai_cache, public.photo_checks to service_role;
