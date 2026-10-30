do $test$
declare
 users uuid[]; ids uuid[]; u uuid; p uuid; r uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); i int;
 board jsonb:='{"version":2,"level":1,"pairs":[[[100,100],[900,100]],[[100,250],[900,250]],[[100,400],[900,400]],[[100,550],[900,550]],[[100,700],[900,700]],[[100,850],[900,850]]]}'::jsonb;
begin
 for i in 1..7 loop
  u:=gen_random_uuid(); p:=gen_random_uuid(); users:=array_append(users,u); ids:=array_append(ids,p);
  insert into auth.users(id) values(u);
 end loop;
 insert into rooms(id,code,host_user_id,phase,phase_started_at) values(r,gen_room_code(),users[1],'minigame',now()-interval '10 seconds');
 for i in 1..7 loop
  insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain)
  values(ids[i],r,users[i],'Fixture '||i,case when i<=4 then 'A'::team_side else 'B'::team_side end,i=1,i in (1,5));
 end loop;
 insert into room_teams(room_id,side) values(r,'A'),(r,'B');
 insert into room_minigames(id,room_id,kind,status,line_connect_state) values(g,r,'line_connect','live',board);
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 perform confirm_briefing(r);
 if (select phase_ends_at from rooms where id=r)<>(select starts_at+interval '30 seconds' from room_minigames where id=g) then raise exception 'duration not 30 seconds'; end if;
 update room_minigames set starts_at=now()-interval '10 seconds' where id=g;
 update rooms set phase_ends_at=now()+interval '20 seconds' where id=r;
 perform submit_line_connect(g,board->'pairs');
 perform submit_line_connect(g,board->'pairs');
 if (select count(*) from minigame_entries where minigame_id=g)<>1 then raise exception 'duplicate finish'; end if;
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'first finisher stopped everyone'; end if;
 for i in 2..6 loop
  perform set_config('request.jwt.claim.sub',users[i]::text,true);
  perform submit_line_connect(g,board->'pairs');
 end loop;
 -- Deterministic fixture timings: player 5 is fastest, not the last submitter.
 update minigame_entries set reaction_ms=case when player_id=ids[5] then 5000 else 10000 end where minigame_id=g;
 perform _resolve_minigame(g);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'ended with one unfinished'; end if;
 update rooms set paused=true,paused_at=now() where id=r;
 perform set_config('request.jwt.claim.sub',users[7]::text,true);
 begin
  perform submit_line_connect(g,board->'pairs'); raise exception 'paused submission accepted';
 exception when raise_exception then if sqlerrm<>'game_not_live' then raise; end if; end;
 perform _resolve_minigame(g);
 if (select status from room_minigames where id=g)<>'live' then raise exception 'resolved while paused'; end if;
 update rooms set paused=false,paused_at=null where id=r;
 perform submit_line_connect(g,board->'pairs');
 if (select status from room_minigames where id=g)<>'done' then raise exception 'all finishers waited for timeout'; end if;
 if (select winner_side from room_minigames where id=g)<>'B' then raise exception 'fastest team wrong'; end if;
 if (select line_connect_state->>'winner_player_id' from room_minigames where id=g)<>ids[5]::text then raise exception 'named winner wrong'; end if;
 perform submit_line_connect(g,board->'pairs');
 perform _resolve_minigame(g);
 if (select score from room_teams where room_id=r and side='B')<>2 then raise exception 'duplicate points'; end if;
 if (select count(*) from team_pieces where room_id=r)<>1 then raise exception 'duplicate bonus'; end if;

 -- Deadline with only one finisher: still resolves and names that player.
 g:=gen_random_uuid();
 insert into room_minigames(id,room_id,kind,status,starts_at,line_connect_state,created_at) values(g,r,'line_connect','live',now()-interval '10 seconds',board,clock_timestamp());
 update rooms set phase_ends_at=now()+interval '20 seconds' where id=r;
 perform submit_line_connect(g,board->'pairs');
 update rooms set phase_ends_at=now()-interval '1 second' where id=r;
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'done' or (select line_connect_state->>'winner_player_id' from room_minigames where id=g)<>ids[7]::text then raise exception 'timeout winner wrong'; end if;

 -- No finisher: no winner and no additional award.
 g:=gen_random_uuid();
 insert into room_minigames(id,room_id,kind,status,starts_at,line_connect_state,created_at) values(g,r,'line_connect','live',now()-interval '31 seconds',board,clock_timestamp());
 perform advance_game(r);
 if (select status from room_minigames where id=g)<>'done' or (select winner_side from room_minigames where id=g) is not null then raise exception 'empty result wrong'; end if;
 if (select count(*) from team_pieces where room_id=r)<>2 then raise exception 'no-finisher award'; end if;
end $test$;
