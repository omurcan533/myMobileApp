-- Extend the shared synthetic fixture for localization tests. No production data.
alter table rooms add column closed_at timestamptz;
alter table questions add column kind question_kind,add column tier question_tier,add column prompt text,add column answer text,add column accepted_answers text[] default '{}',add column hints text[] default '{}',add column active boolean default true;
alter table pieces add column tier question_tier;
update pieces set tier='base';insert into pieces(tier) values('body'),('roof');
create table song_questions(id bigint generated always as identity,artist text,title text,genre text);
create table song_game_secrets(minigame_id uuid,answer text);
create table survivor_secrets(minigame_id uuid,greens int[],white_row int,white_col int);
create function _scramble(w text) returns text language sql as $$ select reverse(w) $$;
create function _open_round(p_round uuid) returns void language sql as $$update room_rounds set status='open',opens_at=now(),closes_at=now()+interval '60 seconds' where id=p_round$$;
create function next_selected_minigame_kind(p_room uuid) returns minigame_kind language sql as $$select g::minigame_kind from unnest((select selected_games from rooms where id=p_room)) g where g not in ('anagram','riddle') limit 1$$;
create function _close_idle_rooms() returns void language sql as $$select$$;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.list_open_rooms()
 RETURNS TABLE(code text, mode text, phase text, player_count integer, host_nickname text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform public._close_idle_rooms();
 return query select r.code,r.mode::text,r.phase::text,
  (select count(*)::int from public.players p where p.room_id=r.id),coalesce(hp.nickname,'Oyuncu'),r.created_at
 from public.rooms r left join public.players hp on hp.room_id=r.id and hp.is_host
 where r.closed_at is null and r.phase<>'results' and r.created_at>now()-interval '6 hours'
 and exists(select 1 from public.players p where p.room_id=r.id) order by r.created_at desc;
end $function$
;
CREATE OR REPLACE FUNCTION public._is_correct(p_question uuid, p_body text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select norm_answer(p_body) = norm_answer(q.answer)
      or exists (select 1 from unnest(q.accepted_answers) a where norm_answer(a) = norm_answer(p_body))
  from questions q where q.id = p_question
$function$
;
CREATE OR REPLACE FUNCTION public.norm_answer(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
           translate(
             lower(replace(replace(coalesce(t, ''), 'İ', 'i'), 'I', 'ı')),
             'ıçğöşüâîû', 'icgosuaiu'),
           '[^a-z0-9]', '', 'g')
$function$
;
CREATE OR REPLACE FUNCTION public.configure_math_questions(p_minigame uuid, p_count integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m room_minigames;
begin
 if p_count is null or p_count not in (1,3,5) then raise exception 'invalid_question_count'; end if;
 select * into m from room_minigames where id=p_minigame;
 if not found then raise exception 'minigame_not_found'; end if;
 perform 1 from rooms where id=m.room_id for update;
 select * into m from room_minigames where id=p_minigame for update;
 if not exists(select 1 from players where room_id=m.room_id and user_id=auth.uid() and is_host) then raise exception 'not_host'; end if;
 if m.kind<>'math_guess' or m.status<>'live' or m.starts_at is not null or coalesce((m.math_state->>'index')::int,1)<>1 then raise exception 'configuration_closed'; end if;
 update room_minigames set math_state=jsonb_build_object('count',p_count,'index',1,'prompts',jsonb_build_array(m.prompt)) where id=p_minigame;
end $function$
;

-- Turkish control pool: enough questions to fill an epic room without repeats.
insert into questions(kind,tier,prompt,answer,hints) select 'anagram','base','rkta','kart',array['Türkçe ipucu'] from generate_series(1,12);
insert into questions(kind,tier,prompt,answer,hints) select 'riddle',t,'Türkçe soru','ayna',array['Türkçe ipucu'] from unnest(array['body','roof']::question_tier[]) t cross join generate_series(1,12);
insert into questions(kind,prompt) values('social','Türkçe sosyal soru');
insert into song_questions(artist,title,genre) values('Tarkan','Kuzu Kuzu','pop');
