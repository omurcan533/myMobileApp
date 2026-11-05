-- Private moderation records; clients use authenticated, ownership-checked gateways only.
create schema app_safety;
revoke all on schema app_safety from public,anon,authenticated;
grant usage on schema app_safety to authenticated,service_role;
create table app_safety.consents(user_id uuid primary key references auth.users on delete cascade,version text not null,accepted_at timestamptz not null default now());
create table app_safety.blocks(blocker uuid references auth.users on delete cascade,blocked uuid references auth.users on delete cascade,label text not null,created_at timestamptz not null default now(),primary key(blocker,blocked),check(blocker<>blocked));
create index on app_safety.blocks(blocked,blocker);
create table app_safety.bans(user_id uuid primary key references auth.users on delete cascade,reason text not null,created_at timestamptz not null default now());
create table app_safety.reports(id uuid primary key default gen_random_uuid(),reporter uuid references auth.users on delete set null,target_user uuid references auth.users on delete set null,room_id uuid references public.rooms on delete set null,target_player uuid,subject text not null,reason text not null,details text not null,evidence jsonb not null,status text not null default 'open',created_at timestamptz not null default now(),reviewed_at timestamptz,review_note text);
create index on app_safety.reports(status,created_at);
create index on app_safety.reports(reporter,created_at);
create table app_safety.audit(id bigint generated always as identity primary key,report_id uuid references app_safety.reports,action text not null,note text not null,created_at timestamptz not null default now());
alter table app_safety.consents enable row level security;
alter table app_safety.blocks enable row level security;
alter table app_safety.bans enable row level security;
alter table app_safety.reports enable row level security;
alter table app_safety.audit enable row level security;
revoke all on all tables in schema app_safety from public,anon,authenticated;
grant all on all tables in schema app_safety to service_role;
grant usage,select on all sequences in schema app_safety to service_role;

