create or replace function shuffle_teams(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_count int;
  v_flip boolean := random() < 0.5;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase::text <> 'team_reveal' then raise exception 'teams_not_assigned'; end if;

  select count(*) into v_count from players where room_id = p_room;
  if v_count < 2 then raise exception 'need_two_players'; end if;

  update players
     set is_captain = false,
         is_architect = false
   where room_id = p_room;

  with ranked as (
    select id, row_number() over (order by random()) as rn
      from players
     where room_id = p_room
  )
  update players p
     set team_side = case when ((ranked.rn % 2) = 1) = v_flip then 'A'::team_side else 'B'::team_side end
    from ranked
   where p.id = ranked.id;

  with ordered as (
    select id,
           row_number() over (partition by team_side order by joined_at, id) as rn,
           count(*) over (partition by team_side) as cnt
      from players
     where room_id = p_room
  )
  update players p
     set is_captain = (ordered.rn = 1),
         is_architect = (ordered.rn = ordered.cnt)
    from ordered
   where p.id = ordered.id;

  update rooms
     set phase_started_at = now(),
         phase_ends_at = null
   where id = p_room;
end $$;

revoke execute on function public.shuffle_teams(uuid) from public, anon;
grant execute on function public.shuffle_teams(uuid) to authenticated;
