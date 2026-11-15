-- FreezeLine: what happens after a pre-survey call that needs someone at the house (after 007).
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
--
-- Can't reach the water shutoff (and yes to "can I call your emergency contact?"), or nobody home
-- for three days: the app calls the emergency contact from the household's sign-up. That call is
-- its own voice_calls row (mode 'contact', parent_call_id = the household's call). A no, no
-- answer or hang-up there, or no to the neighbor question, assigns a crew instead.

alter table public.voice_calls drop constraint if exists voice_calls_mode_check;
alter table public.voice_calls
  add constraint voice_calls_mode_check check (mode in ('storm', 'survey', 'contact'));

alter table public.voice_calls
  -- An emergency-contact call points at the household call it follows up.
  add column if not exists parent_call_id  uuid references public.voice_calls(id) on delete set null,
  -- What happens next for this household, in officials' words ("Crew 3 assigned", ...).
  add column if not exists followup        text,
  -- 'calling_contact' -> 'contact_helping' | 'crew_assigned' | 'crew_requested'. Null = none needed.
  add column if not exists followup_status text
    check (followup_status in ('calling_contact', 'contact_helping', 'crew_assigned', 'crew_requested')),
  -- The crew really assigned to this household (a crew_assignments row), if any.
  add column if not exists crew_name       text;

create index if not exists voice_calls_parent_idx on public.voice_calls (parent_call_id);
