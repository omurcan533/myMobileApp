-- Centre serve lasts 600 ms; each total goal adds 8% of the initial serve speed.
CREATE OR REPLACE FUNCTION public.pong_tick(p_minigame uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare m room_minigames; r rooms; s jsonb; x numeric; y numeric; vx numeric; vy numeric; py numeric; a integer; b integer; dt numeric; dy_a numeric; dy_b numeric; tick_at timestamptz; player_host boolean; old_x numeric; old_y numeric; old_ay numeric; old_by numeric; hit_t numeric; hit_y numeric; hit_paddle numeric; tick_now timestamptz; ball_dt numeric;
begin
 select * into m from room_minigames where id=p_minigame for update;
 tick_now:=clock_timestamp();
 if not found or m.kind<>'pong' or m.status<>'live' or m.starts_at is null then return null; end if;
 select * into r from rooms where id=m.room_id;
 if r.paused then return m.pong_state; end if;
 select exists(select 1 from players where room_id=m.room_id and user_id=auth.uid()) into player_host;
 if not player_host then raise exception 'not_in_room'; end if;
 s:=m.pong_state; if s is null then return null; end if;
 tick_at:=coalesce((s->>'tick')::timestamptz,tick_now);
 dt:=least(0.28,greatest(0,extract(epoch from tick_now-greatest(tick_at,m.starts_at))));
 if tick_now<m.starts_at or dt<=0 then return s; end if;
 dy_a := (case when coalesce((s->>'holdAUp')::boolean,false) and coalesce((s->>'holdAUpAt')::timestamptz,tick_now-interval '10 seconds')>tick_now-interval '2.5 seconds' then -1 else 0 end)
       + (case when coalesce((s->>'holdADown')::boolean,false) and coalesce((s->>'holdADownAt')::timestamptz,tick_now-interval '10 seconds')>tick_now-interval '2.5 seconds' then 1 else 0 end);
 dy_b := (case when coalesce((s->>'holdBUp')::boolean,false) and coalesce((s->>'holdBUpAt')::timestamptz,tick_now-interval '10 seconds')>tick_now-interval '2.5 seconds' then -1 else 0 end)
       + (case when coalesce((s->>'holdBDown')::boolean,false) and coalesce((s->>'holdBDownAt')::timestamptz,tick_now-interval '10 seconds')>tick_now-interval '2.5 seconds' then 1 else 0 end);
 old_ay:=coalesce((s->>'ay')::numeric,0.5);
 old_by:=coalesce((s->>'by')::numeric,0.5);
 s:=s||jsonb_build_object('ay',greatest(0.105,least(0.895,coalesce((s->>'ay')::numeric,0.5)+dy_a*dt*0.9)),
                           'by',greatest(0.105,least(0.895,coalesce((s->>'by')::numeric,0.5)+dy_b*dt*0.9)));
 -- Paddles keep moving during the brief centre serve; only ball time is held.
 ball_dt:=least(dt,greatest(0,extract(epoch from tick_now-coalesce((s->>'serveAt')::timestamptz,tick_at))));
 old_ay:=greatest(0.105,least(0.895,old_ay+dy_a*(dt-ball_dt)*0.9));
 old_by:=greatest(0.105,least(0.895,old_by+dy_b*(dt-ball_dt)*0.9));
 dt:=ball_dt;
 x:=(s->>'x')::numeric; y:=(s->>'y')::numeric; vx:=(s->>'vx')::numeric; vy:=(s->>'vy')::numeric;
 old_x:=x; old_y:=y;
 a:=(s->>'scoreA')::integer; b:=(s->>'scoreB')::integer;
 x:=x+vx*dt; y:=y+vy*dt;
 if y<0.025 then y:=0.025; vy:=abs(vy); end if;
 if y>0.975 then y:=0.975; vy:=-abs(vy); end if;
 -- Sweep the ball across the full tick. A fast ball may already be behind
 -- the paddle at the end of a 100-280ms tick: test the instant it crossed.
 if old_x>0.065 and vx<0 and x<=0.065 then
   hit_t:=(0.065-old_x)/vx;
   hit_y:=old_y+(s->>'vy')::numeric*hit_t;
   if hit_y<0.025 then hit_y:=0.05-hit_y; end if;
   if hit_y>0.975 then hit_y:=1.95-hit_y; end if;
   hit_paddle:=greatest(0.105,least(0.895,old_ay+dy_a*hit_t*0.9));
   if abs(hit_y-hit_paddle)<=0.125 then
     x:=0.065+abs(vx)*1.045*(dt-hit_t);
     vx:=abs(vx)*1.045;
     vy:=vy+(hit_y-hit_paddle)*0.3;
     y:=hit_y+vy*(dt-hit_t);
     if s->>'controllerA' is not null then s:=jsonb_set(s,'{lastTouchA}',to_jsonb(s->>'controllerA')); end if;
     s:=jsonb_set(s,'{savesA}',to_jsonb(coalesce((s->>'savesA')::integer,0)+1));
   end if;
 elsif x<=0.065 and vx<0 and abs(y-(s->>'ay')::numeric)<=0.125 then
   x:=0.065; vx:=abs(vx)*1.045;
   vy:=vy+(y-(s->>'ay')::numeric)*0.3;
   if s->>'controllerA' is not null then s:=jsonb_set(s,'{lastTouchA}',to_jsonb(s->>'controllerA')); end if;
   s:=jsonb_set(s,'{savesA}',to_jsonb(coalesce((s->>'savesA')::integer,0)+1));
 end if;
 if old_x<0.935 and (s->>'vx')::numeric>0 and x>=0.935 then
   hit_t:=(0.935-old_x)/(s->>'vx')::numeric;
   hit_y:=old_y+(s->>'vy')::numeric*hit_t;
   if hit_y<0.025 then hit_y:=0.05-hit_y; end if;
   if hit_y>0.975 then hit_y:=1.95-hit_y; end if;
   hit_paddle:=greatest(0.105,least(0.895,old_by+dy_b*hit_t*0.9));
   if abs(hit_y-hit_paddle)<=0.125 then
     x:=0.935-abs(vx)*1.045*(dt-hit_t);
     vx:=-abs(vx)*1.045;
     vy:=vy+(hit_y-hit_paddle)*0.3;
     y:=hit_y+vy*(dt-hit_t);
     if s->>'controllerB' is not null then s:=jsonb_set(s,'{lastTouchB}',to_jsonb(s->>'controllerB')); end if;
     s:=jsonb_set(s,'{savesB}',to_jsonb(coalesce((s->>'savesB')::integer,0)+1));
   end if;
 elsif x>=0.935 and vx>0 and abs(y-(s->>'by')::numeric)<=0.125 then
   x:=0.935; vx:=-abs(vx)*1.045;
   vy:=vy+(y-(s->>'by')::numeric)*0.3;
   if s->>'controllerB' is not null then s:=jsonb_set(s,'{lastTouchB}',to_jsonb(s->>'controllerB')); end if;
   s:=jsonb_set(s,'{savesB}',to_jsonb(coalesce((s->>'savesB')::integer,0)+1));
 end if;
 if y<0.025 then y:=0.025; vy:=abs(vy); end if;
 if y>0.975 then y:=0.975; vy:=-abs(vy); end if;
 if x<0 then b:=b+1; if nullif(s->>'lastTouchB','') is not null then s:=jsonb_set(s,array['goalsByPlayer',s->>'lastTouchB'],to_jsonb(coalesce((s#>>array['goalsByPlayer',s->>'lastTouchB'])::int,0)+1),true); end if; x:=0.5;y:=0.5;vx:=0.46*(1+0.08*(a+b));vy:=0.23*(1+0.08*(a+b)); s:=jsonb_set(s,'{serveAt}',to_jsonb(tick_now+interval '600 milliseconds'),true); end if;
 if x>1 then a:=a+1; if nullif(s->>'lastTouchA','') is not null then s:=jsonb_set(s,array['goalsByPlayer',s->>'lastTouchA'],to_jsonb(coalesce((s#>>array['goalsByPlayer',s->>'lastTouchA'])::int,0)+1),true); end if; x:=0.5;y:=0.5;vx:=-0.46*(1+0.08*(a+b));vy:=-0.23*(1+0.08*(a+b)); s:=jsonb_set(s,'{serveAt}',to_jsonb(tick_now+interval '600 milliseconds'),true); end if;
 s:=s||jsonb_build_object('x',x,'y',y,'vx',vx,'vy',vy,'scoreA',a,'scoreB',b,'tick',tick_now);
 update room_minigames set pong_state=s where id=p_minigame;
 if a>=5 or b>=5 then
   update room_minigames set status='done',winner_side=(case when a>=5 then 'A' else 'B' end)::team_side,resolved_at=tick_now where id=p_minigame;
   insert into team_pieces(room_id,side,piece_id,source)
   select m.room_id,(case when a>=5 then 'A' else 'B' end)::team_side,id,'minigame' from pieces order by random() limit 1;
   update room_teams set score=score+2 where room_id=m.room_id and room_teams.side=(case when a>=5 then 'A' else 'B' end)::team_side;
 end if;
 return s;
end $function$
;
