-- Dedicated memory selection; retain old random reflex rounds and their replays.
CREATE OR REPLACE FUNCTION public.set_room_games(p_room uuid, p_games text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
if auth.uid() is null then raise exception 'not_authenticated';end if;
if p_games is null or cardinality(p_games)=0 or not(p_games<@array['anagram','riddle','reflex','memory','math_guess','social_guess','pong','line_connect','survivor_memory','tug_of_war']::text[]) then raise exception 'invalid_game_selection';end if;
update public.rooms set selected_games=p_games,selected_games_locked=true where id=p_room and host_user_id=auth.uid() and phase='lobby' and mode='custom';
if not found then raise exception 'custom_mode_only';end if;
end $function$;

CREATE OR REPLACE FUNCTION public.next_selected_minigame_kind(p_room uuid)
 RETURNS minigame_kind
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
select v.kind from (values ('reflex'::minigame_kind),('memory'::minigame_kind),('math_guess'::minigame_kind),('social_guess'::minigame_kind),('pong'::minigame_kind),('line_connect'::minigame_kind),('survivor_memory'::minigame_kind),('tug_of_war'::minigame_kind)) v(kind)
join rooms r on r.id=p_room
where v.kind::text=any(r.selected_games)
and (v.kind<>'pong' or (select count(*) from players where room_id=p_room and team_side='A')>=1 and (select count(*) from players where room_id=p_room and team_side='B')>=1)
order by (select count(*) from room_minigames m where m.room_id=p_room and m.kind=v.kind),random() limit 1 $function$;

CREATE OR REPLACE FUNCTION public.has_unplayed_selected_minigame(p_room uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
select exists(select 1 from rooms r cross join lateral unnest(r.selected_games) g(kind)
where r.id=p_room and g.kind in ('reflex','memory','math_guess','social_guess','pong','tug_of_war','line_connect','survivor_memory')
and (g.kind<>'pong' or ((select count(*) from players where room_id=p_room and team_side='A')>=1 and (select count(*) from players where room_id=p_room and team_side='B')>=1))
and not exists(select 1 from room_minigames m where m.room_id=p_room and m.kind::text=g.kind)) $function$;

CREATE OR REPLACE FUNCTION public.replay_memory(p_minigame uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.room_minigames; r public.rooms; next_id uuid; latest_id uuid; variant int;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into m from public.room_minigames where id=p_minigame;
 if not found then raise exception 'round_closed'; end if;
 select * into r from public.rooms where id=m.room_id for update;
 if not exists(select 1 from public.players where room_id=m.room_id and user_id=auth.uid() and is_host) then raise exception 'not_host'; end if;
 if r.closed_at is not null or r.phase<>'minigame' then raise exception 'game_moved_on'; end if;
 if r.paused then raise exception 'game_paused'; end if;
 select * into m from public.room_minigames where id=p_minigame for update;
 select sum(ascii(c))%3 into variant from regexp_split_to_table(m.id::text,'') c;
 if (m.kind<>'memory' and (m.kind<>'reflex' or variant<>1)) or m.status<>'done' then raise exception 'round_not_finished'; end if;
 select id into latest_id from public.room_minigames where room_id=m.room_id order by created_at desc,id desc limit 1;
 select id into next_id from public.room_minigames where rematch_of=m.id order by created_at desc limit 1;
 if next_id is not null and next_id=latest_id then return next_id; end if;
 if latest_id<>m.id then raise exception 'game_moved_on'; end if;
 loop
  next_id:=gen_random_uuid();
  select sum(ascii(c))%3 into variant from regexp_split_to_table(next_id::text,'') c;
  exit when m.kind='memory' or variant=1;
 end loop;
 insert into public.room_minigames(id,room_id,kind,prompt,status,starts_at,rematch_of,created_at)
 values(next_id,m.room_id,m.kind,m.prompt,'live',null,m.id,clock_timestamp());
 update public.rooms set phase_started_at=clock_timestamp(),phase_ends_at=null where id=m.room_id;
 return next_id;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_minigame_entry(p_minigame uuid, p_target uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_mg room_minigames; v_room rooms; v_me players; v_ms int;
begin
  select * into v_mg from room_minigames where id = p_minigame;
  if not found then raise exception 'minigame_not_found'; end if;
  select * into v_me from players where room_id = v_mg.room_id and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  select * into v_room from rooms where id = v_mg.room_id;

  if v_mg.status <> 'live' or v_room.phase <> 'minigame' then raise exception 'not_live'; end if;
  if now() > v_room.phase_ends_at then raise exception 'minigame_over'; end if;

  if v_mg.kind in ('reflex','memory') then
    if now() < v_mg.starts_at then raise exception 'too_early'; end if;
    v_ms := floor(extract(epoch from (now() - v_mg.starts_at)) * 1000)::int;
  else
    if p_target is null
       or not exists (select 1 from players where id = p_target and room_id = v_mg.room_id) then
      raise exception 'invalid_target';
    end if;
  end if;

  insert into minigame_entries (minigame_id, player_id, target_player_id, reaction_ms)
  values (p_minigame, v_me.id, p_target, v_ms)
  on conflict (minigame_id, player_id) do nothing;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_minigame_entry(p_minigame uuid, p_target uuid DEFAULT NULL::uuid, p_guess integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mg room_minigames; v_room rooms; v_me players;
  v_ms int;
  v_count int; v_players int;
begin
  select * into v_mg from room_minigames where id = p_minigame;
  if not found or v_mg.status <> 'live' then raise exception 'minigame_closed'; end if;
  select * into v_room from rooms where id = v_mg.room_id;
  if v_room.paused then raise exception 'game_paused'; end if;

  select * into v_me from players where room_id = v_mg.room_id and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;

  if exists (select 1 from minigame_entries where minigame_id = p_minigame and player_id = v_me.id) then
    return;
  end if;

  if v_mg.kind in ('reflex','memory') then
    if now() < v_mg.starts_at then raise exception 'too_early'; end if;
    v_ms := greatest(1, floor(extract(epoch from (now() - v_mg.starts_at)) * 1000)::int);
  end if;

  insert into minigame_entries (minigame_id, player_id, target_player_id, reaction_ms, guess_num)
  values (p_minigame, v_me.id, p_target, v_ms, p_guess);

  -- Never reveal a math answer before the round timer expires.
  -- The normal round-resolution path handles scoring after the deadline.

end $function$;

CREATE OR REPLACE FUNCTION public.confirm_briefing(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room rooms;
  v_round room_rounds;
  v_mg room_minigames;
  v_mod int;
  v_starts timestamptz;
  v_ends timestamptz;
  v_secs int;
begin
  if not exists (
    select 1 from players
     where room_id = p_room
       and user_id = auth.uid()
       and is_host
  ) then
    raise exception 'not_host';
  end if;

  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.closed_at is not null or v_room.paused then
    return;
  end if;

  -- Kurucunun en az 5 saniye beklemesini zorunlu kıl (yanlışlıkla veya kötü niyetle hızlı geçişi önlemek için)
  if v_room.phase_started_at is not null and now() < v_room.phase_started_at + interval '4.8 seconds' then
    raise exception 'too_early';
  end if;

  if v_room.phase = 'question' then
    select * into v_round
      from room_rounds
     where room_id = p_room
       and status = 'open'
       and opens_at is null
     order by idx
     limit 1
     for update;

    if found then
      v_secs := tier_seconds(v_round.tier);
      update room_rounds
         set opens_at = now(),
             closes_at = now() + make_interval(secs => v_secs)
       where id = v_round.id;

      update rooms
         set phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => v_secs)
       where id = p_room;
    end if;

  elsif v_room.phase = 'minigame' then
    select * into v_mg
      from room_minigames
     where room_id = p_room
       and status = 'live'
       and starts_at is null
     order by created_at desc
     limit 1
     for update;

    if found then
      if v_mg.kind = 'pong' then
        -- Optional team consensus changes the mode; missing votes keep assigned duo roles.
        v_starts := now() + interval '3 seconds';
        v_ends := now() + interval '300 seconds';
      elsif v_mg.kind = 'tug_of_war' then
        v_starts := now() + interval '3 seconds';
        v_ends := v_starts + make_interval(secs => coalesce(nullif(v_mg.target_num,0),60));
      elsif v_mg.kind = 'survivor_memory' then
        v_starts := now() + interval '9 seconds';
        v_ends := v_starts + interval '100 seconds';
      elsif v_mg.kind = 'memory' then
        v_starts := now();
        v_ends := v_starts + interval '32 seconds';
      elsif v_mg.kind = 'line_connect' then
        v_starts := now();
        v_ends := now() + interval '30 seconds';
      elsif v_mg.kind = 'song_complete' then
        v_starts := now();
        v_ends := now() + interval '65 seconds';
      elsif v_mg.kind = 'math_guess' then
        v_starts := now();
        v_ends := now() + interval '26 seconds';
      elsif v_mg.kind = 'social_guess' then
        v_starts := now();
        v_ends := now() + interval '35 seconds';
      else
        -- variant: mod % 3 (0: reflex, 1: memory, 2: balance)
        select coalesce(sum(ascii(c)), 0) % 3 into v_mod
          from regexp_split_to_table(v_mg.id::text, '') as c;

        if v_mod = 0 then
          -- Saf refleks: yeşil ışığa kadar 2 sn bekleme
          v_starts := now() + interval '2 seconds';
          v_ends := v_starts + interval '30 seconds';
        else
          -- Hafıza veya denge
          v_starts := now();
          v_ends := now() + interval '32 seconds';
        end if;
      end if;

      update room_minigames
         set starts_at = v_starts
       where id = v_mg.id;

      update rooms
         set phase_started_at = now(),
             phase_ends_at = v_ends
       where id = p_room;
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public._resolve_minigame(p_mg uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mg room_minigames;
  v_a numeric;
  v_b numeric;
  v_top uuid;
  v_win team_side;
  v_piece uuid;
  v_max_votes int;
  v_top_count int;
  v_math_answer integer;
begin
  select * into v_mg from room_minigames where id = p_mg for update;
  if not found or v_mg.status <> 'live' then return; end if;

  if v_mg.kind='line_connect' then
    -- Everyone gets a chance. Resolve at 30 seconds or once every human has a valid finish.
    if v_mg.starts_at is null or v_mg.starts_at>now() then return; end if;
    if exists(select 1 from rooms where id=v_mg.room_id and (closed_at is not null or paused or phase_ends_at is null)) then return; end if;
    if exists(select 1 from rooms where id=v_mg.room_id and now()<phase_ends_at) and (
      not exists(select 1 from players where room_id=v_mg.room_id and team_side is not null and not is_bot)
      or exists(select 1 from players p where p.room_id=v_mg.room_id and p.team_side is not null and not p.is_bot
        and not exists(select 1 from minigame_entries e where e.minigame_id=p_mg and e.player_id=p.id and e.reaction_ms is not null))
    ) then return; end if;
  end if;

  if v_mg.kind = 'pong' then
    v_a := coalesce((v_mg.pong_state->>'scoreA')::numeric,0);
    v_b := coalesce((v_mg.pong_state->>'scoreB')::numeric,0);
    v_win := case when v_a>v_b then 'A'::team_side when v_b>v_a then 'B'::team_side else null end;
  elsif v_mg.kind = 'tug_of_war' then
    select coalesce(sum(s.force_total) filter(where p.team_side='A'),0),coalesce(sum(s.force_total) filter(where p.team_side='B'),0) into v_a,v_b from public.minigame_tug_scores s join public.players p on p.id=s.player_id where s.minigame_id=p_mg;
    v_win := case when v_a>v_b then 'A'::team_side when v_b>v_a then 'B'::team_side else null end;
  elsif v_mg.kind = 'survivor_memory' then
    v_a := coalesce((v_mg.survivor_state->'A'->>'row')::numeric,0);
    v_b := coalesce((v_mg.survivor_state->'B'->>'row')::numeric,0);
    v_win := case when v_a>v_b then 'A'::team_side when v_b>v_a then 'B'::team_side else null end;
  elsif v_mg.kind = 'song_complete' then
    v_win := null;
  elsif v_mg.kind = 'line_connect' then
    -- Persist the exact winning individual as well as the team.
    select p.team_side,e.player_id into v_win,v_top
    from minigame_entries e join players p on p.id=e.player_id
    where e.minigame_id=p_mg and p.room_id=v_mg.room_id and p.team_side is not null and e.reaction_ms is not null
    order by e.reaction_ms,e.created_at,e.id limit 1;
  elsif v_mg.kind in ('reflex','memory') then
    select avg(coalesce(e.reaction_ms, 30000)) filter (where p.team_side = 'A'),
           avg(coalesce(e.reaction_ms, 30000)) filter (where p.team_side = 'B')
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;
    v_win := case when v_a < v_b then 'A'::team_side when v_b < v_a then 'B'::team_side else null end;

  elsif v_mg.kind = 'math_guess' then
    select answer into v_math_answer from private_minigame_answers where minigame_id=p_mg;
    select min(abs(e.guess_num - v_math_answer)) filter (where p.team_side = 'A'),
           min(abs(e.guess_num - v_math_answer)) filter (where p.team_side = 'B')
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;

    v_win := case
      when v_a is not null and (v_b is null or v_a < v_b) then 'A'::team_side
      when v_b is not null and (v_a is null or v_b < v_a) then 'B'::team_side
      else null
    end;

  else
    -- Sosyal tahmin: En yüksek oyu alan tek bir kişi varsa çoğunluk kararı oluşmuştur.
    select count(*) into v_max_votes
      from minigame_entries
     where minigame_id = p_mg and target_player_id is not null
     group by target_player_id
     order by count(*) desc
     limit 1;

    -- En yüksek oyu alan kaç farklı aday var?
    select count(*) into v_top_count
      from (
        select target_player_id
          from minigame_entries
         where minigame_id = p_mg and target_player_id is not null
         group by target_player_id
        having count(*) = v_max_votes
      ) t;

    -- Yalnızca tek bir çoğunluk adayı varsa (beraberlik yoksa) takımların oy oranı karşılaştırılır:
    if coalesce(v_max_votes, 0) > 0 and v_top_count = 1 then
      select target_player_id into v_top
        from minigame_entries
       where minigame_id = p_mg and target_player_id is not null
       group by target_player_id
       order by count(*) desc
       limit 1;

      select coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'A'), 0)::numeric
               / nullif(count(*) filter (where p.team_side = 'A'), 0),
             coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'B'), 0)::numeric
               / nullif(count(*) filter (where p.team_side = 'B'), 0)
        into v_a, v_b
        from players p
        left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
       where p.room_id = v_mg.room_id;

      v_win := case when v_a > v_b then 'A'::team_side when v_b > v_a then 'B'::team_side else null end;
    else
      -- En çok oyu alan birden fazla kişi varsa (örn. 1 oy ömür, 1 oy doğuş) veya oy yoksa berabere
      v_win := null;
    end if;
  end if;

  if v_win is not null then
    select id into v_piece from pieces order by random() limit 1;
    insert into team_pieces (room_id, side, piece_id, source) values (v_mg.room_id, v_win, v_piece, 'minigame');
    update room_teams set score = score + 2 where room_id = v_mg.room_id and side = v_win;
  end if;

  if v_mg.kind='line_connect' then
    update room_minigames set line_connect_state=coalesce(line_connect_state,'{}'::jsonb)||jsonb_build_object('winner_player_id',v_top) where id=p_mg;
  end if;
  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now(), target_num = case when kind='math_guess' then v_math_answer else target_num end where id = p_mg;
end $function$
;

revoke all on function public._resolve_minigame(uuid) from public,anon,authenticated;
