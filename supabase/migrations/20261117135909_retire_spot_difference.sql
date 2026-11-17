-- Block starts from older app versions and finish any active retired events.
do $migration$
declare
  definition text := pg_get_functiondef('public.party_event_start(uuid,text,text)'::regprocedure);
  retired_entry constant text := ',''spot_diff''';
  ongoing record;
  paused_at_before timestamptz;
  pause_gap interval;
begin
  if position(retired_entry in definition) = 0 then
    raise exception 'Expected party event kind was not found';
  end if;
  execute replace(definition, retired_entry, '');

  for ongoing in
    select distinct room_id from public.party_events where kind='spot_diff' and status='open'
  loop
    select case when paused then paused_at end into paused_at_before
    from public.rooms where id=ongoing.room_id for update;
    update public.party_events set status='done'
    where room_id=ongoing.room_id and kind='spot_diff' and status='open';

    if found and paused_at_before is not null and not exists (
      select 1 from public.party_events where room_id=ongoing.room_id and status='open'
    ) then
      pause_gap := now()-paused_at_before;
      update public.rooms set paused=false, paused_at=null, phase_ends_at=phase_ends_at+pause_gap
      where id=ongoing.room_id;
      update public.room_rounds set closes_at=closes_at+pause_gap
      where room_id=ongoing.room_id and status='open';
    end if;
  end loop;
end
$migration$;
