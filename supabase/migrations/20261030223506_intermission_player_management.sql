-- Edit membership only while the room is between timed rounds.
create or replace function public._room_player_management_allowed(p_room uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce((select r.closed_at is null and case
  when r.phase='lobby' then true
  when r.phase='question' then
   case when exists(select 1 from public.room_rounds q where q.room_id=r.id and q.status='open')
    then exists(select 1 from public.room_rounds q where q.room_id=r.id and q.status='open' and q.opens_at is null)
    else exists(select 1 from public.room_rounds q where q.room_id=r.id and q.status='resolved') end
  when r.phase='minigame' then (select m.status='done' or (m.status='live' and m.starts_at is null)
   from public.room_minigames m where m.room_id=r.id order by m.created_at desc,m.id desc limit 1)
  else false end from public.rooms r where r.id=p_room),false);
$$;
revoke all on function public._room_player_management_allowed(uuid) from public,anon,authenticated;

create or replace function public.remove_room_player(p_room uuid,p_player uuid,p_confirm_close boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 r public.rooms; target public.players; remaining int; replacement uuid;
 m public.room_minigames; s jsonb; slot text; other_slot text; prefix text; side_name text;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 -- Same room-first lock order as starting/advancing a round and leaving a room.
 select * into r from public.rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if r.host_user_id is distinct from auth.uid() or not exists(
  select 1 from public.players where room_id=p_room and user_id=auth.uid() and is_host
 ) then raise exception 'not_host'; end if;
 if r.closed_at is not null then return jsonb_build_object('room_closed',true,'removed',false); end if;
 if not public._room_player_management_allowed(p_room) then raise exception 'player_management_closed'; end if;
 select * into target from public.players where id=p_player and room_id=p_room for update;
 if not found then return jsonb_build_object('room_closed',false,'removed',false); end if;
 if target.is_host or target.user_id=auth.uid() then raise exception 'cannot_kick_host'; end if;
 if target.is_bot then raise exception 'cannot_kick_bot'; end if;
 if r.phase<>'lobby' and target.team_side is not null then
  select count(*) into remaining from public.players where room_id=p_room and team_side=target.team_side and id<>target.id;
  if remaining=0 then
   if not coalesce(p_confirm_close,false) then raise exception 'team_would_be_empty'; end if;
   -- Close access for everyone, retaining the final team's membership/history.
   update public.rooms set closed_at=clock_timestamp() where id=p_room;
   return jsonb_build_object('room_closed',true,'removed',false);
  end if;
 end if;

 delete from public.players where id=target.id and room_id=p_room;
 if target.team_side is not null then
  select id into replacement from public.players where room_id=p_room and team_side=target.team_side order by joined_at,id limit 1;
  if target.is_captain then update public.players set is_captain=true where id=replacement; end if;
  if target.is_architect then
   update public.players set is_architect=true where id=replacement;
   update public.rooms set building_ready_a=case when target.team_side='A' then false else building_ready_a end,
    building_ready_b=case when target.team_side='B' then false else building_ready_b end where id=p_room;
  end if;

  -- Pending Pong controls and accepted rematches must not point to a kicked player.
  select * into m from public.room_minigames where room_id=p_room order by created_at desc,id desc limit 1 for update;
  if m.kind='pong' and (m.status='done' or (m.status='live' and m.starts_at is null)) then
   s:=coalesce(m.pong_state,'{}'::jsonb);side_name:=target.team_side::text;prefix:=lower(side_name);
   select count(*) into remaining from public.players where room_id=p_room and team_side=target.team_side;
   foreach slot in array array[prefix||'1',prefix||'2','rematch_'||prefix||'1','rematch_'||prefix||'2'] loop
    if s->>slot=target.id::text then
     other_slot:=left(slot,length(slot)-1)||case when right(slot,1)='1' then '2' else '1' end;
     select id into replacement from public.players where room_id=p_room and team_side=target.team_side
      order by (id::text is distinct from s->>other_slot) desc,joined_at,id limit 1;
     s:=jsonb_set(s,array[slot],to_jsonb(replacement::text),true);
    end if;
   end loop;
   if remaining=1 or s->>('mode'||side_name)='solo' then
    select id into replacement from public.players where room_id=p_room and team_side=target.team_side
     order by (id::text=s->>(prefix||'1')) desc,joined_at,id limit 1;
    s:=jsonb_set(s,array[prefix||'1'],to_jsonb(replacement::text),true);
    s:=jsonb_set(s,array[prefix||'2'],to_jsonb(replacement::text),true);
    s:=jsonb_set(s,array['mode'||side_name],to_jsonb('solo'::text),true);
    if s ? ('rematch_'||prefix||'1') or s ? ('rematch_'||prefix||'2') then
     s:=jsonb_set(s,array['rematch_'||prefix||'1'],to_jsonb(replacement::text),true);
     s:=jsonb_set(s,array['rematch_'||prefix||'2'],to_jsonb(replacement::text),true);
    end if;
   end if;
   s:=jsonb_set(s,'{modeVotes}',coalesce(s->'modeVotes','{}'::jsonb)-target.id::text,true);
   update public.room_minigames set pong_state=s where id=m.id;
  end if;
 end if;
 return jsonb_build_object('room_closed',false,'removed',true);
end $$;
revoke all on function public.remove_room_player(uuid,uuid,boolean) from public,anon;
grant execute on function public.remove_room_player(uuid,uuid,boolean) to authenticated;
