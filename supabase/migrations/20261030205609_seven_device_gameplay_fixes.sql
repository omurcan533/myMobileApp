-- New fields are additive; old clients continue to work during deployment.
alter table public.rooms add column if not exists closed_at timestamptz;
alter table public.rooms add column if not exists solo_since timestamptz default now();
alter table public.room_rounds add column if not exists paused_ms bigint not null default 0;
alter table public.round_answers add column if not exists elapsed_ms bigint;

update public.rooms r set solo_since=case when (select count(*) from public.players p where p.room_id=r.id)>1 then null else r.created_at end;
create index if not exists rooms_solo_cleanup_idx on public.rooms(solo_since) where closed_at is null and phase='lobby';

create or replace function public._track_room_population() returns trigger
language plpgsql security definer set search_path='' as $$
declare room uuid; n int;
begin
 room:=case when tg_op='DELETE' then old.room_id else new.room_id end;
 perform 1 from public.rooms where id=room for update;
 select count(*) into n from public.players where room_id=room;
 update public.rooms set solo_since=case when n>1 then null else coalesce(solo_since,clock_timestamp()) end where id=room;
 return null;
end $$;
revoke all on function public._track_room_population() from public,anon,authenticated;
create trigger players_track_room_population after insert or delete on public.players for each row execute function public._track_room_population();

create or replace function public._close_idle_rooms() returns integer
language plpgsql security invoker set search_path='' as $$
declare n int;
begin
 -- The room lock is also held by join_room. Recheck population under that lock.
 with candidates as (
  select id from public.rooms where closed_at is null and phase='lobby'
   and solo_since<=now()-interval '10 minutes' order by id for update skip locked
 ), closed as (
  update public.rooms r set closed_at=clock_timestamp() from candidates c
  where r.id=c.id and (select count(*) from public.players p where p.room_id=r.id)<=1 returning r.id
 ) select count(*) into n from closed;
 return n;
end $$;
revoke all on function public._close_idle_rooms() from public,anon,authenticated;

