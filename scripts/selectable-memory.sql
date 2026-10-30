do $test$
declare
 u uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); g uuid; again uuid;
begin
 insert into auth.users(id) values(u),(u2);
 insert into rooms(id,code,host_user_id,mode,phase,phase_started_at) values(r,gen_room_code(),u,'custom','lobby',now()-interval '10 seconds');
 insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain) values(p,r,u,'Memory fixture A','A',true,true),(p2,r,u2,'Memory fixture B','B',false,true);
 insert into room_teams(room_id,side) values(r,'A'),(r,'B');
 perform set_config('request.jwt.claim.sub',u2::text,true);
 begin
  perform set_room_games(r,array['memory']); raise exception 'non-host selection accepted';
 exception when raise_exception then if sqlerrm<>'custom_mode_only' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 begin
  perform set_room_games(r,array['invented_game']); raise exception 'unknown game accepted';
 exception when raise_exception then if sqlerrm<>'invalid_game_selection' then raise; end if; end;
 perform set_room_games(r,array['memory']);
 if (select selected_games from rooms where id=r)<>array['memory'] or not (select selected_games_locked from rooms where id=r) then raise exception 'memory selection not saved'; end if;
 if not has_unplayed_selected_minigame(r) or next_selected_minigame_kind(r)<>'memory' then raise exception 'memory not scheduled'; end if;
 perform _start_minigame(r);
 select id into g from room_minigames where room_id=r order by created_at desc limit 1;
 if (select kind from room_minigames where id=g)<>'memory' then raise exception 'wrong game started'; end if;
 if has_unplayed_selected_minigame(r) then raise exception 'memory counted as unplayed after start'; end if;
 update rooms set phase_started_at=now()-interval '10 seconds' where id=r;
 perform confirm_briefing(r);
 if (select phase_ends_at from rooms where id=r)<>(select starts_at+interval '32 seconds' from room_minigames where id=g) then raise exception 'memory got random reflex countdown'; end if;
 update room_minigames set starts_at=now()-interval '5 seconds' where id=g;
 perform submit_minigame_entry(g,null,null);
 perform set_config('request.jwt.claim.sub',u2::text,true);
 perform submit_minigame_entry(g,null,null);
 if (select count(*) from minigame_entries where minigame_id=g and reaction_ms is not null)<>2 then raise exception 'memory completions missing timing'; end if;
 update minigame_entries set reaction_ms=case when player_id=p then 1000 else 2000 end where minigame_id=g;
 perform advance_game(r);
 if (select winner_side from room_minigames where id=g)<>'A' or (select score from room_teams where room_id=r and side='A')<>2 then raise exception 'memory scoring wrong'; end if;
 begin
  perform replay_memory(g); raise exception 'non-host replay accepted';
 exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',u::text,true);
 again:=replay_memory(g);
 if (select kind from room_minigames where id=again)<>'memory' or (select rematch_of from room_minigames where id=again)<>g then raise exception 'replay lost memory identity'; end if;
 if replay_memory(g)<>again then raise exception 'duplicate replay'; end if;
 if (select count(*) from room_minigames where rematch_of=g)<>1 then raise exception 'multiple replays'; end if;
end $test$;
