-- 20261024000012_captain_dice_duel.sql
-- Takım kaptanlarını oyuncuların bizzat butonla zar atarak belirlediği interaktif 2 zar düellosu
-- Büyük zar ekranı, canlı izleme, eşitlikte sadece berabere kalanların tekrar zar atması

-- 1. Odalara interaktif zar düellosu durumu kolonu ekle
alter table public.rooms add column if not exists captain_duel jsonb;

-- 2. Zar düellosunu başlatan fonksiyon
create or replace function _init_captain_duel(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_pids_a uuid[];
  v_pids_b uuid[];
  v_duel jsonb;
begin
  -- Kaptan ve mimarları sıfırla
  update players
     set is_captain = false,
         is_architect = false
   where room_id = p_room;

  select array_agg(id order by joined_at, id) into v_pids_a
    from players
   where room_id = p_room and team_side = 'A';

  select array_agg(id order by joined_at, id) into v_pids_b
    from players
   where room_id = p_room and team_side = 'B';

  if v_pids_a is not null and array_length(v_pids_a, 1) > 0 then
    v_duel := jsonb_build_object(
      'active_side', 'A',
      'round', 1,
      'tied_player_ids', to_jsonb(v_pids_a),
      'turn_player_id', v_pids_a[1],
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  elsif v_pids_b is not null and array_length(v_pids_b, 1) > 0 then
    v_duel := jsonb_build_object(
      'active_side', 'B',
      'round', 1,
      'tied_player_ids', to_jsonb(v_pids_b),
      'turn_player_id', v_pids_b[1],
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  else
    v_duel := jsonb_build_object(
      'active_side', 'done',
      'round', 1,
      'tied_player_ids', '[]'::jsonb,
      'turn_player_id', null,
      'current_roll', null,
      'rolls', '[]'::jsonb,
      'captains', '{}'::jsonb
    );
  end if;

  update rooms set captain_duel = v_duel where id = p_room;
  return v_duel;
end $$;

-- 3. Oyuncunun sırası geldiğinde 2 zar atmasını sağlayan RPC fonksiyonu
create or replace function roll_captain_dice(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players%rowtype;
  v_room rooms%rowtype;
  v_duel jsonb;
  v_turn_pid uuid;
  v_active_side team_side;
  v_round int;
  v_d1 int;
  v_d2 int;
  v_total int;
  v_roll_obj jsonb;
  v_tied_pids uuid[];
  v_remaining uuid[];
  v_max_total int;
  v_top_pids uuid[];
  v_winner uuid;
  v_pids_b uuid[];
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_authenticated'; end if;

  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.phase <> 'team_reveal' then raise exception 'game_in_progress'; end if;

  v_duel := v_room.captain_duel;
  if v_duel is null or (v_duel->>'active_side') = 'done' then
    raise exception 'duel_finished';
  end if;

  v_turn_pid := (v_duel->>'turn_player_id')::uuid;
  if v_turn_pid is null then
    raise exception 'duel_finished';
  end if;

  -- Sadece sırası gelen oyuncu veya oda kurucusu (AFK desteği) zar atabilir
  if v_turn_pid <> v_me.id and not v_me.is_host then
    raise exception 'not_your_turn';
  end if;

  v_active_side := (v_duel->>'active_side')::team_side;
  v_round := coalesce((v_duel->>'round')::int, 1);

  -- 2 adet 1-6 arası zar at
  v_d1 := floor(random() * 6 + 1)::int;
  v_d2 := floor(random() * 6 + 1)::int;
  v_total := v_d1 + v_d2;

  v_roll_obj := jsonb_build_object(
    'round', v_round,
    'player_id', v_turn_pid,
    'd1', v_d1,
    'd2', v_d2,
    'total', v_total,
    'rolled_at', now()
  );

  -- Mevcut zarı ve geçmişi kaydet
  v_duel := jsonb_set(v_duel, '{current_roll}', v_roll_obj);
  v_duel := jsonb_set(v_duel, '{rolls}', coalesce(v_duel->'rolls', '[]'::jsonb) || v_roll_obj);

  -- Bu turda henüz zar atmamış katılımcıları bul
  select array_agg(elem::text::uuid) into v_tied_pids
    from jsonb_array_elements_text(v_duel->'tied_player_ids') as elem;

  select array_agg(pid order by array_position(v_tied_pids, pid))
    into v_remaining
    from unnest(v_tied_pids) as pid
   where not exists (
     select 1 from jsonb_array_elements(v_duel->'rolls') as r
      where (r->>'round')::int = v_round
        and (r->>'player_id')::uuid = pid
   );

  if v_remaining is not null and array_length(v_remaining, 1) > 0 then
    -- Tur henüz bitmedi, sıradaki oyuncuya devret
    v_duel := jsonb_set(v_duel, '{turn_player_id}', to_jsonb(v_remaining[1]::text));
  else
    -- Bu turdaki herkes zar attı! En yüksek skoru hesapla
    select max((r->>'total')::int)
      into v_max_total
      from jsonb_array_elements(v_duel->'rolls') as r
     where (r->>'round')::int = v_round
       and ((r->>'player_id')::uuid = any(v_tied_pids));

    -- En yüksek skoru atan oyuncuları belirle
    select array_agg((r->>'player_id')::uuid order by array_position(v_tied_pids, (r->>'player_id')::uuid))
      into v_top_pids
      from jsonb_array_elements(v_duel->'rolls') as r
     where (r->>'round')::int = v_round
       and ((r->>'player_id')::uuid = any(v_tied_pids))
       and (r->>'total')::int = v_max_total;

    if array_length(v_top_pids, 1) = 1 then
      -- TEK BİR LİDER KAZANDI!
      v_winner := v_top_pids[1];
      update players set is_captain = true where id = v_winner;

      -- Takımdan bir diğer oyuncuyu mimar yap
      update players
         set is_architect = true
       where id = (
         select id from players
          where room_id = p_room and team_side = v_active_side and id <> v_winner
          order by joined_at, id
          limit 1
       );

      v_duel := jsonb_set(v_duel, array['captains', v_active_side::text], to_jsonb(v_winner::text));

      -- Takım A bittiyse Takım B'ye geç, değilse tamamla
      if v_active_side = 'A' then
        select array_agg(id order by joined_at, id) into v_pids_b
          from players
         where room_id = p_room and team_side = 'B';

        if v_pids_b is not null and array_length(v_pids_b, 1) > 0 then
          v_duel := jsonb_set(v_duel, '{active_side}', '"B"');
          v_duel := jsonb_set(v_duel, '{round}', '1');
          v_duel := jsonb_set(v_duel, '{tied_player_ids}', to_jsonb(v_pids_b));
          v_duel := jsonb_set(v_duel, '{turn_player_id}', to_jsonb(v_pids_b[1]::text));
        else
          v_duel := jsonb_set(v_duel, '{active_side}', '"done"');
          v_duel := jsonb_set(v_duel, '{turn_player_id}', 'null');
        end if;
      else
        v_duel := jsonb_set(v_duel, '{active_side}', '"done"');
        v_duel := jsonb_set(v_duel, '{turn_player_id}', 'null');
      end if;
    else
      -- EŞİTLİK! Sadece en yüksek atanlar arasında tekrar zar atılır
      v_round := v_round + 1;
      v_duel := jsonb_set(v_duel, '{round}', to_jsonb(v_round));
      v_duel := jsonb_set(v_duel, '{tied_player_ids}', to_jsonb(v_top_pids));
      v_duel := jsonb_set(v_duel, '{turn_player_id}', to_jsonb(v_top_pids[1]::text));
    end if;
  end if;

  update rooms set captain_duel = v_duel where id = p_room;
  return v_duel;
end $$;

-- 4. assign_teams fonksiyonu: Takımları dağıtıp interaktif zar düellosunu başlatır
create or replace function assign_teams(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_players uuid[];
  v_cnt int;
  v_mid int;
  i int;
begin
  select host_user_id into v_host from rooms where id = p_room;
  if v_host <> auth.uid() then raise exception 'not_host'; end if;

  select count(*) into v_cnt from players where room_id = p_room;
  if v_cnt < 2 then raise exception 'need_two_players'; end if;

  select array_agg(id order by random()) into v_players from players where room_id = p_room;
  v_mid := ceil(v_cnt::numeric / 2);

  for i in 1..v_cnt loop
    update players
       set team_side = case when i <= v_mid then 'A'::team_side else 'B'::team_side end,
           is_captain = false,
           is_architect = false
     where id = v_players[i];
  end loop;

  -- İnteraktif zar düellosunu başlat
  perform _init_captain_duel(p_room);

  update rooms
     set phase = 'team_reveal',
         phase_started_at = now()
   where id = p_room;
end $$;

-- 5. shuffle_teams fonksiyonu: Takımları yeniden karıştırıp yeni zar düellosu başlatır
create or replace function shuffle_teams(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_host uuid;
  v_cnt int;
  v_mid int;
  v_players uuid[];
  i int;
begin
  select host_user_id into v_host from rooms where id = p_room;
  if v_host <> auth.uid() then raise exception 'not_host'; end if;

  select count(*) into v_cnt from players where room_id = p_room;
  if v_cnt < 2 then raise exception 'need_two_players'; end if;

  select array_agg(id order by random()) into v_players from players where room_id = p_room;
  v_mid := ceil(v_cnt::numeric / 2);

  for i in 1..v_cnt loop
    update players
       set team_side = case when i <= v_mid then 'A'::team_side else 'B'::team_side end,
           is_captain = false,
           is_architect = false
     where id = v_players[i];
  end loop;

  -- Yeniden zar düellosu başlat
  perform _init_captain_duel(p_room);

  update rooms
     set phase_started_at = now()
   where id = p_room;
end $$;

-- 6. start_game fonksiyonu: Sadece her iki kaptan da zar düellosuyla seçildikten sonra oyunu başlatır
create or replace function start_game(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms%rowtype;
  v_plan record;
  v_idx int := 0;
  v_first uuid;
  v_unassigned int;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> auth.uid() then raise exception 'not_host'; end if;
  if v_room.phase <> 'team_reveal' then raise exception 'game_in_progress'; end if;

  select count(*) into v_unassigned from players where room_id = p_room and team_side is null;
  if v_unassigned > 0 then
    raise exception 'teams_not_assigned';
  end if;

  -- Kaptanlık zar düellosu tamamlanmadan oyun başlatılamaz
  if v_room.captain_duel is not null and (v_room.captain_duel->>'active_side') <> 'done' then
    raise exception 'captain_duel_in_progress';
  end if;

  insert into room_teams (room_id, side, jokers_left)
  values (p_room, 'A', v_room.jokers_per_team), (p_room, 'B', v_room.jokers_per_team)
  on conflict (room_id, side) do update set jokers_left = excluded.jokers_left;

  for v_plan in
    select * from (values
      ('base'::question_tier, case v_room.mode::text when 'quick' then 4 when 'standard' then 6 else 8 end),
      ('body'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 5 else 7 end),
      ('roof'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 3 else 5 end)
    ) as t(tier, cnt)
  loop
    insert into room_rounds (room_id, idx, tier, kind, question_id, prompt, hints, piece_id)
    select p_room, v_idx + q.rn::int, v_plan.tier, q.kind, q.id, q.prompt, q.hints,
           (select pc.id from pieces pc where pc.tier = v_plan.tier and q.id is not null order by random() limit 1)
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

  update rooms
     set phase = 'question',
         phase_started_at = now(),
         building_ready_a = false,
         building_ready_b = false
    where id = p_room;

  select id into v_first from room_rounds where room_id = p_room and idx = 0;
  perform _open_round(v_first);
end $$;

grant execute on function roll_captain_dice(uuid) to authenticated;
