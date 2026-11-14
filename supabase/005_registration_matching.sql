-- FreezeLine: match each sign-up's address to a home on the map (after 004). Safe to re-run.
-- The address is looked up with OpenStreetMap's Nominatim search, then matched to the nearest
-- OSM house footprint FreezeLine knows about. Server-only like the rest of the table.

alter table public.registrations add column if not exists match_status text not null default 'pending';
alter table public.registrations drop constraint if exists registrations_match_status_check;
alter table public.registrations add constraint registrations_match_status_check check (match_status in (
  'pending',            -- not looked up yet (lookup failed or was busy; npm run registrations:match retries)
  'matched',            -- the address point is on/next to a known home footprint (confirmed)
  'nearby_on_street',   -- linked to the nearest known home on the same street (estimated)
  'no_home_nearby',     -- inside a FreezeLine area, but no known home close enough
  'outside_area',       -- found, but outside the 4 FreezeLine areas
  'address_not_found',  -- OpenStreetMap couldn't find the address
  'placeholder'         -- sample sign-up, linked to its home directly
));
alter table public.registrations add column if not exists match_distance_m int;
alter table public.registrations add column if not exists geocode_lat double precision;
alter table public.registrations add column if not exists geocode_lng double precision;
alter table public.registrations add column if not exists zone_id text references public.zones(id) on delete set null;
alter table public.registrations add column if not exists matched_at timestamptz;

create index if not exists registrations_match_idx on public.registrations (match_status);

-- Placeholder rows were linked to a home when they were generated.
update public.registrations r
   set match_status = 'placeholder', zone_id = h.zone_id, match_distance_m = 0, matched_at = coalesce(r.matched_at, now())
  from public.homes h
 where r.source = 'placeholder' and r.home_id = h.id and r.match_status <> 'placeholder';