create function app_safety.assert_actor(p_consent boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'not_authenticated'; end if;
 if exists(select 1 from app_safety.bans where user_id=u) then raise exception 'account_restricted'; end if;
 if p_consent and not exists(select 1 from app_safety.consents where user_id=u and version='2026-11-04') then raise exception 'community_consent_required'; end if;
 return u;
end $$;
create function app_safety.conflicts(p_user uuid,p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.players p join app_safety.blocks b
 on (b.blocker=p_user and b.blocked=p.user_id) or (b.blocked=p_user and b.blocker=p.user_id)
 where p.room_id=p_room)
$$;
create function app_safety.text_allowed(p_text text) returns boolean language sql immutable set search_path='' as $$
 select not (translate(lower(coalesce(p_text,'')),'ıİşŞğĞüÜöÖçÇ','iissgguuoocc') ~ '(^|[^a-z0-9])(fuck|fucking|cunt|nigger|orospu|siktir|amk|porno|porn)([^a-z0-9]|$)')
$$;
create function app_safety.status() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception 'not_authenticated'; end if;
 return jsonb_build_object('accepted',exists(select 1 from app_safety.consents where user_id=u and version='2026-11-04'),'restricted',exists(select 1 from app_safety.bans where user_id=u),'version','2026-11-04');
end $$;
create function app_safety.accept(p_version text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_safety.assert_actor(false);
begin
 if p_version is distinct from '2026-11-04' then raise exception 'invalid_policy_version'; end if;
 insert into app_safety.consents(user_id,version) values(u,p_version) on conflict(user_id) do update set version=excluded.version,accepted_at=now();
end $$;

-- Run before player deletion so leaving during court cannot fail on NO ACTION foreign keys.
-- Existing leave/remove RPCs still handle host/captain transfer. Repair architect and paused event state here.
create function app_safety.before_player_delete() returns trigger language plpgsql security definer set search_path='' as $$
declare ids uuid[]; r public.rooms; gap interval; replacement uuid;
begin
 select * into r from public.rooms where id=old.room_id for update;
 select coalesce(array_agg(distinct event_id),'{}'::uuid[]) into ids from (
 select event_id from public.party_court_cases where old.id in(defendant_id,prosecutor_id,defender_id)
 union select id from public.party_events where target_id=old.id) x;
 delete from public.party_court_ballots where player_id=old.id;
 delete from public.party_court_speeches where player_id=old.id;
 if exists(select 1 from public.party_events where id=any(ids) and status='open')
 and r.paused and r.paused_at is not null
 and not exists(select 1 from public.party_events where room_id=r.id and status='open' and not(id=any(ids))) then
  gap:=greatest(interval '0',clock_timestamp()-r.paused_at);
  update public.rooms set paused=false,paused_at=null,phase_ends_at=phase_ends_at+gap where id=r.id;
  update public.room_rounds set closes_at=closes_at+gap,paused_ms=paused_ms+floor(extract(epoch from gap)*1000)::bigint where room_id=r.id and status='open' and opens_at<=r.paused_at;
  update public.room_minigames set starts_at=starts_at+gap where room_id=r.id and status='live' and starts_at<=r.paused_at;
 end if;
 delete from public.party_events where id=any(ids);
 return old;
end $$;
create trigger safety_player_departure before delete on public.players for each row execute function app_safety.before_player_delete();
create function app_safety.after_player_delete() returns trigger language plpgsql security definer set search_path='' as $$
declare replacement uuid;
begin
 if old.is_architect then
  select id into replacement from public.players where room_id=old.room_id and team_side=old.team_side order by joined_at,id limit 1;
  if replacement is not null then update public.players set is_architect=true where id=replacement; end if;
 end if;
 return old;
end $$;
create trigger safety_player_role after delete on public.players for each row execute function app_safety.after_player_delete();


create function app_safety.disconnect(p_user uuid,p_room uuid) returns void language plpgsql security definer set search_path='' as $$
declare old_claims text:=current_setting('request.jwt.claims',true); old_sub text:=current_setting('request.jwt.claim.sub',true); side_name public.team_side; phase_name public.game_phase; departing uuid;
begin
 perform id from public.rooms where id=p_room for update;
 select p.team_side,r.phase,p.id into side_name,phase_name,departing from public.players p join public.rooms r on r.id=p.room_id where p.room_id=p_room and p.user_id=p_user;
 -- Existing leave RPC owns host/captain transfer. Scope the subject to this private helper, then restore claims.
 perform set_config('request.jwt.claim.sub',p_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',p_user)::text,true);
 perform public.leave_room(p_room);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 if phase_name<>'lobby' and ((side_name is not null and not exists(select 1 from public.players where room_id=p_room and team_side=side_name))
 or exists(select 1 from public.rooms where id=p_room and captain_duel::text like '%'||departing::text||'%')
 or exists(select 1 from public.room_minigames where room_id=p_room and status='live' and starts_at is not null and pong_state::text like '%'||departing::text||'%')) then
  update public.rooms set closed_at=coalesce(closed_at,clock_timestamp()) where id=p_room;
 end if;
end $$;

create function app_safety.block_player(p_room uuid,p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_safety.assert_actor(false); target public.players; r record;
begin
 perform pg_advisory_xact_lock(748039110);
 perform id from public.rooms where id=p_room for update;
 if not exists(select 1 from public.players where room_id=p_room and user_id=u) then raise exception 'not_in_room'; end if;
 select * into target from public.players where room_id=p_room and id=p_player and not is_bot;
 if target.id is null or target.user_id is null or target.user_id=u then raise exception 'invalid_target'; end if;
 insert into app_safety.blocks(blocker,blocked,label) values(u,target.user_id,target.nickname) on conflict(blocker,blocked) do nothing;
 for r in select distinct a.room_id from public.players a join public.players b on a.room_id=b.room_id where a.user_id=u and b.user_id=target.user_id order by a.room_id loop
  perform app_safety.disconnect(u,r.room_id);
 end loop;
end $$;
create function app_safety.block_list() returns table(id uuid,label text) language plpgsql security definer set search_path='' as $$
declare u uuid:=app_safety.assert_actor(false);
begin return query select b.blocked,b.label from app_safety.blocks b where b.blocker=u order by b.created_at desc; end $$;
create function app_safety.unblock(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=app_safety.assert_actor(false);
begin delete from app_safety.blocks where blocker=u and blocked=p_user; end $$;

create function app_safety.report(p_room uuid,p_player uuid,p_subject text,p_reason text,p_details text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=app_safety.assert_actor(false); me public.players; target public.players; evidence jsonb; rid uuid;
begin
 -- Serialize per reporter to make report limits effective under concurrent requests.
 perform id from auth.users where id=u for update;
 select * into me from public.players where room_id=p_room and user_id=u;
 if me.id is null then raise exception 'not_in_room'; end if;
 if p_subject is null or p_subject not in('player','team_A','team_B','room') or p_reason is null or p_reason not in('harassment','hate','sexual','personal_data','other') or p_details is null or char_length(p_details)>1000 then raise exception 'invalid_report'; end if;
 if (select count(*) from app_safety.reports where reporter=u and created_at>now()-interval '24 hours')>=10 then raise exception 'report_limit'; end if;
 if p_subject='player' then
  select * into target from public.players where room_id=p_room and id=p_player and not is_bot;
  if target.id is null or target.user_id is null or target.user_id=u then raise exception 'invalid_target'; end if;
  evidence:=jsonb_build_object('nickname',target.nickname,'messages',coalesce((select jsonb_agg(to_jsonb(x)) from (select m.id,m.body from public.survivor_team_messages m join public.room_minigames g on g.id=m.minigame_id where g.room_id=p_room and m.player_id=target.id and m.side=me.team_side order by m.created_at desc limit 10)x),'[]'::jsonb),'speeches',coalesce((select jsonb_agg(to_jsonb(x)) from (select s.event_id,s.body from public.party_court_speeches s join public.party_events e on e.id=s.event_id where e.room_id=p_room and s.player_id=target.id order by e.created_at desc limit 3)x),'[]'::jsonb));
 elsif p_subject in('team_A','team_B') then
  select jsonb_build_object('side',side,'name',creature_name,'title',creature_title) into evidence from public.room_teams where room_id=p_room and side::text=right(p_subject,1);
 else
  select jsonb_build_object('events',coalesce(jsonb_agg(x),'[]'::jsonb)) into evidence from (select id,prompt,kind from public.party_events where room_id=p_room order by created_at desc limit 5)x;
 end if;
 insert into app_safety.reports(reporter,target_user,room_id,target_player,subject,reason,details,evidence) values(u,target.user_id,p_room,target.id,p_subject,p_reason,btrim(p_details),coalesce(evidence,'{}'::jsonb)) returning id into rid;
 return rid;
end $$;

-- Baseline server-side text filter. Human report review is still required; this is not comprehensive moderation.
create function app_safety.content_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d jsonb:=to_jsonb(new); old_d jsonb; k text; changed boolean:=false;
begin
 if tg_op='UPDATE' then old_d:=to_jsonb(old); end if;
 foreach k in array tg_argv loop
  if tg_op='INSERT' or d->k is distinct from old_d->k then
   changed:=true;
   if not app_safety.text_allowed(d->>k) then raise exception 'content_not_allowed'; end if;
  end if;
 end loop;
 if changed and not (coalesce(current_setting('app.safety_review',true),'')='on' and current_setting('role',true) in('service_role','none')) then perform app_safety.assert_actor(); end if;
 return new;
end $$;
create trigger safety_nickname before insert or update of nickname on public.players for each row execute function app_safety.content_guard('nickname');
create trigger safety_chat before insert or update of body on public.survivor_team_messages for each row execute function app_safety.content_guard('body');
create trigger safety_speech before insert or update of body on public.party_court_speeches for each row execute function app_safety.content_guard('body');
create trigger safety_answer before insert or update of body on public.round_answers for each row execute function app_safety.content_guard('body');
create trigger safety_fact before insert or update of answer on public.friend_facts for each row execute function app_safety.content_guard('answer');
create trigger safety_social_vote before insert or update of answer on public.party_event_votes for each row execute function app_safety.content_guard('answer');
create trigger safety_event before insert or update of prompt on public.party_events for each row execute function app_safety.content_guard('prompt');
-- Initial empty team rows contain no UGC. Only naming updates need the guard.
create trigger safety_creature before update of creature_name,creature_title on public.room_teams for each row execute function app_safety.content_guard('creature_name','creature_title');
create function app_safety.member_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is not null and app_safety.conflicts(new.user_id,new.room_id) then raise exception 'blocked_room'; end if;
 return new;
end $$;
create trigger safety_member before insert on public.players for each row execute function app_safety.member_guard();

-- Keep the original room-first game locking, but acquire the shared safety lock before entering it.
-- Editing only the preamble preserves existing reconnect, capacity and nickname checks.
do $guard$
declare fn regprocedure; definition text;
begin
 foreach fn in array array['public.create_room(text,public.game_mode)'::regprocedure,'public.join_room(text,text)'::regprocedure] loop
  definition:=pg_get_functiondef(fn);
  definition:=regexp_replace(definition,'(\mbegin\M)',E'\\1\n perform pg_advisory_xact_lock(748039110);\n perform app_safety.assert_actor();','i');
  execute definition;
 end loop;
end $guard$;
-- A reconnect must also obey blocks even if a legacy membership survived a disconnected client.
do $guard$
declare definition text;
begin
 definition:=pg_get_functiondef('public.join_room(text,text)'::regprocedure);
 definition:=replace(definition,'-- Reconnection remains allowed even after the game starts.',E'if app_safety.conflicts(v_uid,v_room.id) then raise exception ''blocked_room''; end if;\n  -- Reconnection remains allowed even after the game starts.');
 if position('app_safety.conflicts' in definition)=0 then raise exception 'join_guard_not_installed'; end if;
 execute definition;
end $guard$;
create or replace function public.list_open_rooms()
returns table(code text,mode text,phase text,player_count integer,host_nickname text,created_at timestamptz)
language plpgsql security definer set search_path='' as $$
begin
 perform app_safety.assert_actor(false);
 perform public._close_idle_rooms();
 return query select r.code,r.mode::text,r.phase::text,(select count(*)::int from public.players p where p.room_id=r.id),coalesce(hp.nickname,'Oyuncu'),r.created_at
 from public.rooms r left join public.players hp on hp.room_id=r.id and hp.is_host
 where r.closed_at is null and r.phase<>'results' and r.created_at>now()-interval '6 hours'
 and exists(select 1 from public.players p where p.room_id=r.id)
 and not app_safety.conflicts(auth.uid(),r.id) order by r.created_at desc;
end $$;

-- Public gateways are invokers. Privileged implementations remain in an unexposed schema.
create function public.community_status() returns jsonb language sql security invoker set search_path='' as $$select app_safety.status()$$;
create function public.community_accept(p_version text) returns void language sql security invoker set search_path='' as $$select app_safety.accept(p_version)$$;
create function public.safety_block(p_room uuid,p_player uuid) returns void language sql security invoker set search_path='' as $$select app_safety.block_player(p_room,p_player)$$;
create function public.safety_blocks() returns table(id uuid,label text) language sql security invoker set search_path='' as $$select * from app_safety.block_list()$$;
create function public.safety_unblock(p_user uuid) returns void language sql security invoker set search_path='' as $$select app_safety.unblock(p_user)$$;
create function public.safety_report(p_room uuid,p_player uuid,p_subject text,p_reason text,p_details text) returns uuid language sql security invoker set search_path='' as $$select app_safety.report(p_room,p_player,p_subject,p_reason,p_details)$$;
revoke all on all functions in schema app_safety from public,anon,authenticated;
grant execute on function app_safety.status(),app_safety.accept(text),app_safety.block_player(uuid,uuid),app_safety.block_list(),app_safety.unblock(uuid),app_safety.report(uuid,uuid,text,text,text) to authenticated;
revoke all on function public.community_status(),public.community_accept(text),public.safety_block(uuid,uuid),public.safety_blocks(),public.safety_unblock(uuid),public.safety_report(uuid,uuid,text,text,text),public.list_open_rooms() from public,anon;
grant execute on function public.community_status(),public.community_accept(text),public.safety_block(uuid,uuid),public.safety_blocks(),public.safety_unblock(uuid),public.safety_report(uuid,uuid,text,text,text),public.list_open_rooms() to authenticated;

-- Moderation actions are callable only from a trusted server/database operator, never from the mobile app.
create function app_safety.review(p_report uuid,p_action text,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r app_safety.reports; p record;
begin
 if p_action is null or p_action not in('dismiss','redact','restrict') or char_length(btrim(coalesce(p_note,''))) not between 1 and 1000 then raise exception 'invalid_review'; end if;
 perform pg_advisory_xact_lock(748039110);
 select * into r from app_safety.reports where id=p_report for update;
 if r.id is null or r.status<>'open' then raise exception 'report_not_open'; end if;
 if p_action='redact' then
  if r.subject='player' then
   -- Moderator replacements are constant safe text, not user-authored UGC. Disable only our guard by using the dedicated operation flag.
   perform set_config('app.safety_review','on',true);
   update public.players set nickname='Player-'||left(id::text,8) where id=r.target_player and room_id=r.room_id;
   update public.survivor_team_messages set body='[Removed]' where player_id=r.target_player and minigame_id in(select id from public.room_minigames where room_id=r.room_id);
   update public.party_court_speeches set body='[Removed]' where player_id=r.target_player and event_id in(select id from public.party_events where room_id=r.room_id);
   update public.round_answers set body='[Removed]' where player_id=r.target_player and room_id=r.room_id;
   update public.friend_facts set answer='[Removed]' where player_id=r.target_player and room_id=r.room_id;
   update public.party_event_votes set answer='[Removed]' where player_id=r.target_player and event_id in(select id from public.party_events where room_id=r.room_id);
  elsif r.subject in('team_A','team_B') then
   perform set_config('app.safety_review','on',true);
   update public.room_teams set creature_name='[Removed]',creature_title=null where room_id=r.room_id and side::text=right(r.subject,1);
  else
   perform set_config('app.safety_review','on',true);
   update public.party_events set prompt='[Removed]' where room_id=r.room_id;
  end if;
 elsif p_action='restrict' then
  if r.target_user is null then raise exception 'invalid_target'; end if;
  insert into app_safety.bans(user_id,reason) values(r.target_user,p_note) on conflict(user_id) do update set reason=excluded.reason;
  for p in select room_id from public.players where user_id=r.target_user order by room_id loop perform app_safety.disconnect(r.target_user,p.room_id); end loop;
 end if;
 perform set_config('app.safety_review','off',true);
 update app_safety.reports set status=p_action,review_note=p_note,reviewed_at=clock_timestamp() where id=p_report;
 insert into app_safety.audit(report_id,action,note) values(p_report,p_action,p_note);
end $$;
revoke all on function app_safety.review(uuid,text,text) from public,anon,authenticated;
grant execute on function app_safety.review(uuid,text,text) to service_role;

-- Deleting an account also removes identifying report copies rather than retaining hidden message/nickname backups.
create function app_safety.erase_account_evidence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update app_safety.audit set note='[Account deleted]' where report_id in(select id from app_safety.reports where reporter=old.id or target_user=old.id);
 update app_safety.reports set evidence='{}'::jsonb,details='[Account deleted]',target_player=null,review_note=null where reporter=old.id or target_user=old.id;
 return old;
end $$;
revoke all on function app_safety.erase_account_evidence() from public,anon,authenticated;
create trigger safety_account_evidence before delete on auth.users for each row execute function app_safety.erase_account_evidence();
