-- Real RPC tests. Every fixture is rolled back, including generated users.
do $test$
declare
 u uuid:=gen_random_uuid(); mate uuid:=gen_random_uuid(); enemy uuid:=gen_random_uuid();
 r uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); p3 uuid:=gen_random_uuid();
 g uuid; current_game room_minigames; next_game room_minigames; n int; i int; correct int; count_games int;
begin
 begin
  insert into auth.users(id) values(u),(mate),(enemy);
  insert into rooms(id,code,host_user_id,phase,phase_started_at) values(r,gen_room_code(),u,'minigame',now()-interval '10 seconds');
  insert into players(id,room_id,user_id,nickname,team_side,is_host,is_captain,is_architect) values
   (p,r,u,'Captain','A',true,true,false),(p2,r,mate,'Teammate','A',false,false,true),(p3,r,enemy,'Opponent','B',false,true,true);
  insert into room_teams(room_id,side) values(r,'A'),(r,'B');
  foreach n in array array[1,3,5] loop
   g:=gen_random_uuid();
   insert into room_minigames(id,room_id,kind,prompt,status,created_at) values(g,r,'math_guess','125 × 8 = ?','live',clock_timestamp());
   insert into private_minigame_answers(minigame_id,answer) values(g,1000);
   perform set_config('request.jwt.claim.sub',mate::text,true);
   begin
    perform configure_math_questions(g,n);
    raise exception 'non-host changed question count';
   exception when raise_exception then if sqlerrm<>'not_host' then raise; end if; end;
   perform set_config('request.jwt.claim.sub',u::text,true);
   begin
    perform configure_math_questions(g,2);
    raise exception 'invalid count accepted';
   exception when raise_exception then if sqlerrm<>'invalid_question_count' then raise; end if; end;
   perform configure_math_questions(g,n);
   for i in 1..n loop
    select * into current_game from room_minigames where id=g;
    if (current_game.math_state->>'index')::int<>i or (current_game.math_state->>'count')::int<>n then raise exception 'series index/count mismatch'; end if;
    if (select count(distinct value) from jsonb_array_elements_text(current_game.math_state->'prompts'))<>i then raise exception 'repeated math question'; end if;
    update rooms set phase='minigame',phase_started_at=now()-interval '10 seconds',phase_ends_at=null where id=r;
    perform confirm_briefing(r);
    select answer into correct from private_minigame_answers where minigame_id=g;
    if correct is null then raise exception 'missing private answer'; end if;
    if (select target_num is not null from room_minigames where id=g) then raise exception 'answer leaked before resolution'; end if;
    perform submit_minigame_entry(g,null,correct);
    perform _resolve_minigame(g);
    if (select target_num<>correct or winner_side<>'A' from room_minigames where id=g) then raise exception 'answer/scoring incorrect'; end if;
    update room_minigames set resolved_at=now()-interval '7 seconds' where id=g;
    if i<n then
     perform advance_game(r);
     select * into next_game from room_minigames where room_id=r order by created_at desc limit 1;
     if next_game.id=g or next_game.kind<>'math_guess' or next_game.starts_at is not null then raise exception 'next question not prepared'; end if;
     g:=next_game.id;
    elsif _start_math_followup(g) then raise exception 'extra question created beyond chosen count';
    end if;
   end loop;
  end loop;
  -- Social prompts prefer an unseen question in the same room.
  update rooms set selected_games=array['social_guess'] where id=r;
  perform _start_minigame(r);
  select * into current_game from room_minigames where room_id=r and kind='social_guess' limit 1;
  update room_minigames set status='done' where id=current_game.id;
  perform _start_minigame(r);
  select * into next_game from room_minigames where room_id=r and kind='social_guess' and id<>current_game.id limit 1;
  if current_game.prompt=next_game.prompt then raise exception 'social prompt repeated before pool exhausted'; end if;
  -- Captain may select self or teammate, never an opponent; teammates cannot override.
  update rooms set phase='building',building_ready_a=true where id=r;
  perform vote_architect(r,p);
  if not(select is_architect from players where id=p) or (select is_architect from players where id=p2) then raise exception 'captain self-selection failed'; end if;
  if (select building_ready_a from rooms where id=r) then raise exception 'ready flag not reset on architect change'; end if;
  perform vote_architect(r,p2);
  if not(select is_architect from players where id=p2) then raise exception 'teammate architect selection failed'; end if;
  begin
   perform vote_architect(r,p3);
   raise exception 'opponent selected';
  exception when raise_exception then if sqlerrm<>'invalid_candidate' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',mate::text,true);
  begin
   perform vote_architect(r,p);
   raise exception 'non-captain changed architect';
  exception when raise_exception then if sqlerrm<>'not_captain' then raise; end if; end;
  if has_function_privilege('authenticated','public._start_math_followup(uuid)','execute') then raise exception 'internal helper exposed'; end if;
  raise exception using errcode='PZ001',message='rollback successful gameplay fixtures';
 exception when sqlstate 'PZ001' then null;
 end;
end $test$;
