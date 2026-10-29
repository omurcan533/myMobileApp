-- Exercise real RPCs. All generated fixtures and rewards are rolled back.
do $test$
declare
 host_id uuid:=gen_random_uuid(); guest_id uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); g1 uuid; g2 uuid; n integer;
 p uuid:=gen_random_uuid(); new_game room_minigames; board survivor_secrets;
begin
 begin
  insert into auth.users(id) values(host_id),(guest_id);
  insert into rooms(id,code,host_user_id,phase,phase_started_at)
   values(r,gen_room_code(),host_id,'minigame',now()-interval '10 seconds');
  insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain,is_architect) values
   (p,r,host_id,'Replay host','A',true,true,true),
   (gen_random_uuid(),r,guest_id,'Replay guest','B',false,true,true);
  insert into room_teams(room_id,side,score) values(r,'A',4),(r,'B',0);
  insert into room_minigames(id,room_id,kind,status,winner_side,resolved_at,created_at,survivor_state)
   values(g,r,'survivor_memory','done','A',now()-interval '10 seconds',clock_timestamp()-interval '1 second',
    '{"A":{"row":7,"attempt":12},"B":{"row":3}}');
  insert into survivor_secrets values(g,array[0,0,0,0,0,0,0],0,1);
  perform set_config('request.jwt.claim.sub','',true);
  begin
   perform survivor_replay(g); raise exception 'anonymous replay allowed';
  exception when raise_exception then if sqlerrm<>'not_authenticated' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',guest_id::text,true);
  begin
   perform survivor_replay(g); raise exception 'guest replay allowed';
  exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',host_id::text,true);
  update rooms set paused=true where id=r;
  begin
   perform survivor_replay(g); raise exception 'paused replay allowed';
  exception when raise_exception then if sqlerrm<>'game_paused' then raise; end if; end;
  update rooms set paused=false where id=r;
  g1:=survivor_replay(g);
  if survivor_replay(g)<>g1 then raise exception 'duplicate request created another replay'; end if;
  if (select count(*) from room_minigames where rematch_of=g)<>1 then raise exception 'duplicate rounds'; end if;
  select * into new_game from room_minigames where id=g1;
  if new_game.status<>'live' or new_game.starts_at is not null or new_game.winner_side is not null or new_game.resolved_at is not null
    or new_game.survivor_state<>'{"A":{"row":0,"retry":false,"failed":false},"B":{"row":0,"retry":false,"failed":false}}'::jsonb
    then raise exception 'replay was not reset'; end if;
  if (select score from room_teams where room_id=r and side='A')<>4 then raise exception 'replay changed earned score'; end if;
  if exists(select 1 from minigame_entries where minigame_id=g1) then raise exception 'old answers copied'; end if;
  select * into board from survivor_secrets where minigame_id=g1;
  if array_length(board.greens,1)<>7 or board.greens=array[0,0,0,0,0,0,0] or exists(select 1 from unnest(board.greens) c where c<0 or c>4)
    or board.white_col=board.greens[board.white_row+1] then raise exception 'invalid fresh board'; end if;
  begin
   perform survivor_replay(g1); raise exception 'live round replay allowed';
  exception when raise_exception then if sqlerrm<>'round_not_finished' then raise; end if; end;
  update rooms set phase_started_at=now()-interval '10 seconds' where id=r;
  perform confirm_briefing(r);
  if (select starts_at from room_minigames where id=g1)<=now()+interval '8 seconds' then raise exception 'preview countdown missing'; end if;
  if survivor_preview(g1) is null then raise exception 'preview unavailable'; end if;
  update room_minigames set status='done',resolved_at=now() where id=g1;
  g2:=survivor_replay(g1);
  begin
   perform survivor_replay(g); raise exception 'stale replay allowed';
  exception when raise_exception then if sqlerrm<>'game_moved_on' then raise; end if; end;
  select * into board from survivor_secrets where minigame_id=g2;
  update room_minigames set starts_at=now()-interval '1 second' where id=g2;
  update rooms set phase_ends_at=now()+interval '60 seconds' where id=r;
  for n in 1..7 loop perform survivor_choose(g2,board.greens[n]); end loop;
  if (select status from room_minigames where id=g2)<>'done' or (select winner_side from room_minigames where id=g2)<>'A'
    or (select score from room_teams where room_id=r and side='A')<>6 then raise exception 'replay cannot be completed or scored'; end if;
  if (select (survivor_state->'B'->>'row')::int from room_minigames where id=g2)<>0 then raise exception 'opponent progress leaked'; end if;
  update rooms set phase='building' where id=r;
  begin
   perform survivor_replay(g2); raise exception 'replay after advancing allowed';
  exception when raise_exception then if sqlerrm<>'game_moved_on' then raise; end if; end;
  if has_function_privilege('anon','public.survivor_replay(uuid)','execute') then raise exception 'anonymous execute granted'; end if;
  if not has_function_privilege('authenticated','public.survivor_replay(uuid)','execute') then raise exception 'RPC unavailable'; end if;
  raise exception using errcode='PZ001',message='rollback successful survivor fixtures';
 exception when sqlstate 'PZ001' then null;
 end;
end $test$;
select 'Survivor replay regression passed; fixtures rolled back' as result;
