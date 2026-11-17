-- Reuse existing match data. No new per-player question history is stored.
create index if not exists room_rounds_recent_opened_idx
  on public.room_rounds (room_id, opens_at) where opens_at is not null;

create function app_safety.recent_puzzle_answers(p_room uuid)
returns table (kind public.question_kind, answer_key text, last_seen timestamptz)
language sql stable set search_path = '' as $$
  select q.kind, public.norm_answer(q.answer), max(r.opens_at)
  from (
    select distinct past.room_id
    from public.players current_player
    join public.players past on past.user_id = current_player.user_id
    where current_player.room_id = p_room and not current_player.is_bot and past.room_id <> p_room
  ) as previous_rooms
  join public.room_rounds r on r.room_id = previous_rooms.room_id
  join public.questions q on q.id = r.question_id
  where r.opens_at between now() - interval '7 days' and now()
  group by q.kind, public.norm_answer(q.answer)
$$;
revoke all on function app_safety.recent_puzzle_answers(uuid) from public, anon, authenticated;

-- Preserve the rest of the live start_game function, including mode limits and language.
do $migration$
declare
  definition text := pg_get_functiondef('public.start_game(uuid)'::regprocedure);
  old_order constant text := 'select qq.*, row_number() over (order by random()) - 1 as rn
          from questions qq';
  new_order constant text := 'select qq.*, row_number() over (order by seen.last_seen asc nulls first, random()) - 1 as rn
          from questions qq
          left join app_safety.recent_puzzle_answers(p_room) seen
            on seen.kind = qq.kind and seen.answer_key = public.norm_answer(qq.answer)';
begin
  if position(old_order in definition) = 0 then
    raise exception 'Expected question selection query was not found';
  end if;
  execute replace(definition, old_order, new_order);
end;
$migration$;

alter table public.rooms add column rematch_room_id uuid references public.rooms(id) on delete set null;
create index rooms_rematch_room_idx on public.rooms(rematch_room_id) where rematch_room_id is not null;

-- The old results stay readable. Each player opts into the new lobby.
create function app_safety.enter_room_rematch(p_room uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := app_safety.assert_actor(true);
  source public.rooms%rowtype;
  next_room public.rooms%rowtype;
  player public.players%rowtype;
  result jsonb;
begin
  -- Same lock order as normal create/join and blocking.
  perform pg_advisory_xact_lock(748039110);
  select * into source from public.rooms where id = p_room for update;
  if not found or source.closed_at is not null or source.phase <> 'results' then
    raise exception 'round_not_finished';
  end if;
  select * into player from public.players where room_id = p_room and user_id = actor and not is_bot;
  if not found then raise exception 'not_in_room'; end if;

  if source.rematch_room_id is not null then
    select * into next_room from public.rooms where id = source.rematch_room_id for update;
  end if;
  if next_room.id is not null and next_room.closed_at is null and not coalesce((
    next_room.phase = 'lobby' and next_room.solo_since <= now() - interval '10 minutes'
    and (select count(*) from public.players where room_id = next_room.id) <= 1
  ), false) then
    return public.join_room(next_room.code, player.nickname);
  end if;

  if not player.is_host or source.host_user_id <> actor then
    raise exception 'rematch_not_ready';
  end if;
  result := public.create_room_localized(player.nickname, source.mode, source.game_language);
  update public.rooms
     set selected_games = source.selected_games,
         selected_games_locked = source.selected_games_locked,
         friend_facts_enabled = source.friend_facts_enabled,
         jokers_per_team = source.jokers_per_team
   where id = (result->>'room_id')::uuid;
  update public.rooms set rematch_room_id = (result->>'room_id')::uuid where id = p_room;
  return result;
end;
$$;

create function public.enter_room_rematch(p_room uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select app_safety.enter_room_rematch(p_room)
$$;
revoke all on function app_safety.enter_room_rematch(uuid), public.enter_room_rematch(uuid) from public, anon, authenticated;
grant execute on function app_safety.enter_room_rematch(uuid), public.enter_room_rematch(uuid) to authenticated;