create or replace function public.list_open_rooms()
returns table(code text,mode text,phase text,player_count integer,host_nickname text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform public._close_idle_rooms();
 return query select r.code,r.mode::text,r.phase::text,
  (select count(*)::int from public.players p where p.room_id=r.id),coalesce(hp.nickname,'Oyuncu'),r.created_at
 from public.rooms r left join public.players hp on hp.room_id=r.id and hp.is_host
 where r.closed_at is null and r.phase<>'results' and r.created_at>now()-interval '6 hours'
 and exists(select 1 from public.players p where p.room_id=r.id) order by r.created_at desc;
end $$;
revoke all on function public.list_open_rooms() from public;
grant execute on function public.list_open_rooms() to anon,authenticated;

create or replace function public.close_room(p_room uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 perform 1 from public.rooms where id=p_room for update;
 if not exists(select 1 from public.players where room_id=p_room and user_id=auth.uid() and is_host) then raise exception 'not_host'; end if;
 update public.rooms set closed_at=coalesce(closed_at,clock_timestamp()) where id=p_room;
end $$;
revoke all on function public.close_room(uuid) from public,anon;
grant execute on function public.close_room(uuid) to authenticated;

create or replace function public._stamp_answer_elapsed() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.room_rounds;
begin
 select * into r from public.room_rounds where id=new.round_id;
 new.elapsed_ms:=greatest(0,floor(extract(epoch from (new.created_at-r.opens_at))*1000)::bigint-r.paused_ms);
 return new;
end $$;
revoke all on function public._stamp_answer_elapsed() from public,anon,authenticated;
create trigger round_answers_stamp_elapsed before insert on public.round_answers for each row execute function public._stamp_answer_elapsed();

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
 return true;
end $$;
revoke all on function public.submit_line_connect(uuid,jsonb) from public,anon;
grant execute on function public.submit_line_connect(uuid,jsonb) to authenticated;

create or replace function public.replay_memory(p_minigame uuid) returns uuid
language plpgsql security definer set search_path='' as $$
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
 if m.kind<>'reflex' or variant<>1 or m.status<>'done' then raise exception 'round_not_finished'; end if;
 select id into latest_id from public.room_minigames where room_id=m.room_id order by created_at desc,id desc limit 1;
 select id into next_id from public.room_minigames where rematch_of=m.id order by created_at desc limit 1;
 if next_id is not null and next_id=latest_id then return next_id; end if;
 if latest_id<>m.id then raise exception 'game_moved_on'; end if;
 loop
  next_id:=gen_random_uuid();
  select sum(ascii(c))%3 into variant from regexp_split_to_table(next_id::text,'') c;
  exit when variant=1;
 end loop;
 insert into public.room_minigames(id,room_id,kind,prompt,status,starts_at,rematch_of,created_at)
 values(next_id,m.room_id,'reflex',m.prompt,'live',null,m.id,clock_timestamp());
 update public.rooms set phase_started_at=clock_timestamp(),phase_ends_at=null where id=m.room_id;
 return next_id;
end $$;
revoke all on function public.replay_memory(uuid) from public,anon;
grant execute on function public.replay_memory(uuid) to authenticated;

-- Guard legacy/general entry RPCs too: only the validated path RPC may finish a line board.
create or replace function public._validate_game_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.room_minigames; r public.rooms;
begin
 select * into m from public.room_minigames where id=new.minigame_id;
 select * into r from public.rooms where id=m.room_id;
 if r.closed_at is not null or r.paused or r.phase<>'minigame' or m.status<>'live' or r.phase_ends_at is null or now()>=r.phase_ends_at then raise exception 'game_not_live'; end if;
 if m.kind='tug_of_war' or (m.kind='line_connect' and current_setting('app.validated_line_entry',true) is distinct from m.id::text) then
  raise exception 'use_game_specific_action';
 end if;
 return new;
end $$;
revoke all on function public._validate_game_entry() from public,anon,authenticated;
create trigger minigame_entries_validate_action before insert on public.minigame_entries for each row execute function public._validate_game_entry();

CREATE OR REPLACE FUNCTION public.join_room(p_code text, p_nickname text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  if not found or v_room.closed_at is not null or (v_room.phase='lobby' and v_room.solo_since<=now()-interval '10 minutes' and (select count(*) from players where room_id=v_room.id)<=1) then raise exception 'room_not_found'; end if;

  -- Reconnection remains allowed even after the game starts.
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
$function$
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
      if (v_mg.kind in ('pong','tug_of_war','line_connect') and v_room.phase_ends_at is not null and now() >= v_room.phase_ends_at) or (v_mg.kind not in ('pong','tug_of_war','line_connect') and (now() >= v_room.phase_ends_at or (v_players > 0 and v_count >= v_players))) then
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

CREATE OR REPLACE FUNCTION public.toggle_pause(p_room uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me public.players; v_room public.rooms; v_gap interval;
begin
select * into v_me from public.players where room_id=p_room and user_id=auth.uid();
if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
select * into v_room from public.rooms where id=p_room for update;
if v_room.phase='lobby' then raise exception 'not_started'; end if;
if exists(select 1 from public.party_events where room_id=p_room and status='open') then raise exception 'party_event_active'; end if;
if not v_room.paused then
 update public.rooms set paused=true,paused_at=clock_timestamp() where id=p_room;
 return true;
end if;
v_gap:=clock_timestamp()-v_room.paused_at;
update public.rooms set paused=false,paused_at=null,phase_ends_at=phase_ends_at+v_gap where id=p_room;
update public.room_rounds set closes_at=closes_at+v_gap,paused_ms=paused_ms+floor(extract(epoch from v_gap)*1000)::bigint where room_id=p_room and status='open' and opens_at<=v_room.paused_at;
update public.room_minigames set starts_at=starts_at+v_gap
where room_id=p_room and status='live' and starts_at<=v_room.paused_at;
return false;
end $function$
;

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
        v_ends := now() + interval '150 seconds';
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

  if v_mg.kind='line_connect' and exists(select 1 from rooms where id=v_mg.room_id and (paused or phase_ends_at is null or now()<phase_ends_at)) then return; end if;

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
    -- Fastest valid individual finisher wins for their team, only at the deadline.
    select p.team_side into v_win
    from minigame_entries e join players p on p.id=e.player_id
    where e.minigame_id=p_mg and e.reaction_ms is not null
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

  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now(), target_num = case when kind='math_guess' then v_math_answer else target_num end where id = p_mg;
end $function$
;

-- Internal resolution is callable only inside privileged game RPCs.
revoke all on function public._resolve_minigame(uuid) from public,anon,authenticated;
-- Physical closure also runs when nobody has an app open; soft closure retains history.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('close-solo-lobbies','* * * * *','select public._close_idle_rooms()');
