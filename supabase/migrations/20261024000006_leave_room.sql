alter table public.players replica identity full;

create or replace function leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_me players;
  v_next_host players;
  v_next_captain uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then return; end if;

  select * into v_me
    from players
   where room_id = p_room and user_id = auth.uid()
   for update;
  if not found then return; end if;

  delete from players where id = v_me.id;

  if v_me.is_captain and v_me.team_side is not null then
    select id into v_next_captain
      from players
     where room_id = p_room and team_side = v_me.team_side
     order by joined_at, id
     limit 1;
    if found then
      update players set is_captain = true where id = v_next_captain;
    end if;
  end if;

  if v_room.host_user_id = auth.uid() then
    select * into v_next_host
      from players
     where room_id = p_room
     order by joined_at, id
     limit 1;

    if not found then
      delete from rooms where id = p_room;
      return;
    end if;

    update players set is_host = (id = v_next_host.id) where room_id = p_room;
    update rooms set host_user_id = v_next_host.user_id where id = p_room;
  end if;
end $$;

revoke execute on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated;
