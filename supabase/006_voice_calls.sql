-- FreezeLine: phone calls placed by the voice agent, and what the household said (after 001-005).
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
-- Holds phone numbers and spoken answers: RLS on, NO anon access. Written only by the server
-- (/api/voice/result, the Run agent demo call, scripts) with the service role.

create table if not exists public.voice_calls (
  id              uuid primary key default gen_random_uuid(),
  -- Twilio's id for the call; null until Twilio accepts it (and always null for sample rows).
  call_sid        text unique,
  -- 'demo' = a real call to a teammate's phone standing in for a household (Run agent);
  -- 'sample' = generated model data. Real household calls (Phase 4) will use 'live'.
  source          text not null check (source in ('demo', 'sample', 'live')),
  simulated       boolean not null default false,
  -- The household the call is about, and the Uri replay hour it belongs to.
  home_id         text references public.homes(id) on delete set null,
  registration_id uuid references public.registrations(id) on delete set null,
  plan_for        timestamptz,
  to_phone        text not null check (to_phone ~ '^\+1[2-9][0-9]{9}$'),
  lang            text not null default 'en' check (lang in ('en', 'es')),
  mode            text not null default 'storm' check (mode in ('storm', 'survey')),
  level           text check (level in ('High', 'Medium', 'Low')),
  -- Call progress: queued -> ringing -> in_progress -> completed, or no_answer / busy / failed / canceled.
  status          text not null default 'queued'
                  check (status in ('queued', 'ringing', 'in_progress', 'completed', 'no_answer', 'busy', 'failed', 'canceled')),
  -- True once the agent reached the end of its script (every question asked).
  finished        boolean not null default false,
  -- What the household said, from the agent (voice/script.py Call.result()).
  answers         jsonb not null default '{}'::jsonb,
  questions_answered int not null default 0,
  assessment      text check (assessment in ('ready', 'needs_reminder', 'needs_crew')),
  closing         text,
  transcript      jsonb not null default '[]'::jsonb,
  duration_s      int,
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  ended_at        timestamptz
);

create index if not exists voice_calls_created_idx on public.voice_calls (created_at desc);
create index if not exists voice_calls_home_idx    on public.voice_calls (home_id);
create index if not exists voice_calls_status_idx  on public.voice_calls (status);

-- ---------- access: server only ----------
alter table public.voice_calls enable row level security;
revoke all on public.voice_calls from anon, authenticated;
grant usage on schema public to service_role;
grant all on public.voice_calls to service_role;
