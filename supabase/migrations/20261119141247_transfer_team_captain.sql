create function public.transfer_team_captain(p_room uuid, p_player uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  room public.rooms;
  captain public.players;
  target public.players;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into room from public.rooms where id=p_room for update;
  if not found or room.closed_at is not null then raise exception 'room_not_found'; end if;
  if room.phase not in ('question','minigame','building','voting') then raise exception 'game_in_progress'; end if;
  select * into captain from public.players where room_id=p_room and user_id=auth.uid() and is_captain;
  if not found or captain.team_side is null then raise exception 'not_captain'; end if;
  select * into target from public.players where room_id=p_room and id=p_player and team_side=captain.team_side and not coalesce(is_bot,false);
  if not found or target.id=captain.id then raise exception 'invalid_captain_target'; end if;
  update public.players set is_captain=false where room_id=p_room and team_side=captain.team_side and is_captain;
  update public.players set is_captain=true where id=target.id;
  if room.captain_duel is not null then
    update public.rooms set captain_duel=jsonb_set(captain_duel,array['captains',captain.team_side::text],to_jsonb(target.id::text),true) where id=p_room;
  end if;
end;
$$;
revoke execute on function public.transfer_team_captain(uuid,uuid) from public,anon;
grant execute on function public.transfer_team_captain(uuid,uuid) to authenticated;
