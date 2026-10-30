-- Future line games last 30 seconds. Finishes remain server-validated and scoring idempotent.
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
  elsif v_mg.kind = 'reflex' then
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

CREATE OR REPLACE FUNCTION public.advance_game(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_room rooms; v_before game_phase; v_round room_rounds; v_next room_rounds;
  v_mg room_minigames; v_players int; v_count int; v_should_minigame boolean;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.closed_at is not null then raise exception 'room_not_found'; end if;
  if auth.uid() is null or not exists(select 1 from players where room_id=p_room and user_id=auth.uid()) then raise exception 'not_in_room'; end if;
  if v_room.paused or v_room.phase = 'lobby' or v_room.phase = 'results' then
    return jsonb_build_object('phase', v_room.phase, 'advanced', false);
  end if;

  v_before := v_room.phase;

  -- ===== SORU AŞAMASI =====
  if v_room.phase = 'question' then
    select * into v_round from room_rounds where room_id = p_room and status = 'open' order by idx limit 1;
    if found then
      if now() < v_round.closes_at then
        return jsonb_build_object('phase', v_before, 'advanced', false);
      end if;
      perform _resolve_round(v_round.id, null);
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select * into v_round from room_rounds where room_id = p_room and status = 'resolved' order by resolved_at desc limit 1;
    if v_round.resolved_at > now() - interval '3 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    v_should_minigame := (v_round.idx in (3, 6, 9, 12, 15, 18))
      and v_room.selected_games && array['reflex','math_guess','social_guess','tug_of_war']::text[]
      and not exists (
        select 1 from room_minigames m
         where m.room_id = p_room
           and m.created_at > v_round.resolved_at - interval '30 seconds'
      );

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if not found and public.has_unplayed_selected_minigame(p_room) then
      perform _start_minigame(p_room);
    elsif not found then
      update rooms
         set phase = 'building',
             phase_started_at = now(),
             phase_ends_at = now() + interval '90 seconds',
             building_ready_a = false,
             building_ready_b = false
       where id = p_room;
    elsif v_should_minigame then
      perform _start_minigame(p_room);
    else
      perform _open_round(v_next.id);
    end if;

  -- ===== MİNİ OYUN =====
  elsif v_room.phase = 'minigame' then
    select * into v_mg from room_minigames where room_id = p_room order by created_at desc limit 1;

    if v_mg.status = 'live' then
      select count(*) into v_players from players where room_id = p_room;
      select count(*) into v_count   from minigame_entries where minigame_id = v_mg.id;
      if v_mg.kind='line_connect' or (v_mg.kind in ('pong','tug_of_war') and v_room.phase_ends_at is not null and now() >= v_room.phase_ends_at) or (v_mg.kind not in ('pong','tug_of_war','line_connect') and (now() >= v_room.phase_ends_at or (v_players > 0 and v_count >= v_players))) then
        perform _resolve_minigame(v_mg.id);
      end if;
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    if v_mg.kind = 'pong' and v_mg.rematch_approved_at is not null and not exists(select 1 from room_minigames where rematch_of=v_mg.id) then
      return jsonb_build_object('phase',v_before,'advanced',false);
    end if;



    if v_mg.kind='tug_of_war' and v_mg.rematch_approved_at is null then return jsonb_build_object('phase',v_before,'advanced',false); end if;
    if v_mg.resolved_at > now() - interval '6 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    if v_mg.kind='math_guess' and public._start_math_followup(v_mg.id) then
      return jsonb_build_object('phase','minigame','advanced',true);
    end if;

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if found then
      perform _open_round(v_next.id);
      update rooms set phase = 'question' where id = p_room;
    elsif public.has_unplayed_selected_minigame(p_room) then
      perform _start_minigame(p_room);
    else
      update rooms
         set phase = 'building',
             phase_started_at = now(),
             phase_ends_at = now() + interval '90 seconds',
             building_ready_a = false,
             building_ready_b = false
       where id = p_room;
    end if;

  -- ===== İNŞA (Erken Hazır Desteği) =====
  elsif v_room.phase = 'building' then
    if now() >= v_room.phase_ends_at or (v_room.building_ready_a and v_room.building_ready_b) then
      update rooms set phase = 'voting', phase_started_at = now(),
                       phase_ends_at = now() + interval '30 seconds'
       where id = p_room;
    end if;

  -- ===== OYLAMA =====
  elsif v_room.phase = 'voting' then
    select count(*) into v_players from players where room_id = p_room;
    select count(*) into v_count   from votes   where room_id = p_room;
    if now() >= v_room.phase_ends_at or v_count >= v_players then
      update rooms set phase = 'results', phase_started_at = now(), phase_ends_at = null
       where id = p_room;
    end if;
  end if;

  return jsonb_build_object('phase', (select phase from rooms where id = p_room), 'advanced', true);
end $function$
;

create or replace function public.submit_line_connect(p_minigame uuid,p_paths jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare m public.room_minigames; r public.rooms; p public.players; elapsed int;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into m from public.room_minigames where id=p_minigame;
 if not found then raise exception 'game_not_live'; end if;
 select * into r from public.rooms where id=m.room_id for update;
 select * into m from public.room_minigames where id=p_minigame for update;
 select * into p from public.players where room_id=m.room_id and user_id=auth.uid() and team_side is not null;
 if not found then raise exception 'not_in_room'; end if;
 if exists(select 1 from public.minigame_entries where minigame_id=m.id and player_id=p.id) then return true; end if;
 if r.closed_at is not null or r.paused or r.phase<>'minigame' or m.kind<>'line_connect' or m.status<>'live' or m.starts_at is null or r.phase_ends_at is null or now()<m.starts_at or now()>=r.phase_ends_at then raise exception 'game_not_live'; end if;
 if not public.line_connect_paths_valid(m.line_connect_state,p_paths) then raise exception 'invalid_paths'; end if;
 elapsed:=greatest(1,floor(extract(epoch from (clock_timestamp()-m.starts_at))*1000)::int);
 perform set_config('app.validated_line_entry',m.id::text,true);
 insert into public.minigame_entries(minigame_id,player_id,reaction_ms) values(m.id,p.id,elapsed) on conflict do nothing;
 perform set_config('app.validated_line_entry','',true);
 perform public._resolve_minigame(m.id);
 return true;
end $$;

revoke all on function public._resolve_minigame(uuid) from public,anon,authenticated;
