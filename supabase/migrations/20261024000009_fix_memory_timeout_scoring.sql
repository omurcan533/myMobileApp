create or replace function _resolve_minigame(p_mg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mg room_minigames; v_a numeric; v_b numeric; v_top uuid; v_win team_side; v_piece uuid;
begin
  select * into v_mg from room_minigames where id = p_mg for update;
  if not found or v_mg.status <> 'live' then return; end if;

  if v_mg.kind = 'reflex' then
    select avg(coalesce(e.reaction_ms, 30000)) filter (where p.team_side = 'A'),
           avg(coalesce(e.reaction_ms, 30000)) filter (where p.team_side = 'B')
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;
    v_win := case when v_a < v_b then 'A'::team_side when v_b < v_a then 'B'::team_side end;

  elsif v_mg.kind = 'math_guess' then
    select min(abs(e.guess_num - v_mg.target_num)) filter (where p.team_side = 'A'),
           min(abs(e.guess_num - v_mg.target_num)) filter (where p.team_side = 'B')
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;

    v_win := case
      when v_a is not null and (v_b is null or v_a < v_b) then 'A'::team_side
      when v_b is not null and (v_a is null or v_b < v_a) then 'B'::team_side
      else null
    end;

  else
    select target_player_id into v_top
      from minigame_entries
     where minigame_id = p_mg and target_player_id is not null
     group by target_player_id
     order by count(*) desc, target_player_id
     limit 1;

    select coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'A'), 0)::numeric
             / nullif(count(*) filter (where p.team_side = 'A'), 0),
           coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'B'), 0)::numeric
             / nullif(count(*) filter (where p.team_side = 'B'), 0)
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;
    v_win := case when v_a > v_b then 'A'::team_side when v_b > v_a then 'B'::team_side end;
  end if;

  if v_win is not null then
    select id into v_piece from pieces order by random() limit 1;
    insert into team_pieces (room_id, side, piece_id, source) values (v_mg.room_id, v_win, v_piece, 'minigame');
    update room_teams set score = score + 2 where room_id = v_mg.room_id and side = v_win;
  end if;

  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now() where id = p_mg;
end $$;
