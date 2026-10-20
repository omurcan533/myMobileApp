-- Oy verme kuralını güncelle: Oyuncuların kendi takımlarına da oy vermesine izin ver
create or replace function cast_vote(p_room uuid, p_side team_side) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_phase game_phase;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase <> 'voting' then raise exception 'voting_closed'; end if;

  insert into votes (room_id, voter_id, voted_side) values (p_room, v_me.id, p_side)
  on conflict (room_id, voter_id) do update set voted_side = excluded.voted_side;
end $$;
