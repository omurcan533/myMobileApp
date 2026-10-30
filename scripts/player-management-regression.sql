do $test$
declare
 r uuid:=gen_random_uuid(); other_room uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
 users uuid[]; ids uuid[]; i int; u uuid; p uuid; result jsonb; closed_at_before timestamptz;
begin
 for i in 1..6 loop
  u:=gen_random_uuid();p:=gen_random_uuid();users:=array_append(users,u);ids:=array_append(ids,p);
  insert into auth.users(id) values(u);
 end loop;
 insert into rooms(id,code,host_user_id,phase) values(r,gen_room_code(),users[1],'question'),(other_room,gen_room_code(),users[6],'lobby');
 for i in 1..5 loop
  insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain,is_architect,joined_at)
  values(ids[i],r,users[i],'Player '||i,case when i<=3 then 'A'::team_side else 'B'::team_side end,i=1,i in (2,4),i=2,now()+make_interval(secs=>i));
 end loop;
 insert into players(id,room_id,user_id,nickname,is_host) values(ids[6],other_room,users[6],'Other host',true);
 insert into room_teams(room_id,side) values(r,'A'),(r,'B');
 perform set_config('request.jwt.claim.sub',users[2]::text,true);
 begin
  perform remove_room_player(r,ids[3],false);raise exception 'non-host removed player';
 exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',users[1]::text,true);
 -- No current/resolved question means an incomplete snapshot, not a safe break.
 begin
  perform remove_room_player(r,ids[2],false);raise exception 'unknown question state allowed removal';
 exception when raise_exception then if sqlerrm<>'player_management_closed' then raise; end if; end;
 insert into room_rounds(room_id,idx,tier,kind,question_id,prompt,piece_id,status,opens_at,closes_at)
 select r,0,'base','anagram',(select id from questions limit 1),'Test',id,'open',now()-interval '1 second',now()+interval '30 seconds' from pieces limit 1;
 begin
  perform remove_room_player(r,ids[2],true);raise exception 'live question allowed removal';
 exception when raise_exception then if sqlerrm<>'player_management_closed' then raise; end if; end;
 update room_rounds set opens_at=null,closes_at=null where room_id=r;
 if not _room_player_management_allowed(r) then raise exception 'question briefing blocked'; end if;
 begin
  perform remove_room_player(r,ids[1],false);raise exception 'host was removed';
 exception when raise_exception then if sqlerrm<>'cannot_kick_host' then raise; end if; end;
 result:=remove_room_player(r,ids[6],false);
 if (result->>'removed')::boolean or not exists(select 1 from players where id=ids[6]) then raise exception 'cross-room player affected'; end if;
 -- Pong pending/rematch seats must survive captain/architect removal.
 insert into room_minigames(id,room_id,kind,status,starts_at,pong_state)
 values(g,r,'pong','live',null,jsonb_build_object('a1',ids[2],'a2',ids[3],'b1',ids[4],'b2',ids[5],
  'rematch_a1',ids[2],'rematch_a2',ids[3],'modeA','duo','modeB','duo','modeVotes',jsonb_build_object(ids[2]::text,'duo')));
 update rooms set phase='minigame',building_ready_a=true where id=r;
 result:=remove_room_player(r,ids[2],true);
 if (result->>'room_closed')::boolean or not (result->>'removed')::boolean then raise exception 'non-last removal closed room'; end if;
 if exists(select 1 from players where id=ids[2]) then raise exception 'player not removed'; end if;
 if not (select is_captain and is_architect from players where id=ids[1]) then raise exception 'roles not reassigned'; end if;
 if (select building_ready_a from rooms where id=r) then raise exception 'architect ready flag retained'; end if;
 if (select pong_state->>'a1' from room_minigames where id=g)<>ids[1]::text
  or (select pong_state->>'rematch_a1' from room_minigames where id=g)<>ids[1]::text
  or (select pong_state->>'a2' from room_minigames where id=g)<>ids[3]::text then raise exception 'Pong seats not repaired'; end if;
 if (select pong_state->'modeVotes' ? ids[2]::text from room_minigames where id=g) then raise exception 'removed mode vote retained'; end if;
 result:=remove_room_player(r,ids[2],false);
 if (result->>'removed')::boolean then raise exception 'duplicate removal not idempotent'; end if;
 -- During live minigame even explicit close permission cannot bypass the break restriction.
 update room_minigames set starts_at=now() where id=g;
 begin
  perform remove_room_player(r,ids[3],true);raise exception 'live minigame allowed removal';
 exception when raise_exception then if sqlerrm<>'player_management_closed' then raise; end if; end;
 update room_minigames set status='done' where id=g;
 result:=remove_room_player(r,ids[3],false);
 if (select pong_state->>'modeA' from room_minigames where id=g)<>'solo'
  or (select pong_state->>'a1' from room_minigames where id=g)<>ids[1]::text
  or (select pong_state->>'a2' from room_minigames where id=g)<>ids[1]::text
  or (select pong_state->>'rematch_a2' from room_minigames where id=g)<>ids[1]::text then raise exception 'one-player Pong mode not repaired'; end if;
 result:=remove_room_player(r,ids[4],false);
 if not (select is_captain from players where id=ids[5]) then raise exception 'opponent captain not reassigned'; end if;
 -- Roster has now shrunk to one opponent; the stale UI's normal confirmation must fail safely.
 begin
  perform remove_room_player(r,ids[5],false);raise exception 'last player removed without explicit close';
 exception when raise_exception then if sqlerrm<>'team_would_be_empty' then raise; end if; end;
 if (select closed_at from rooms where id=r) is not null or not exists(select 1 from players where id=ids[5]) then raise exception 'warning changed room'; end if;
 begin
  perform remove_room_player(r,ids[5],null);raise exception 'null accepted as explicit close';
 exception when raise_exception then if sqlerrm<>'team_would_be_empty' then raise; end if; end;
 result:=remove_room_player(r,ids[5],true);
 if not (result->>'room_closed')::boolean or (select closed_at from rooms where id=r) is null then raise exception 'confirmed last-player removal did not close room'; end if;
 if not exists(select 1 from players where id=ids[5]) then raise exception 'closing room destroyed final membership history'; end if;
 select closed_at into closed_at_before from rooms where id=r;
 result:=remove_room_player(r,ids[5],true);
 if (select closed_at from rooms where id=r)<>closed_at_before then raise exception 'repeated close changed timestamp'; end if;
 if not has_function_privilege('authenticated','public.remove_room_player(uuid,uuid,boolean)','execute') then raise exception 'authenticated RPC inaccessible'; end if;
 if has_function_privilege('anon','public.remove_room_player(uuid,uuid,boolean)','execute') then raise exception 'anonymous removal exposed'; end if;
 if has_function_privilege('authenticated','public._room_player_management_allowed(uuid)','execute') then raise exception 'helper exposed'; end if;
end $test$;
