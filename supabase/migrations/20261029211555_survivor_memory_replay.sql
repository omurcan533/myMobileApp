-- Host-only replay. A separate round keeps earned rewards and clears board,
-- progress, attempts and messages without modifying the finished round.
create or replace function public.survivor_replay(p_minigame uuid)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare
 m public.room_minigames; r public.rooms; next_id uuid; latest_id uuid;
 previous_greens integer[]; greens integer[]; white_row integer; white_col integer;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 select * into m from public.room_minigames where id=p_minigame;
 if not found then raise exception 'round_closed'; end if;
 -- Same lock order as advancing the room: room, then round.
 select * into r from public.rooms where id=m.room_id for update;
 if not exists(select 1 from public.players where room_id=m.room_id and user_id=auth.uid() and is_host) then
  raise exception 'not_host';
 end if;
 if r.phase<>'minigame' then raise exception 'game_moved_on'; end if;
 if r.paused then raise exception 'game_paused'; end if;
 select * into m from public.room_minigames where id=p_minigame for update;
 if m.kind<>'survivor_memory' or m.status<>'done' then raise exception 'round_not_finished'; end if;
 select id into latest_id from public.room_minigames where room_id=m.room_id order by created_at desc,id desc limit 1;
 select id into next_id from public.room_minigames where rematch_of=m.id order by created_at desc limit 1;
 if next_id is not null and next_id=latest_id then return next_id; end if;
 if latest_id<>m.id then raise exception 'game_moved_on'; end if;
 select s.greens into previous_greens from public.survivor_secrets s where s.minigame_id=m.id;
 loop
  greens:=array(select floor(random()*5)::integer from generate_series(1,7));
  exit when greens is distinct from previous_greens;
 end loop;
 white_row:=floor(random()*7)::integer;
 white_col:=floor(random()*4)::integer;
 if white_col>=greens[white_row+1] then white_col:=white_col+1; end if;
 insert into public.room_minigames(room_id,kind,prompt,status,starts_at,rematch_of,survivor_state,created_at)
 values(m.room_id,'survivor_memory','Survivor Hafıza Parkuru','live',null,m.id,
  '{"A":{"row":0,"retry":false,"failed":false},"B":{"row":0,"retry":false,"failed":false}}'::jsonb,clock_timestamp())
 returning id into next_id;
 insert into public.survivor_secrets(minigame_id,greens,white_row,white_col)
 values(next_id,greens,white_row,white_col);
 update public.rooms set phase_started_at=clock_timestamp(),phase_ends_at=null where id=m.room_id;
 return next_id;
end $fn$;
revoke all on function public.survivor_replay(uuid) from public,anon;
grant execute on function public.survivor_replay(uuid) to authenticated;
