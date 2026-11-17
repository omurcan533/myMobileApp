create table public.reflex_trial_progress (
  minigame_id uuid not null references public.room_minigames(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  starts_at timestamptz not null,
  ready_at timestamptz not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  total_ms bigint not null default 0,
  primary key (minigame_id, player_id)
);
alter table public.reflex_trial_progress enable row level security;
revoke all on public.reflex_trial_progress from public, anon, authenticated;

create function public.reflex_trial(p_minigame uuid, p_attempt integer default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  game public.room_minigames;
  room public.rooms;
  v_player_id uuid;
  progress public.reflex_trial_progress;
  observed_at timestamptz := clock_timestamp();
  elapsed integer;
begin
  select * into game from public.room_minigames where id = p_minigame for update;
  if not found or game.kind <> 'reflex' or game.starts_at is null
     or (select sum(ascii(ch)) % 3 from regexp_split_to_table(game.id::text, '') ch) <> 0 then
    raise exception 'minigame_closed';
  end if;
  select * into room from public.rooms where id = game.room_id;
  select p.id into v_player_id from public.players p
    where p.room_id = room.id and p.user_id = auth.uid() and p.team_side is not null;
  if v_player_id is null then raise exception 'not_in_game'; end if;

  select * into progress from public.reflex_trial_progress t
    where t.minigame_id = game.id and t.player_id = v_player_id;
  if progress.attempts = 5 then
    return jsonb_build_object('attempts', 5, 'ready_at', null, 'average_ms', round(progress.total_ms / 5.0)::int);
  end if;
  if game.status <> 'live' or room.closed_at is not null or room.phase <> 'minigame'
     or room.phase_ends_at is null or observed_at >= room.phase_ends_at then
    raise exception 'minigame_closed';
  end if;
  if room.paused then raise exception 'game_paused'; end if;

  if progress.minigame_id is null or progress.starts_at <> game.starts_at then
    insert into public.reflex_trial_progress as t (minigame_id, player_id, starts_at, ready_at)
      values (game.id, v_player_id, game.starts_at,
        greatest(game.starts_at, clock_timestamp()) + make_interval(secs => 0.9 + random() * 1.4))
      on conflict (minigame_id, player_id) do update
        set starts_at = excluded.starts_at, ready_at = excluded.ready_at
      returning * into progress;
  elsif p_attempt = progress.attempts + 1 then
    if observed_at < progress.ready_at then raise exception 'too_early'; end if;
    elapsed := greatest(1, round(extract(epoch from observed_at - progress.ready_at) * 1000)::int);
    update public.reflex_trial_progress t
      set attempts = t.attempts + 1, total_ms = t.total_ms + elapsed,
          ready_at = clock_timestamp() + make_interval(secs => 0.9 + random() * 1.4)
      where t.minigame_id = game.id and t.player_id = v_player_id
      returning * into progress;
    if progress.attempts = 5 then
      insert into public.minigame_entries(minigame_id, player_id, reaction_ms)
        values (game.id, v_player_id, round(progress.total_ms / 5.0)::int)
        on conflict (minigame_id, player_id) do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'attempts', progress.attempts,
    'ready_at', case when progress.attempts < 5 then progress.ready_at end,
    'average_ms', case when progress.attempts = 5 then round(progress.total_ms / 5.0)::int end
  );
end;
$$;
revoke execute on function public.reflex_trial(uuid, integer) from public, anon;
grant execute on function public.reflex_trial(uuid, integer) to authenticated;

-- Preserve all other game resolution rules. In math, use server receipt time
-- only when both teams' closest answers have the same error.
do $$
declare
  definition text := pg_get_functiondef('public._resolve_minigame(uuid)'::regprocedure);
  existing constant text := 'min(abs(e.guess_num - v_math_answer))';
  marker constant text := 'when v_b is not null and (v_a is null or v_b < v_a) then ''B''::team_side';
  changed text;
  math_start int;
begin
  if position(existing in definition) = 0 then raise exception 'math scoring definition changed'; end if;
  math_start := strpos(definition, 'elsif v_mg.kind = ''math_guess'' then');
  if math_start = 0 or strpos(substr(definition, math_start), marker) = 0 then
    raise exception 'math scoring tie rule changed';
  end if;
  changed := replace(substr(definition, math_start), existing, 'min(abs(e.guess_num::bigint - v_math_answer))');
  changed := replace(changed, marker, marker || E'\n' || $tie$      when v_a = v_b then (
        select p.team_side
        from public.minigame_entries e
        join public.players p on p.id = e.player_id
        where e.minigame_id = p_mg and p.room_id = v_mg.room_id
          and p.team_side is not null and abs(e.guess_num::bigint - v_math_answer) = v_a
        order by e.created_at, e.id limit 1
      )$tie$);
  execute left(definition, math_start - 1) || changed;
end;
$$;

-- Use the same post-goal delay when the database hosts a Pong match.
do $$
declare
  definition text := pg_get_functiondef('public.pong_tick(uuid)'::regprocedure);
  marker constant text := ' x:=x+vx*dt; y:=y+vy*dt;';
  right_goal constant text := 'x:=0.5;y:=0.5;vx:=0.46;vy:=0.23; end if;';
  left_goal constant text := 'x:=0.5;y:=0.5;vx:=-0.46;vy:=-0.23; end if;';
  restart constant text := 'x:=0.5;y:=0.5;vx:=0;vy:=0; s:=s||jsonb_build_object(''serveAt'',floor(extract(epoch from tick_now)*1000)+1500,''serveDirection'',';
begin
  if strpos(definition, marker) = 0 or strpos(definition, right_goal) = 0 or strpos(definition, left_goal) = 0 then
    raise exception 'pong serve definition changed';
  end if;
  definition := replace(definition, marker, $serve$
 if jsonb_typeof(s->'serveAt') = 'number' then
   if extract(epoch from tick_now) * 1000 < (s->>'serveAt')::numeric then
     dt:=0;
   else
     vx:=0.46*(s->>'serveDirection')::numeric;
     vy:=0.23*(s->>'serveDirection')::numeric;
     s:=s||jsonb_build_object('serveAt',null,'serveDirection',null);
     dt:=0;
   end if;
 end if;
$serve$ || marker);
  definition := replace(definition, right_goal, restart || '1); end if;');
  definition := replace(definition, left_goal, restart || '-1); end if;');
  execute definition;
end;
$$;
