-- Execute in a transaction and ROLLBACK. No fixture users, rooms or scores persist.
do $test$
declare
 users uuid[]; ids uuid[]; u uuid; p uuid; r uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); next_id uuid;
 solo uuid:=gen_random_uuid(); code text; i int; n int; variant int; before_score int;
 board jsonb:='{"version":2,"level":1,"pairs":[[[100,100],[900,100]],[[100,250],[900,250]],[[100,400],[900,400]],[[100,550],[900,550]],[[100,700],[900,700]],[[100,850],[900,850]]]}'::jsonb;
 paths jsonb; first_ms int; answer_id uuid; round_id uuid; before_start timestamptz;
begin
 for i in 1..7 loop
  u:=gen_random_uuid();p:=gen_random_uuid(); users:=array_append(users,u);ids:=array_append(ids,p);
  insert into auth.users(id) values(u);
 end loop;
 insert into rooms(id,code,host_user_id,phase,phase_started_at) values(r,gen_room_code(),users[1],'minigame',now()-interval '10 seconds');
 for i in 1..7 loop
  insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain)
  values(ids[i],r,users[i],'Fixture '||i,case when i<=4 then 'A'::team_side else 'B'::team_side end,i=1,i in (1,5));
 end loop;
 insert into room_teams(room_id,side) values(r,'A'),(r,'B');
 paths:=board->'pairs';
 insert into room_minigames(id,room_id,kind,status,starts_at,line_connect_state) values(g,r,'line_connect','live',now()-interval '10 seconds',board);
 update rooms set phase_ends_at=now()+interval '140 seconds' where id=r;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 -- Invalid paths and bypassing the path validator must not create a finisher.
 begin
  perform submit_line_connect(g,'[]'); raise exception 'invalid paths accepted';
 exception when raise_exception then if sqlerrm<>'invalid_paths' then raise; end if; end;
 begin
  perform submit_minigame_entry(g,null,null); raise exception 'unvalidated finish accepted';
 exception when raise_exception then if sqlerrm<>'use_game_specific_action' then raise; end if; end;
 perform submit_line_connect(g,paths);
 select reaction_ms into first_ms from minigame_entries where minigame_id=g and player_id=ids[1];
 perform submit_line_connect(g,paths);
 if (select count(*) from minigame_entries where minigame_id=g)<>1 then raise exception 'duplicate completion'; end if;
 if (select status from room_minigames where id=g)<>'live' then raise exception 'first finisher ended game'; end if;
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'driver ended game early'; end if;
 for i in 2..7 loop
  perform set_config('request.jwt.claim.sub',users[i]::text,true);
  perform submit_line_connect(g,paths);
 end loop;
 -- Simulate distinct server-recorded durations while preserving the real RPC validation above.
 update minigame_entries set reaction_ms=case when player_id=ids[5] then 5000 else 10000 end where minigame_id=g;
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'all finishers ended game before deadline'; end if;
 update rooms set phase_ends_at=now()-interval '1 second' where id=r;
 perform advance_game(r);
 if (select winner_side from room_minigames where id=g)<>'B' then raise exception 'fastest individual did not win'; end if;
 if (select score from room_teams where room_id=r and side='B')<>2 then raise exception 'wrong score'; end if;
 if (select count(*) from team_pieces where room_id=r)<>1 then raise exception 'wrong bonus piece count'; end if;
 perform _resolve_minigame(g);
 if (select score from room_teams where room_id=r and side='B')<>2 then raise exception 'duplicate score'; end if;

 -- Seven independent players can pull: no first-player completion entry or early finish.
 g:=gen_random_uuid();
 insert into room_minigames(id,room_id,kind,status,starts_at,target_num,created_at) values(g,r,'tug_of_war','live',now()-interval '5 seconds',60,clock_timestamp());
 update rooms set phase_ends_at=now()+interval '55 seconds' where id=r;
 for i in 1..7 loop
  perform set_config('request.jwt.claim.sub',users[i]::text,true);
  perform minigame_tug_pull(g,50);
 end loop;
 if (select count(*) from minigame_tug_scores where minigame_id=g)<>7 then raise exception 'not all seven players could pull'; end if;
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'tug ended early'; end if;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform toggle_pause(r);
 begin
  perform minigame_tug_pull(g,50); raise exception 'pull accepted while paused';
 exception when raise_exception then if sqlerrm<>'game_paused' then raise; end if; end;
 perform toggle_pause(r);

 -- Optional Pong choices must not prevent a three-player host from starting.
 delete from players where room_id=r and id=any(ids[4:7]);
 update players set team_side='B' where id=ids[3];
 update room_minigames set status='done' where room_id=r;
 g:=gen_random_uuid();
 insert into room_minigames(id,room_id,kind,status,pong_state,created_at)
 values(g,r,'pong','live',jsonb_build_object('a1',ids[1],'a2',ids[2],'b1',ids[3],'b2',ids[3],'modeA','duo','modeB','solo'),clock_timestamp());
 update rooms set phase_started_at=now()-interval '10 seconds',phase_ends_at=null where id=r;
 perform confirm_briefing(r);
 if (select starts_at from room_minigames where id=g) is null then raise exception 'missing Pong votes blocked start'; end if;

 -- Replays remain memory variants, prepare a new round, and are idempotent.
 update room_minigames set status='done' where room_id=r;
 loop
  g:=gen_random_uuid();select sum(ascii(c))%3 into variant from regexp_split_to_table(g::text,'') c;
  exit when variant=1;
 end loop;
 insert into room_minigames(id,room_id,kind,status,resolved_at,created_at) values(g,r,'reflex','done',now(),clock_timestamp());
 next_id:=replay_memory(g);
 if replay_memory(g)<>next_id then raise exception 'replay duplicated'; end if;
 select sum(ascii(c))%3 into variant from regexp_split_to_table(next_id::text,'') c;
 if variant<>1 or (select starts_at from room_minigames where id=next_id) is not null then raise exception 'wrong replay variant or skipped briefing'; end if;
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 begin
  perform replay_memory(g); raise exception 'non-host replayed';
 exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;

 -- Capture answer time at insertion, preserving the value through later pauses.
 update rooms set phase='question',phase_ends_at=now()+interval '50 seconds' where id=r;
 insert into room_rounds(room_id,idx,tier,kind,question_id,prompt,piece_id,status,opens_at,closes_at,paused_ms)
 select r,0,'base','anagram',(select id from questions limit 1),'Test',id,'open',now()-interval '12 seconds',now()+interval '50 seconds',2000 from pieces limit 1 returning id into round_id;
 insert into round_answers(round_id,room_id,player_id,side,body,is_final) values(round_id,r,ids[2],'A','Test',false) returning id into answer_id;
 if (select elapsed_ms from round_answers where id=answer_id)<>10000 then raise exception 'answer elapsed pause accounting wrong'; end if;

 -- Population transitions reset the solo timer; active games and multiplayer lobbies survive.
 insert into rooms(id,code,host_user_id,phase) values(solo,gen_room_code(),users[1],'lobby') returning rooms.code into code;
 insert into players(room_id,user_id,nickname,is_host) values(solo,users[1],'Solo',true);
 update rooms set solo_since=now()-interval '11 minutes' where id=solo;
 insert into players(room_id,user_id,nickname) values(solo,users[2],'Guest');
 if (select solo_since from rooms where id=solo) is not null then raise exception 'multiplayer lobby timer not cleared'; end if;
 perform _close_idle_rooms();
 if (select closed_at from rooms where id=solo) is not null then raise exception 'multiplayer lobby closed'; end if;
 delete from players where room_id=solo and user_id=users[2];
 if (select solo_since from rooms where id=solo)<now()-interval '1 second' then raise exception 'solo timer not reset after departure'; end if;
 update rooms set solo_since=now()-interval '11 minutes' where id=solo;
 perform _close_idle_rooms();
 if (select closed_at from rooms where id=solo) is null then raise exception 'solo room did not close'; end if;
 begin
  perform join_room(code,'Guest');raise exception 'closed room rejoined';
 exception when raise_exception then if sqlerrm<>'room_not_found' then raise; end if; end;
 if (select closed_at from rooms where id=r) is not null then raise exception 'active game was closed'; end if;
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 begin
  perform close_room(r);raise exception 'non-host closed room';
 exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform close_room(r);
 if (select closed_at from rooms where id=r) is null then raise exception 'host could not close room'; end if;
 if has_function_privilege('authenticated','public._close_idle_rooms()','execute') then raise exception 'cleanup helper publicly exposed'; end if;
 if has_function_privilege('authenticated','public._resolve_minigame(uuid)','execute') then raise exception 'resolver publicly exposed'; end if;
end $test$;
