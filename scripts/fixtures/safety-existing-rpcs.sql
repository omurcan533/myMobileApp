CREATE OR REPLACE FUNCTION public.create_room(p_nickname text, p_mode game_mode DEFAULT 'quick'::game_mode)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid:=auth.uid();v_nick text:=btrim(p_nickname);v_room uuid;v_code text;v_tries int:=0;v_games text[];v_locked boolean;
begin
if v_uid is null then raise exception 'not_authenticated'; end if;
if char_length(v_nick) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
if p_mode::text='custom' then
v_games:=array['anagram','riddle','reflex','math_guess','social_guess','survivor_memory','line_connect','pong','tug_of_war'];
v_locked:=false;
else
select array_agg(kind order by rank) into v_games from (
select kind,random() rank from unnest(array['anagram','riddle','reflex','math_guess','social_guess','survivor_memory','line_connect','pong','tug_of_war']) kind order by rank
limit case p_mode::text when 'quick' then 3 when 'standard' then 5 else 7 end
) picks;
v_locked:=true;
end if;
loop
v_code:=public.gen_room_code();
begin
insert into public.rooms(code,host_user_id,mode,jokers_per_team,selected_games,selected_games_locked)
values(v_code,v_uid,p_mode,case p_mode::text when 'quick' then 1 when 'long' then 3 else 2 end,v_games,v_locked)
returning id into v_room;
exit;
exception when unique_violation then v_tries:=v_tries+1;if v_tries>10 then raise;end if;
end;
end loop;
insert into public.players(room_id,user_id,nickname,is_host) values(v_room,v_uid,v_nick,true);
return jsonb_build_object('room_id',v_room,'code',v_code);
end $function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.leave_room(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_room public.rooms; v_me public.players; v_next_host public.players; v_next_captain uuid;
begin
if auth.uid() is null then raise exception 'not_authenticated'; end if;
select * into v_room from public.rooms where id=p_room for update;
if not found then return; end if;
select * into v_me from public.players where room_id=p_room and user_id=auth.uid() for update;
if not found then return; end if;
delete from public.players where id=v_me.id;
if v_room.host_user_id=auth.uid() then
select * into v_next_host from public.players where room_id=p_room and user_id is not null and not is_bot order by joined_at,id limit 1;
if not found then
delete from public.rooms where id=p_room;
return;
end if;
update public.players set is_host=(id=v_next_host.id) where room_id=p_room;
update public.rooms set host_user_id=v_next_host.user_id where id=p_room;
end if;
if v_me.is_captain and v_me.team_side is not null then
select id into v_next_captain from public.players where room_id=p_room and team_side=v_me.team_side and not is_bot order by joined_at,id limit 1;
if v_next_captain is null then select id into v_next_captain from public.players where room_id=p_room and team_side=v_me.team_side order by joined_at,id limit 1; end if;
if v_next_captain is not null then update public.players set is_captain=true where id=v_next_captain; end if;
end if;
end $function$;

