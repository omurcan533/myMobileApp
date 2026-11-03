-- All deletion capability records are private; only the Edge Function's service role may access them.
create schema if not exists app_privacy;
revoke all on schema app_privacy from public, anon, authenticated;
grant usage on schema app_privacy to service_role;

create table if not exists app_privacy.deletion_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);
alter table app_privacy.deletion_tokens enable row level security;
grant select, insert, update, delete on app_privacy.deletion_tokens to service_role;

create or replace function public.account_deletion_set_token(p_user uuid, p_hash text)
returns void language sql security invoker set search_path = '' as $$
  insert into app_privacy.deletion_tokens(user_id,token_hash) values(p_user,p_hash)
  on conflict(user_id) do update set token_hash=excluded.token_hash,created_at=now();
$$;
create or replace function public.account_deletion_resolve_token(p_hash text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select user_id from app_privacy.deletion_tokens where token_hash=p_hash;
$$;
revoke all on function public.account_deletion_set_token(uuid,text) from public, anon, authenticated;
revoke all on function public.account_deletion_resolve_token(text) from public, anon, authenticated;
grant execute on function public.account_deletion_set_token(uuid,text) to service_role;
grant execute on function public.account_deletion_resolve_token(text) to service_role;

-- Remove player references from shared game snapshots without deleting another player's account/room.
-- Objects belonging to the departing player are removed; unrelated array entries and values survive.
create or replace function app_privacy.redact_player_refs(p_value jsonb,p_ids text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb; k text; v jsonb; cleaned jsonb;
begin
  if p_value is null then return null; end if;
  if jsonb_typeof(p_value)='string' then
    if (p_value #>> '{}')=any(p_ids) then return null; end if;
    return p_value;
  elsif jsonb_typeof(p_value)='array' then
    result:='[]'::jsonb;
    for v in select value from jsonb_array_elements(p_value) loop
      cleaned:=app_privacy.redact_player_refs(v,p_ids);
      if cleaned is not null then result:=result||jsonb_build_array(cleaned); end if;
    end loop;
    return result;
  elsif jsonb_typeof(p_value)='object' then
    if exists(select 1 from jsonb_each(p_value) e
      where e.key in ('id','user_id','userId','player_id','playerId','target_player_id','voter_id')
        and jsonb_typeof(e.value)='string' and (e.value #>> '{}')=any(p_ids)) then
      return null;
    end if;
    result:='{}'::jsonb;
    for k,v in select key,value from jsonb_each(p_value) loop
      if k=any(p_ids) then continue; end if;
      cleaned:=app_privacy.redact_player_refs(v,p_ids);
      if cleaned is not null then result:=result||jsonb_build_object(k,cleaned); end if;
    end loop;
    return result;
  end if;
  return p_value;
end $$;
revoke all on function app_privacy.redact_player_refs(jsonb,text[]) from public,anon,authenticated;

create or replace function app_privacy.before_account_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; refs text[]; room_ids uuid[]; event_ids uuid[];
  r record; departing record; replacement uuid; gap interval;
begin
  select coalesce(array_agg(id),'{}'::uuid[]),coalesce(array_agg(distinct room_id),'{}'::uuid[])
    into ids,room_ids from public.players where user_id=old.id;
  if cardinality(ids)=0 then return old; end if;
  select array_agg(x::text) into refs from unnest(ids||array[old.id]) x;
  -- Match game RPC lock ordering and avoid racing role reassignment in the same room.
  perform id from public.rooms where id=any(room_ids) order by id for update;

  select coalesce(array_agg(distinct event_id),'{}'::uuid[]) into event_ids from (
    select event_id from public.party_court_cases
      where defendant_id=any(ids) or prosecutor_id=any(ids) or defender_id=any(ids)
    union select id from public.party_events where target_id=any(ids)
  ) events;
  -- A departing participant must not leave another host's room permanently paused by a party event.
  for r in select distinct room.id,room.paused,room.paused_at from public.rooms room
    join public.party_events e on e.room_id=room.id
    where e.id=any(event_ids) and e.status='open' and room.host_user_id<>old.id loop
    update public.party_events set status='done' where id=any(event_ids) and room_id=r.id;
    if r.paused and r.paused_at is not null
       and not exists(select 1 from public.party_events where room_id=r.id and status='open') then
      gap:=greatest(interval '0',clock_timestamp()-r.paused_at);
      update public.rooms set paused=false,paused_at=null,phase_ends_at=phase_ends_at+gap where id=r.id;
      update public.room_rounds set closes_at=closes_at+gap,
        paused_ms=paused_ms+floor(extract(epoch from gap)*1000)::bigint
        where room_id=r.id and status='open' and opens_at<=r.paused_at;
      update public.room_minigames set starts_at=starts_at+gap
        where room_id=r.id and status='live' and starts_at<=r.paused_at;
    end if;
  end loop;
  delete from public.party_court_ballots where player_id=any(ids);
  delete from public.party_court_speeches where player_id=any(ids);
  delete from public.party_events where id=any(event_ids);
  delete from public.match_highlights where player_id=any(ids);

  -- Preserve other hosts' games when their captain/architect deletes an account.
  for departing in select p.* from public.players p join public.rooms room on room.id=p.room_id
    where p.user_id=old.id and room.host_user_id<>old.id and (p.is_captain or p.is_architect) loop
    update public.players set is_captain=false,is_architect=false where id=departing.id;
    select id into replacement from public.players
      where room_id=departing.room_id and user_id<>old.id and team_side=departing.team_side
      order by joined_at,id limit 1;
    if replacement is not null then
      update public.players set is_captain=is_captain or departing.is_captain,
        is_architect=is_architect or departing.is_architect where id=replacement;
    end if;
  end loop;
  update public.rooms set
    captain_rolls=app_privacy.redact_player_refs(captain_rolls,refs),
    captain_duel=app_privacy.redact_player_refs(captain_duel,refs)
    where id=any(room_ids) and host_user_id<>old.id;
  update public.room_minigames set
    pong_state=app_privacy.redact_player_refs(pong_state,refs),
    line_connect_state=app_privacy.redact_player_refs(line_connect_state,refs),
    survivor_state=app_privacy.redact_player_refs(survivor_state,refs),
    math_state=app_privacy.redact_player_refs(math_state,refs)
    where room_id=any(room_ids);
  update public.match_highlights set payload=coalesce(app_privacy.redact_player_refs(payload,refs),'{}'::jsonb)
    where room_id=any(room_ids);
  -- Existing FK cascades remove owned rooms, memberships, answers, messages, facts, votes and sessions.
  return old;
end $$;
revoke all on function app_privacy.before_account_delete() from public,anon,authenticated;
drop trigger if exists ucube_before_account_delete on auth.users;
create trigger ucube_before_account_delete before delete on auth.users
  for each row execute function app_privacy.before_account_delete();
