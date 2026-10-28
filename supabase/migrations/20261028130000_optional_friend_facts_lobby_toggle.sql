
alter table public.rooms
  add column if not exists friend_facts_enabled boolean not null default false;

create or replace function public.set_room_friend_facts_enabled(p_room uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $function$
declare v_host uuid;
begin
  select host_user_id into v_host from public.rooms where id = p_room and phase = 'lobby' for update;
  if not found then raise exception 'game_in_progress'; end if;
  if v_host is distinct from auth.uid() then raise exception 'not_host'; end if;
  update public.rooms set friend_facts_enabled = coalesce(p_enabled, false) where id = p_room;
  if not coalesce(p_enabled, false) then
    delete from public.friend_facts where room_id = p_room;
    delete from public.friend_guesses where minigame_id in (select id from public.room_minigames where room_id = p_room);
  end if;
end
$function$;
revoke all on function public.set_room_friend_facts_enabled(uuid, boolean) from public;
grant execute on function public.set_room_friend_facts_enabled(uuid, boolean) to authenticated;

create or replace function public.save_friend_facts(p_room uuid, p_facts jsonb)
returns void language plpgsql security definer set search_path = public
as $function$
declare p uuid; k text; v text;
begin
  select id into p from public.players where room_id=p_room and user_id=auth.uid();
  if p is null then raise exception 'not_in_room'; end if;
  if not exists(select 1 from public.rooms where id=p_room and phase='lobby') then raise exception 'game_in_progress'; end if;
  if not exists(select 1 from public.rooms where id=p_room and friend_facts_enabled) then raise exception 'friend_facts_disabled'; end if;
  if jsonb_typeof(p_facts)<>'object' then raise exception 'invalid_answer'; end if;
  for k,v in select key,value #>> '{}' from jsonb_each(p_facts) loop
    if k not in ('zodiac','siblings','shoe','team','school','age') or length(trim(v)) not between 1 and 60 then raise exception 'invalid_answer'; end if;
    insert into public.friend_facts(room_id,player_id,question_key,answer) values(p_room,p,k,trim(v))
    on conflict(room_id,player_id,question_key) do update set answer=excluded.answer;
  end loop;
end
$function$;

create or replace function public.friend_quiz_question(p_minigame uuid)
returns jsonb language plpgsql security definer set search_path = public
as $function$
declare m public.room_minigames; me uuid; target uuid; k text; existing public.friend_guesses; n integer;
begin
  select * into m from public.room_minigames where id=p_minigame;
  if not found then return null; end if;
  if not exists(select 1 from public.rooms where id=m.room_id and friend_facts_enabled) then return null; end if;
  select id into me from public.players where room_id=m.room_id and user_id=auth.uid();
  if me is null then raise exception 'not_in_room'; end if;
  select * into existing from public.friend_guesses where minigame_id=p_minigame and player_id=me;
  n := abs(hashtext(p_minigame::text || me::text));
  select f.player_id,f.question_key into target,k from public.friend_facts f
  where f.room_id=m.room_id and f.player_id<>me and f.question_key<>'age'
  order by md5(p_minigame::text||me::text||f.player_id::text||f.question_key) limit 1;
  if target is null then return null; end if;
  return jsonb_build_object('target_id',target,'question_key',k,'answered',existing.player_id is not null,'correct',case when existing.player_id is not null then existing.correct else null end);
end
$function$;

create or replace function public.submit_friend_guess(p_minigame uuid, p_guess text)
returns boolean language plpgsql security definer set search_path = public
as $function$
declare m public.room_minigames; me uuid; target uuid; k text; expected text; ok boolean;
begin
  select * into m from public.room_minigames where id=p_minigame for update;
  if not found or m.status<>'live' or m.starts_at is null or now()<m.starts_at then raise exception 'game_not_live'; end if;
  if not exists(select 1 from public.rooms where id=m.room_id and phase='minigame' and not paused and phase_ends_at>now()) then raise exception 'game_not_live'; end if;
  if not exists(select 1 from public.rooms where id=m.room_id and friend_facts_enabled) then raise exception 'friend_facts_disabled'; end if;
  select id into me from public.players where room_id=m.room_id and user_id=auth.uid();
  if me is null then raise exception 'not_in_room'; end if;
  select f.player_id,f.question_key,f.answer into target,k,expected from public.friend_facts f
  where f.room_id=m.room_id and f.player_id<>me and f.question_key<>'age'
  order by md5(p_minigame::text||me::text||f.player_id::text||f.question_key) limit 1;
  if target is null then raise exception 'no_questions'; end if;
  if length(trim(coalesce(p_guess,''))) not between 1 and 60 then raise exception 'invalid_answer'; end if;
  ok := lower(regexp_replace(translate(trim(p_guess),'İIıŞşĞğÜüÖöÇç','iiissgguuoocc'),'[^a-z0-9]','','g')) = lower(regexp_replace(translate(trim(expected),'İIıŞşĞğÜüÖöÇç','iiissgguuoocc'),'[^a-z0-9]','','g'));
  insert into public.friend_guesses(minigame_id,player_id,target_id,question_key,guess,correct) values(p_minigame,me,target,k,trim(p_guess),ok);
  if ok then update public.room_teams set score=score+1 where room_id=m.room_id and side=(select team_side from public.players where id=me); end if;
  return ok;
exception when unique_violation then raise exception 'already_answered';
end
$function$;

create or replace function public.assign_teams(p_room uuid)
returns void language plpgsql security definer set search_path = public
as $function$
declare v_host uuid; v_players uuid[]; v_cnt int; v_mid int; i int; v_facts_enabled boolean;
begin
  select host_user_id, friend_facts_enabled into v_host, v_facts_enabled from public.rooms where id = p_room and phase = 'lobby';
  if not found then raise exception 'game_in_progress'; end if;
  if v_host <> auth.uid() then raise exception 'not_host'; end if;
  select count(*) into v_cnt from public.players where room_id = p_room;
  if v_cnt < 2 then raise exception 'need_two_players'; end if;
  if coalesce(v_facts_enabled, false) and exists (
    select 1 from public.players p where p.room_id = p_room
      and (select count(distinct f.question_key) from public.friend_facts f
           where f.room_id = p_room and f.player_id = p.id
             and f.question_key in ('zodiac','siblings','shoe','team','school','age')) < 6
  ) then raise exception 'friend_facts_incomplete'; end if;
  select array_agg(id order by random()) into v_players from public.players where room_id = p_room;
  v_mid := ceil(v_cnt::numeric / 2);
  for i in 1..v_cnt loop
    update public.players set team_side = case when i <= v_mid then 'A'::team_side else 'B'::team_side end,
      is_captain = false, is_architect = false where id = v_players[i];
  end loop;
  perform _init_captain_duel(p_room);
  update public.rooms set phase = 'team_reveal', phase_started_at = now() where id = p_room;
end
$function$;
