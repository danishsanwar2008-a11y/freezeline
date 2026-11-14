-- FreezeLine: the checklist text sent right after a finished call (after 006).
-- Paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.
-- Without it the text still goes out (guarded by "first time this call finished"); with it the
-- text is recorded and can never be sent twice for one call.

alter table public.voice_calls
  -- 'sending' while the request is out; then 'sent' or 'failed'. Null = no text for this call.
  add column if not exists sms_status text check (sms_status in ('sending', 'sent', 'failed')),
  add column if not exists sms_body   text,
  add column if not exists sms_id     text,
  add column if not exists sms_error  text,
  add column if not exists sms_at     timestamptz;
