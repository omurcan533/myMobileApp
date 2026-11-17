-- A lease fences database ticks, timeout resolution and server instances from each other.
alter table public.room_minigames
  add column pong_server_owner uuid,
  add column pong_server_until timestamptz;

create function app_safety.pong_socket_player(p_match uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := app_safety.assert_actor();
  player_id uuid;
begin
  select p.id into player_id
  from public.room_minigames m
  join public.rooms r on r.id = m.room_id
  join public.players p on p.room_id = r.id and p.user_id = actor and not p.is_bot
  where m.id = p_match and m.kind = 'pong' and m.status = 'live'
    and m.starts_at is not null and r.phase = 'minigame' and r.closed_at is null;
  if not found then raise exception 'not_in_game'; end if;
  return player_id;
end
$$;
create function public.pong_socket_player(p_match uuid)
returns uuid language sql security invoker set search_path = '' as $$
  select app_safety.pong_socket_player(p_match)
$$;
revoke all on function app_safety.pong_socket_player(uuid), public.pong_socket_player(uuid) from public, anon, authenticated;
grant execute on function app_safety.pong_socket_player(uuid), public.pong_socket_player(uuid) to authenticated;

create function public.pong_server_sync(p_match uuid, p_owner uuid, p_state jsonb default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  room public.rooms%rowtype;
  match public.room_minigames%rowtype;
  checked_at timestamptz;
begin
  if p_owner is null then raise exception 'invalid_owner'; end if;
  select * into room from public.rooms where id = (
    select room_id from public.room_minigames where id = p_match
  ) for update;
  select * into match from public.room_minigames where id = p_match for update;
  checked_at := clock_timestamp();
  if not found or match.kind <> 'pong' or room.phase <> 'minigame' or room.closed_at is not null
     or match.starts_at is null or match.pong_state is null or room.phase_ends_at is null then
    return jsonb_build_object('status','unavailable');
  end if;
  if match.status <> 'live' then
    return jsonb_build_object('status','done','state',match.pong_state);
  end if;

  if p_state is null then
    if match.pong_server_until > checked_at and match.pong_server_owner is distinct from p_owner then
      return jsonb_build_object('status','busy');
    end if;
  elsif match.pong_server_owner is distinct from p_owner or match.pong_server_until is null or match.pong_server_until <= checked_at then
    return jsonb_build_object('status','lost');
  elsif not room.paused then
    -- The service only submits physics. Keep the database-owned roster and votes.
    match.pong_state := match.pong_state
      || (p_state - array['a1','a2','b1','b2','modeA','modeB','modeVotes']);
  end if;

  update public.room_minigames
     set pong_server_owner = p_owner, pong_server_until = checked_at + interval '6 seconds',
         pong_state = match.pong_state
   where id = p_match;
  if not room.paused and (
    checked_at >= room.phase_ends_at or
    greatest((match.pong_state->>'scoreA')::int, (match.pong_state->>'scoreB')::int) >= 5
  ) then
    update public.room_minigames set pong_server_owner = null, pong_server_until = null where id = p_match;
    perform public._resolve_minigame(p_match);
    return jsonb_build_object('status','done','state',match.pong_state);
  end if;
  return jsonb_build_object('status','live','state',match.pong_state,
    'paused',room.paused,'startsAt',match.starts_at,'endsAt',room.phase_ends_at);
end
$$;
revoke all on function public.pong_server_sync(uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.pong_server_sync(uuid,uuid,jsonb) to service_role;

do $migration$
declare definition text;
        marker text;
begin
  definition := pg_get_functiondef('public.pong_tick(uuid)'::regprocedure);
  marker := 's:=m.pong_state; if s is null then return null; end if;';
  if position(marker in definition)=0 then raise exception 'unexpected pong_tick'; end if;
  execute replace(definition, marker, marker || E'\n if m.pong_server_until > clock_timestamp() then return s; end if;');

  definition := pg_get_functiondef('public.pong_set_held(uuid,integer,boolean)'::regprocedure);
  marker := 'if not allowed then raise exception ''pong_wrong_direction''; end if;';
  if position(marker in definition)=0 then raise exception 'unexpected pong_set_held'; end if;
  execute replace(definition, marker, marker || E'\n if m.pong_server_until > clock_timestamp() then return; end if;');

  definition := pg_get_functiondef('public._resolve_minigame(uuid)'::regprocedure);
  marker := 'if not found or v_mg.status <> ''live'' then return; end if;';
  if position(marker in definition)=0 then raise exception 'unexpected _resolve_minigame'; end if;
  execute replace(definition, marker, marker || E'\n  if v_mg.kind = ''pong'' and v_mg.pong_server_until > clock_timestamp() then return; end if;');
end
$migration$;
