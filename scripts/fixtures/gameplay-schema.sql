-- Minimal synthetic fixture schema. No production users, rooms, game rows or keys.
-- These baseline helpers exercise the migration against existing RPC/trigger behavior.
create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
set check_function_bodies=off;
create type team_side as enum ('A','B');
create type game_phase as enum ('lobby','team_reveal','question','minigame','building','voting','results');
create type game_mode as enum ('quick','standard','long','custom');
create type question_tier as enum ('base','body','roof');
create type question_kind as enum ('anagram','riddle','social');
create type round_status as enum ('pending','open','resolved');
create type piece_source as enum ('question','steal','joker','minigame');
create type minigame_kind as enum ('reflex','memory','math_guess','social_guess','pong','line_connect','survivor_memory','song_complete','tug_of_war');
create table minigame_entries(
  "id" uuid not null default gen_random_uuid(),
  "minigame_id" uuid not null,
  "player_id" uuid not null,
  "target_player_id" uuid,
  "reaction_ms" integer,
  "created_at" timestamp with time zone not null default now(),
  "guess_num" integer,
  primary key(id),
  unique(minigame_id,player_id)
);
create table minigame_tug_scores(
  "minigame_id" uuid not null,
  "player_id" uuid not null,
  "force_total" integer not null default 0,
  "pulls" integer not null default 0,
  "last_pull_at" timestamp with time zone,
  unique(minigame_id,player_id)
);
create table players(
  "id" uuid not null default gen_random_uuid(),
  "room_id" uuid not null,
  "user_id" uuid,
  "nickname" text not null,
  "team_side" team_side,
  "is_host" boolean not null default false,
  "is_captain" boolean not null default false,
  "is_architect" boolean not null default false,
  "locked_until" timestamp with time zone,
  "joined_at" timestamp with time zone not null default now(),
  "avatar_id" text,
  "is_bot" boolean not null default false,
  primary key(id)
);
create table room_minigames(
  "id" uuid not null default gen_random_uuid(),
  "room_id" uuid not null,
  "kind" minigame_kind not null,
  "prompt" text,
  "status" text not null default 'pending'::text,
  "starts_at" timestamp with time zone,
  "winner_side" team_side,
  "created_at" timestamp with time zone not null default now(),
  "resolved_at" timestamp with time zone,
  "target_num" integer,
  "pong_state" jsonb,
  "rematch_of" uuid,
  "rematch_approved_at" timestamp with time zone,
  "line_connect_state" jsonb,
  "survivor_state" jsonb,
  "math_state" jsonb,
  primary key(id)
);
create table room_rounds(
  "id" uuid not null default gen_random_uuid(),
  "room_id" uuid not null,
  "idx" integer not null,
  "tier" question_tier not null,
  "kind" question_kind not null,
  "question_id" uuid not null,
  "prompt" text not null,
  "hints" text[] not null default '{}'::text[],
  "piece_id" uuid not null,
  "status" round_status not null default 'pending'::round_status,
  "opens_at" timestamp with time zone,
  "closes_at" timestamp with time zone,
  "winner_side" team_side,
  "revealed_answer" text,
  "resolved_at" timestamp with time zone,
  "answer_mask" text,
  primary key(id)
);
create table room_teams(
  "room_id" uuid not null,
  "side" team_side not null,
  "score" integer not null default 0,
  "jokers_left" integer not null default 0,
  "creature_name" text,
  "credits" integer not null default 10,
  "creature_title" text,
  primary key(room_id,side)
);
create table rooms(
  "id" uuid not null default gen_random_uuid(),
  "code" text not null,
  "host_user_id" uuid not null,
  "mode" game_mode not null default 'quick'::game_mode,
  "phase" game_phase not null default 'lobby'::game_phase,
  "jokers_per_team" integer not null default 1,
  "paused" boolean not null default false,
  "paused_at" timestamp with time zone,
  "phase_started_at" timestamp with time zone,
  "phase_ends_at" timestamp with time zone,
  "created_at" timestamp with time zone not null default now(),
  "midpoint_done" boolean not null default false,
  "building_ready_a" boolean not null default false,
  "building_ready_b" boolean not null default false,
  "captain_rolls" jsonb,
  "captain_duel" jsonb,
  "selected_games" text[] not null default ARRAY['anagram'::text, 'riddle'::text, 'reflex'::text, 'math_guess'::text, 'social_guess'::text, 'survivor_memory'::text, 'line_connect'::text, 'pong'::text],
  "selected_games_locked" boolean not null default false,
  "friend_facts_enabled" boolean not null default false,
  primary key(id)
);
create table round_answers(
  "id" uuid not null default gen_random_uuid(),
  "round_id" uuid not null,
  "room_id" uuid not null,
  "player_id" uuid not null,
  "side" team_side not null,
  "body" text not null,
  "is_final" boolean not null default false,
  "is_correct" boolean,
  "created_at" timestamp with time zone not null default now(),
  primary key(id)
);
create table team_pieces(
  "id" uuid not null default gen_random_uuid(),
  "room_id" uuid not null,
  "side" team_side not null,
  "piece_id" uuid not null,
  "round_id" uuid,
  "source" piece_source not null,
  "created_at" timestamp with time zone not null default now(),
  primary key(id)
);
create table pieces(id uuid primary key default gen_random_uuid());insert into pieces default values;
create table questions(id uuid primary key default gen_random_uuid());insert into questions default values;
create function gen_room_code() returns text language sql as $$select substr(gen_random_uuid()::text,1,5)$$;
create table private_minigame_answers(minigame_id uuid,answer int);
create table party_events(room_id uuid,status text);
CREATE OR REPLACE FUNCTION public._guard_minigame_briefing()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from room_minigames where id = new.minigame_id;
  if v_starts_at is null or now() < v_starts_at then
    raise exception 'too_early';
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.minigame_tug_pull(p_minigame uuid, p_force integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m public.room_minigames; p public.players; r public.rooms; last_at timestamptz; at_now timestamptz:=clock_timestamp(); secs int;
begin
select * into m from public.room_minigames where id=p_minigame and kind='tug_of_war' and status='live';
if not found or m.starts_at is null then raise exception 'game_not_live'; end if;
select * into r from public.rooms where id=m.room_id;
if not found or r.paused or r.phase<>'minigame' then raise exception 'game_paused'; end if;
secs:=case when m.target_num in (30,60,90,120) then m.target_num else 60 end;
if at_now<m.starts_at or at_now>=m.starts_at+make_interval(secs=>secs) then raise exception 'time_up'; end if;
select * into p from public.players where room_id=m.room_id and user_id=auth.uid() and coalesce(is_bot,false)=false;
if not found or p.team_side is null then raise exception 'not_player'; end if;
if p_force not between -60 and 100 then raise exception 'invalid_force'; end if;
insert into public.minigame_tug_scores(minigame_id,player_id) values(p_minigame,p.id) on conflict do nothing;
select last_pull_at into last_at from public.minigame_tug_scores where minigame_id=p_minigame and player_id=p.id for update;
if last_at is not null and at_now-last_at<interval '450 milliseconds' then raise exception 'too_fast'; end if;
update public.minigame_tug_scores set force_total=force_total+p_force,pulls=pulls+1,last_pull_at=at_now where minigame_id=p_minigame and player_id=p.id;
return jsonb_build_object('accepted',true,'force',p_force);
end $function$
;
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

  if v_mg.kind = 'reflex' then
    if now() < v_mg.starts_at then raise exception 'too_early'; end if;
    v_ms := greatest(1, floor(extract(epoch from (now() - v_mg.starts_at)) * 1000)::int);
  end if;

  insert into minigame_entries (minigame_id, player_id, target_player_id, reaction_ms, guess_num)
  values (p_minigame, v_me.id, p_target, v_ms, p_guess);

  -- Never reveal a math answer before the round timer expires.
  -- The normal round-resolution path handles scoring after the deadline.

end $function$
;
CREATE OR REPLACE FUNCTION public._shift_briefings_on_resume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pause_gap interval;
begin
  if old.paused and not new.paused and old.paused_at is not null then
    v_pause_gap := now() - old.paused_at;

    update room_rounds
       set opens_at = opens_at + v_pause_gap,
           closes_at = closes_at + v_pause_gap
     where room_id = new.id
       and status = 'open'
       and opens_at is not null
       and opens_at > old.paused_at;

    update room_minigames
       set starts_at = starts_at + v_pause_gap
     where room_id = new.id
       and status = 'live'
       and starts_at is not null
       and starts_at > old.paused_at;
  end if;
  return new;
end $function$
;
CREATE OR REPLACE FUNCTION public.line_connect_paths_valid(p_board jsonb, p_paths jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
 pairs jsonb:=p_board->'pairs'; path jsonb; item jsonb;
 i integer;j integer;k integer;n integer;count_points integer;
 sx double precision;sy double precision;ex double precision;ey double precision;
 px double precision;py double precision;qx double precision;qy double precision;
 first_x double precision;first_y double precision;
 old_point point;new_point point;segment lseg;other_segment lseg;
 all_segments lseg[]:='{}'; current_segments lseg[]; other_point point;
begin
 if jsonb_typeof(pairs)<>'array' or jsonb_array_length(pairs)<>6 or jsonb_typeof(p_paths)<>'array' or jsonb_array_length(p_paths)<>6 then return false; end if;
 for i in 0..5 loop
  path:=p_paths->i;
  if jsonb_typeof(path)<>'array' then return false; end if;
  count_points:=jsonb_array_length(path);
  if count_points<2 or count_points>240 then return false; end if;
  sx:=(pairs->i->0->>0)::double precision;sy:=(pairs->i->0->>1)::double precision;
  ex:=(pairs->i->1->>0)::double precision;ey:=(pairs->i->1->>1)::double precision;
  current_segments:='{}';old_point:=null;
  for j in 0..count_points-1 loop
   item:=path->j;
   if jsonb_typeof(item)<>'array' or jsonb_array_length(item)<>2 or jsonb_typeof(item->0)<>'number' or jsonb_typeof(item->1)<>'number' then return false; end if;
   if (item->>0) !~ '^[0-9]{1,4}$' or (item->>1) !~ '^[0-9]{1,4}$' then return false; end if;
   px:=(item->>0)::double precision;py:=(item->>1)::double precision;
   if px<0 or px>1000 or py<0 or py>1000 then return false; end if;
   if j=0 then first_x:=px;first_y:=py; end if;
   new_point:=point(px,py);
   if old_point is not null then
    if new_point <-> old_point < 0.01 then return false; end if;
    segment:=lseg(old_point,new_point);
    foreach other_segment in array all_segments loop
     if segment ?# other_segment then return false; end if;
    end loop;
    for k in 1..greatest(0,coalesce(array_length(current_segments,1),0)-1) loop
     if segment ?# current_segments[k] then return false; end if;
    end loop;
    for k in 0..5 loop
     if k<>i then
      other_point:=point((pairs->k->0->>0)::double precision,(pairs->k->0->>1)::double precision);
      if other_point <-> segment < 34 then return false; end if;
      other_point:=point((pairs->k->1->>0)::double precision,(pairs->k->1->>1)::double precision);
      if other_point <-> segment < 34 then return false; end if;
     end if;
    end loop;
    current_segments:=array_append(current_segments,segment);
   end if;
   old_point:=new_point;
  end loop;
  if not (
    (sqrt((first_x-sx)^2+(first_y-sy)^2)<=38 and sqrt((px-ex)^2+(py-ey)^2)<=38)
    or (sqrt((first_x-ex)^2+(first_y-ey)^2)<=38 and sqrt((px-sx)^2+(py-sy)^2)<=38)
  ) then return false; end if;
  all_segments:=all_segments||current_segments;
 end loop;
 return true;
exception when others then return false;
end $function$
;
create trigger minigame_entries_wait_for_briefing before insert on minigame_entries for each row execute function _guard_minigame_briefing();
create trigger rooms_shift_briefings_after_pause before update of paused on rooms for each row execute function _shift_briefings_on_resume();
