-- Public room discovery returns only lobby metadata, never private game state.
create or replace function public.list_open_rooms()
returns table (
  code text,
  mode text,
  phase text,
  player_count integer,
  host_nickname text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.code,
    r.mode::text,
    r.phase::text,
    (select count(*)::integer from public.players p where p.room_id = r.id) as player_count,
    coalesce(hp.nickname, 'Oyuncu') as host_nickname,
    r.created_at
  from public.rooms r
  left join public.players hp on hp.room_id = r.id and hp.is_host = true
  where r.phase <> 'results'
    and r.created_at > now() - interval '6 hours'
    and exists (select 1 from public.players p where p.room_id = r.id)
  order by r.created_at desc;
$$;

revoke all on function public.list_open_rooms() from public;
grant execute on function public.list_open_rooms() to anon, authenticated;

-- Serialize joins per room so simultaneous join attempts cannot exceed the 12-player limit.
create or replace function public.join_room(p_code text, p_nickname text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid uuid := auth.uid();
  v_nick text := btrim(p_nickname);
  v_room public.rooms;
  v_count int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_nick) not between 1 and 20 then raise exception 'invalid_nickname'; end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_code))
  for update;

  if not found then raise exception 'room_not_found'; end if;

  if exists (select 1 from public.players where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'rejoined', true);
  end if;

  if v_room.phase <> 'lobby' then raise exception 'game_in_progress'; end if;

  select count(*) into v_count from public.players where room_id = v_room.id;
  if v_count >= 12 then raise exception 'room_full'; end if;

  begin
    insert into public.players (room_id, user_id, nickname)
    values (v_room.id, v_uid, v_nick);
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;

  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'rejoined', false);
end;
$function$;
