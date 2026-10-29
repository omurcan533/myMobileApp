-- All fixtures are rolled back by the caught subtransaction exception.
-- A failed assertion propagates and aborts the surrounding migration.
do $test$
declare
 test_user uuid:=gen_random_uuid(); test_room uuid:=gen_random_uuid();
 test_player uuid:=gen_random_uuid(); test_game uuid:=gen_random_uuid();
 s jsonb; pressed_at timestamptz; released_y numeric; expected_y numeric;
begin
 begin
  insert into auth.users(id) values(test_user);
  insert into public.rooms(id,code,host_user_id,phase) values(test_room,public.gen_room_code(),test_user,'minigame');
  insert into public.players(id,room_id,user_id,nickname,team_side,is_host)
   values(test_player,test_room,test_user,'Pong regression','A',true);
  perform set_config('request.jwt.claim.sub',test_user::text,true);
  insert into public.room_minigames(id,room_id,kind,status,starts_at,pong_state)
   values(test_game,test_room,'pong','live',clock_timestamp()-interval '1 second',
    jsonb_build_object('x',0.5,'y',0.5,'vx',0.46,'vy',0.23,'ay',0.5,'by',0.5,
     'scoreA',0,'scoreB',0,'tick',clock_timestamp(),'a1',test_player,'a2',test_player,'modeA','solo'));
  perform public.pong_set_held(test_game,1,true);
  select pong_state into s from public.room_minigames where id=test_game;
  pressed_at:=(s->>'holdADownAt')::timestamptz;
  if abs((s->>'ay')::numeric-0.5)>0.00001 then raise exception 'press applied retroactively'; end if;
  perform pg_sleep(0.04);
  perform public.pong_set_held(test_game,1,false);
  select pong_state into s from public.room_minigames where id=test_game;
  released_y:=(s->>'ay')::numeric;
  expected_y:=0.5+0.9*extract(epoch from (s->>'tick')::timestamptz-pressed_at);
  if released_y<=0.52 or abs(released_y-expected_y)>0.002 then raise exception 'short tap lost or miscounted: % expected %',released_y,expected_y; end if;
  perform pg_sleep(0.04);
  s:=public.pong_tick(test_game);
  if abs((s->>'ay')::numeric-released_y)>0.00001 then raise exception 'paddle moved after release'; end if;
  -- Reversing direction is a separate interval, with no retroactive movement.
  perform public.pong_set_held(test_game,-1,true);
  perform pg_sleep(0.025);
  perform public.pong_set_held(test_game,-1,false);
  select pong_state into s from public.room_minigames where id=test_game;
  if (s->>'ay')::numeric>=released_y then raise exception 'reverse tap did not move up'; end if;
  released_y:=(s->>'ay')::numeric;
  perform pg_sleep(0.02);
  s:=public.pong_tick(test_game);
  if abs((s->>'ay')::numeric-released_y)>0.00001 then raise exception 'reverse tap drifted after release'; end if;
  -- Authorization must still reject an outsider before touching physics.
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
   perform public.pong_set_held(test_game,1,true);
   raise exception 'outsider control was accepted';
  exception when raise_exception then
   if sqlerrm<>'not_in_game' then raise; end if;
  end;
  raise exception using errcode='PZ001',message='rollback successful Pong test fixtures';
 exception when sqlstate 'PZ001' then null;
 end;
end $test$;
