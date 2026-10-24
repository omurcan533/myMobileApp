drop trigger if exists room_rounds_team_reveal_duration on room_rounds;
drop function if exists _reserve_team_reveal_time();

create or replace function assign_teams(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_count int;
  v_flip boolean := random() < 0.5;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase <> 'lobby' then raise exception 'already_started'; end if;

  select count(*) into v_count from players where room_id = p_room;
  if v_count < 2 then raise exception 'need_two_players'; end if;

  with ranked as (
    select id, row_number() over (order by random()) as rn
      from players
     where room_id = p_room
  )
  update players p
     set team_side = case when ((ranked.rn % 2) = 1) = v_flip then 'A'::team_side else 'B'::team_side end
    from ranked
   where p.id = ranked.id;

  update players set is_captain = false, is_architect = false where room_id = p_room;
  with ordered as (
    select id,
           row_number() over (partition by team_side order by joined_at, id) as rn,
           count(*) over (partition by team_side) as cnt
      from players
     where room_id = p_room
  )
  update players p
     set is_captain = (ordered.rn = 1),
         is_architect = (ordered.rn = ordered.cnt)
    from ordered
   where p.id = ordered.id;

  update rooms
     set phase = 'team_reveal',
         phase_started_at = now(),
         phase_ends_at = null
   where id = p_room;
end $$;

create or replace function start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_count int;
  v_plan record;
  v_idx int := 0;
  v_first uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase::text <> 'team_reveal' then raise exception 'teams_not_assigned'; end if;

  select count(*) into v_count from players where room_id = p_room;
  if v_count < 2 or exists (
    select 1 from players where room_id = p_room and team_side is null
  ) then
    raise exception 'teams_not_assigned';
  end if;

  if not exists (select 1 from players where room_id = p_room and team_side = 'A' and is_captain)
     or not exists (select 1 from players where room_id = p_room and team_side = 'B' and is_captain) then
    raise exception 'teams_not_assigned';
  end if;

  if v_room.phase_started_at is null
     or now() < v_room.phase_started_at + make_interval(secs => (8.01 + v_count * 1.45)::double precision) then
    raise exception 'team_reveal_in_progress';
  end if;

  insert into room_teams (room_id, side, jokers_left)
  values (p_room, 'A', v_room.jokers_per_team), (p_room, 'B', v_room.jokers_per_team)
  on conflict (room_id, side) do update set jokers_left = excluded.jokers_left;

  for v_plan in
    select * from (values
      ('base'::question_tier, case v_room.mode::text when 'quick' then 4 when 'standard' then 6 else 8 end),
      ('body'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 5 else 7 end),
      ('roof'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 3 else 5 end)
    ) as t(tier, cnt)
  loop
    insert into room_rounds (room_id, idx, tier, kind, question_id, prompt, hints, piece_id)
    select p_room, v_idx + q.rn::int, v_plan.tier, q.kind, q.id, q.prompt, q.hints,
           (select pc.id from pieces pc where pc.tier = v_plan.tier and q.id is not null order by random() limit 1)
      from (
        select qq.*, row_number() over (order by random()) - 1 as rn
          from questions qq
         where qq.active
           and qq.tier = v_plan.tier
           and qq.kind = case when v_plan.tier = 'base' then 'anagram'::question_kind else 'riddle'::question_kind end
      ) q
     where q.rn < v_plan.cnt;

    select count(*) into v_idx from room_rounds where room_id = p_room;
  end loop;

  if v_idx = 0 then raise exception 'no_questions'; end if;

  update rooms
     set phase = 'question',
         phase_started_at = now(),
         building_ready_a = false,
         building_ready_b = false
   where id = p_room;

  select id into v_first from room_rounds where room_id = p_room and idx = 0;
  perform _open_round(v_first);
end $$;
