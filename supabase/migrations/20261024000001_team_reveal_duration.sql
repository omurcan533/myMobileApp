create or replace function _reserve_team_reveal_time() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_player_count int;
begin
  if new.idx = 0 and new.status = 'open' and old.status is distinct from 'open' then
    select count(*) into v_player_count
      from players
     where room_id = new.room_id;

    new.closes_at := new.closes_at + make_interval(secs => (3.34 + v_player_count * 0.42)::double precision);
  end if;

  return new;
end $$;

create trigger room_rounds_team_reveal_duration
before update of status on room_rounds
for each row execute function _reserve_team_reveal_time();
