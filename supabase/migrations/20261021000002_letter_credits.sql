-- =============================================================================
-- Harf kredisi sistemi
--   * Her takımın 5 kredisi var (room_teams.credits). Mini oyun kazanmak +1 kredi.
--   * Sorularda cevabın maskesi gösterilir (örn. "k _ _ _ _ z"). Bilmecelerde bazı
--     harfler bedava açık gelir; takımlar 1 kredi karşılığı rastgele bir harf alabilir.
--   * Satın alınan harfler yalnızca o takıma görünür (round_reveals + RLS).
-- =============================================================================

alter table room_teams  add column credits int not null default 5;
alter table room_rounds add column answer_mask text;

create table round_reveals (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references room_rounds(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  side       team_side not null,
  pos        int not null,                 -- cevaptaki 1 tabanlı karakter konumu
  letter     text not null,
  created_at timestamptz not null default now(),
  unique (round_id, side, pos)
);
alter table round_reveals enable row level security;
create policy reveals_read on round_reveals for select to authenticated
  using (is_member(room_id) and side = my_side(room_id));
alter publication supabase_realtime add table round_reveals;

-- Cevap maskesi: harfler '_' olur, ayraçlar (boşluk, tire...) aynen kalır.
-- Bedava açık harf: base=0, body=1+len/6, roof=1 (ilk harf her zaman açık, en az 2 harf gizli kalır).
create function _make_mask(p_answer text, p_tier question_tier) returns text
language plpgsql volatile set search_path = public as $$
declare
  v_chars text[] := regexp_split_to_array(p_answer, '');
  v_idx int[]; v_pick int[] := '{}'; v_free int; v_n int; v_out text := ''; i int;
begin
  select array_agg(g order by g) into v_idx
    from generate_subscripts(v_chars, 1) g
   where v_chars[g] ~* '[a-z0-9çğıöşüâîû]';
  v_n := coalesce(array_length(v_idx, 1), 0);

  v_free := case p_tier when 'base' then 0 when 'body' then 1 + v_n / 6 else 1 end;
  v_free := greatest(0, least(v_free, v_n - 2));

  if v_free > 0 then
    v_pick := array[v_idx[1]];
    if v_free > 1 then
      v_pick := v_pick || coalesce((
        select array_agg(x) from (
          select x from unnest(v_idx) x where x <> v_idx[1] order by random() limit v_free - 1
        ) s), '{}');
    end if;
  end if;

  for i in 1..coalesce(array_length(v_chars, 1), 0) loop
    if v_chars[i] ~* '[a-z0-9çğıöşüâîû]' and not (i = any (v_pick)) then
      v_out := v_out || '_';
    else
      v_out := v_out || v_chars[i];
    end if;
  end loop;
  return v_out;
end $$;

-- Anagram için karışık harf üretir (cevaptan farklı olmasını garanti eder).
create function _scramble(p_word text) returns text
language plpgsql volatile set search_path = public as $$
declare v_out text; v_try int := 0;
begin
  loop
    select string_agg(c, '' order by random()) into v_out
      from unnest(regexp_split_to_array(p_word, '')) c;
    v_try := v_try + 1;
    exit when v_out <> p_word or v_try > 20;
  end loop;
  return v_out;
end $$;

-- ---------- start_game: tur kurulumuna answer_mask eklendi --------------------
create or replace function start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_count int; v_flip boolean := random() < 0.5;
  v_plan record; v_idx int := 0; v_first uuid;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase <> 'lobby' then raise exception 'already_started'; end if;

  select count(*) into v_count from players where room_id = p_room;
  if v_count < 2 then raise exception 'need_two_players'; end if;

  with ranked as (
    select id, row_number() over (order by random()) as rn from players where room_id = p_room
  )
  update players p
     set team_side = case when ((ranked.rn % 2) = 1) = v_flip then 'A'::team_side else 'B'::team_side end
    from ranked where p.id = ranked.id;

  update players set is_captain = false, is_architect = false where room_id = p_room;
  with ordered as (
    select id,
           row_number() over (partition by team_side order by joined_at) as rn,
           count(*)     over (partition by team_side)                    as cnt
      from players where room_id = p_room
  )
  update players p
     set is_captain = (ordered.rn = 1), is_architect = (ordered.rn = ordered.cnt)
    from ordered where p.id = ordered.id;

  insert into room_teams (room_id, side, jokers_left)
  values (p_room, 'A', v_room.jokers_per_team), (p_room, 'B', v_room.jokers_per_team);

  for v_plan in
    select * from (values
      ('base'::question_tier, case when v_room.mode = 'quick' then 3 else 5 end),
      ('body'::question_tier, case when v_room.mode = 'quick' then 2 else 4 end),
      ('roof'::question_tier, case when v_room.mode = 'quick' then 1 else 3 end)
    ) as t(tier, cnt)
  loop
    insert into room_rounds (room_id, idx, tier, kind, question_id, prompt, hints, piece_id, answer_mask)
    select p_room, v_idx + q.rn::int, v_plan.tier, q.kind, q.id, q.prompt, q.hints,
           (select pc.id from pieces pc where pc.tier = v_plan.tier and q.id is not null
             order by random() limit 1),
           _make_mask(q.answer, v_plan.tier)
      from (
        select qq.*, row_number() over (order by random()) - 1 as rn
          from questions qq
         where qq.active
           and qq.tier = v_plan.tier
           and qq.kind = case when v_plan.tier = 'base' then 'anagram'::question_kind else 'riddle'::question_kind end
      ) q
     where q.rn < v_plan.cnt;

    select count(*) into v_idx from room_rounds where room_id = p_room;
  end loop;

  if v_idx = 0 then raise exception 'no_questions'; end if;

  update rooms set phase = 'question' where id = p_room;
  select id into v_first from room_rounds where room_id = p_room and idx = 0;
  perform _open_round(v_first);
end $$;

-- ---------- Harf satın al ------------------------------------------------------
create function buy_letter(p_round uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds; v_room rooms; v_me players; v_ans text; v_pos int; v_hidden int; v_letter text;
begin
  select * into v_round from room_rounds where id = p_round;
  if not found then raise exception 'round_not_found'; end if;
  select * into v_me from players where room_id = v_round.room_id and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;
  select * into v_room from rooms where id = v_round.room_id;

  if v_room.paused then raise exception 'game_paused'; end if;
  if v_round.status <> 'open' or now() >= v_round.closes_at then raise exception 'round_closed'; end if;
  if v_round.answer_mask is null then raise exception 'no_more_letters'; end if;

  select count(*) into v_hidden
    from generate_series(1, char_length(v_round.answer_mask)) i
   where substr(v_round.answer_mask, i, 1) = '_'
     and not exists (select 1 from round_reveals r
                      where r.round_id = p_round and r.side = v_me.team_side and r.pos = i);
  if v_hidden <= 1 then raise exception 'no_more_letters'; end if;

  update room_teams set credits = credits - 1
   where room_id = v_round.room_id and side = v_me.team_side and credits > 0;
  if not found then raise exception 'no_credits'; end if;

  select i into v_pos
    from generate_series(1, char_length(v_round.answer_mask)) i
   where substr(v_round.answer_mask, i, 1) = '_'
     and not exists (select 1 from round_reveals r
                      where r.round_id = p_round and r.side = v_me.team_side and r.pos = i)
   order by random() limit 1;

  select answer into v_ans from questions where id = v_round.question_id;
  v_letter := substr(v_ans, v_pos, 1);

  insert into round_reveals (round_id, room_id, side, pos, letter)
  values (p_round, v_round.room_id, v_me.team_side, v_pos, v_letter);

  return jsonb_build_object('pos', v_pos, 'letter', v_letter);
end $$;

-- ---------- Mini oyun kazanana +1 kredi ----------------------------------------
create or replace function _resolve_minigame(p_mg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mg room_minigames; v_a numeric; v_b numeric; v_top uuid; v_win team_side; v_piece uuid;
begin
  select * into v_mg from room_minigames where id = p_mg for update;
  if not found or v_mg.status <> 'live' then return; end if;

  if v_mg.kind = 'reflex' then
    select avg(coalesce(e.reaction_ms, 5000)) filter (where p.team_side = 'A'),
           avg(coalesce(e.reaction_ms, 5000)) filter (where p.team_side = 'B')
      into v_a, v_b
      from players p
      left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
     where p.room_id = v_mg.room_id;
    v_win := case when v_a < v_b then 'A'::team_side when v_b < v_a then 'B'::team_side end;
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
    update room_teams set score = score + 2, credits = credits + 1
     where room_id = v_mg.room_id and side = v_win;
  end if;

  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now() where id = p_mg;
end $$;

-- ---------- Yetkiler ------------------------------------------------------------
revoke execute on function _make_mask(text, question_tier), _scramble(text), buy_letter(uuid)
  from public, anon, authenticated;
grant execute on function buy_letter(uuid) to authenticated;
