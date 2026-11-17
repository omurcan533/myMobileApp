create or replace function public._close_idle_rooms() returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  closed_count integer;
begin
  -- Join and population changes use the same room lock.
  with candidates as (
    select id
    from public.rooms
    where closed_at is null and phase <> 'results'
      and solo_since <= now() - interval '10 minutes'
    order by id
    for update skip locked
  ), closed as (
    update public.rooms room
    set closed_at = clock_timestamp()
    from candidates
    where room.id = candidates.id
      and (select count(*) from public.players player where player.room_id = room.id) <= 1
    returning room.id
  )
  select count(*) into closed_count from closed;
  return closed_count;
end;
$$;

drop index if exists public.rooms_solo_cleanup_idx;
create index rooms_solo_cleanup_idx on public.rooms(solo_since)
where closed_at is null and phase <> 'results';
