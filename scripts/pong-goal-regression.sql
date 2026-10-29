do $test$
declare
 u uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); g uuid:=gen_random_uuid(); s jsonb;
begin
 begin
  insert into auth.users(id) values(u);
  insert into public.rooms(id,code,host_user_id,phase) values(r,public.gen_room_code(),u,'minigame');
  insert into public.players(id,room_id,user_id,nickname,team_side,is_host) values(p,r,u,'Goal regression','A',true);
  perform set_config('request.jwt.claim.sub',u::text,true);
  insert into public.room_minigames(id,room_id,kind,status,starts_at,pong_state)
   values(g,r,'pong','live',clock_timestamp()-interval '1 second',jsonb_build_object(
    'x',1.01,'y',0.2,'vx',0.46,'vy',0,'ay',0.8,'by',0.8,'scoreA',0,'scoreB',0,
    'tick',clock_timestamp()-interval '100 milliseconds','a1',p,'a2',p,'modeA','solo'));
  s:=public.pong_tick(g);
  if (s->>'scoreA')::int<>1 or (s->>'x')::numeric<>0.5 or (s->>'y')::numeric<>0.5 then raise exception 'right goal did not reset at centre'; end if;
  if abs((s->>'vx')::numeric+0.46*1.08)>0.00001 then raise exception 'first goal serve speed incorrect'; end if;
  perform pg_sleep(0.03);
  s:=public.pong_tick(g);
  if (s->>'x')::numeric<>0.5 or (s->>'y')::numeric<>0.5 or (s->>'scoreA')::int<>1 then raise exception 'serve pause moved ball or repeated goal'; end if;
  update public.room_minigames set pong_state=pong_state||jsonb_build_object('serveAt',clock_timestamp()-interval '1 second') where id=g;
  perform pg_sleep(0.02);
  s:=public.pong_tick(g);
  if (s->>'x')::numeric>=0.5 then raise exception 'serve did not resume'; end if;
  update public.room_minigames set pong_state=pong_state||jsonb_build_object('x',-0.01,'y',0.2,'vx',-0.5,'vy',0,'tick',clock_timestamp()-interval '100 milliseconds') where id=g;
  s:=public.pong_tick(g);
  if (s->>'scoreB')::int<>1 or (s->>'x')::numeric<>0.5 or (s->>'y')::numeric<>0.5 then raise exception 'left goal did not reset at centre'; end if;
  if abs((s->>'vx')::numeric-0.46*1.16)>0.00001 or abs((s->>'vy')::numeric-0.23*1.16)>0.00001 then raise exception 'second goal serve speed incorrect'; end if;
  raise exception using errcode='PZ001',message='rollback goal fixtures';
 exception when sqlstate 'PZ001' then null;
 end;
end $test$;
