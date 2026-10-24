create or replace function advance_game_host(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from players
     where room_id = p_room
       and user_id = auth.uid()
       and is_host
  ) then
    raise exception 'not_host';
  end if;

  return advance_game(p_room);
end $$;

revoke execute on function public.advance_game_host(uuid) from public, anon;
grant execute on function public.advance_game_host(uuid) to authenticated;
