-- =============================================================================
-- 20261022000001_game_modes_and_building_ready.sql
--
-- ⚠️ POSTGRESQL ÖNEMLİ KURAL (Hata 55P04 Çözümü):
-- PostgreSQL, yeni enum değerlerinin (standard, math_guess) aynı transaction
-- içinde fonksiyonlarda kullanılabilmesi için önce commit edilmesini şart koşar.
--
-- ADIM 1: Sadece aşağıdaki 3 satırı seçip Run'a basın:
--   alter type game_mode add value if not exists 'standard';
--   alter type minigame_kind add value if not exists 'math_guess';
--   alter type minigame_kind add value if not exists 'memory';
--
-- ADIM 2: Ardından 2. bölümden itibaren dosyanın tamamını çalıştırın.
-- =============================================================================

-- 1. ENUM GÜNCELLEMELERİ (Önce tek başına çalıştırıp commit edin)
alter type game_mode add value if not exists 'standard';
alter type minigame_kind add value if not exists 'math_guess';
alter type minigame_kind add value if not exists 'memory';

-- 2. TABLO SÜTUNLARI
alter table rooms
  add column if not exists building_ready_a boolean not null default false,
  add column if not exists building_ready_b boolean not null default false;

alter table room_teams
  add column if not exists creature_title text default null;

alter table room_minigames
  add column if not exists target_num int default null;

alter table minigame_entries
  add column if not exists guess_num int default null;

-- 3. ODA KURMA (standard mod desteği)
create or replace function create_room(p_nickname text, p_mode game_mode default 'quick')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := btrim(p_nickname);
  v_room uuid; v_code text; v_tries int := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_nick) not between 1 and 20 then raise exception 'invalid_nickname'; end if;

  loop
    v_code := gen_room_code();
    begin
      insert into rooms (code, host_user_id, mode, jokers_per_team)
      values (v_code, v_uid, p_mode, case p_mode::text when 'quick' then 1 when 'standard' then 2 else 3 end)
      returning id into v_room;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 10 then raise; end if;
    end;
  end loop;

  insert into players (room_id, user_id, nickname, is_host) values (v_room, v_uid, v_nick, true);
  return jsonb_build_object('room_id', v_room, 'code', v_code);
end $$;

-- 4. OYUNU BAŞLATMA (8, 14, 20 soru kuralı)
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

  -- Rastgele takım ataması
  with ranked as (
    select id, row_number() over (order by random()) as rn from players where room_id = p_room
  )
  update players p
     set team_side = case when ((ranked.rn % 2) = 1) = v_flip then 'A'::team_side else 'B'::team_side end
    from ranked where p.id = ranked.id;

  -- Varsayılan roller
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
  values (p_room, 'A', v_room.jokers_per_team), (p_room, 'B', v_room.jokers_per_team)
  on conflict (room_id, side) do update set jokers_left = excluded.jokers_left;

  -- Dikey dağılım:
  -- quick    : 4 temel + 2 gövde + 2 çatı = 8 soru
  -- standard : 6 temel + 5 gövde + 3 çatı = 14 soru
  -- long     : 8 temel + 7 gövde + 5 çatı = 20 soru
  for v_plan in
    select * from (values
      ('base'::question_tier, case v_room.mode::text when 'quick' then 4 when 'standard' then 6 else 8 end),
      ('body'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 5 else 7 end),
      ('roof'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 3 else 5 end)
    ) as t(tier, cnt)
  loop
    insert into room_rounds (room_id, idx, tier, kind, question_id, prompt, hints, piece_id)
    select p_room, v_idx + q.rn::int, v_plan.tier, q.kind, q.id, q.prompt, q.hints,
           (select pc.id from pieces pc where pc.tier = v_plan.tier and q.id is not null
             order by random() limit 1)
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

-- 5. DEVRE ARASI MİNİ OYUNLARI BAŞLATMA & SONUÇLANDIRMA
create or replace function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roll numeric := random();
  v_kind minigame_kind;
  v_prompt text; v_starts timestamptz; v_ends timestamptz;
  v_target int := null;
  v_math record;
begin
  if v_roll < 0.40 then
    v_kind := 'reflex';
  elsif v_roll < 0.75 then
    v_kind := 'math_guess';
  else
    v_kind := 'social_guess';
  end if;

  if v_kind = 'social_guess' then
    select prompt into v_prompt from questions where kind = 'social' and active order by random() limit 1;
    if v_prompt is null then v_kind := 'math_guess'; end if;
  end if;

  if v_kind = 'math_guess' then
    -- Rastgele matematik veya sayısal tahmin sorusu
    select * into v_math from (values
      ('47 × 18 = ?', 846),
      ('35 × 24 = ?', 840),
      ('125 × 8 = ?', 1000),
      ('54 × 19 = ?', 1026),
      ('68 × 15 = ?', 1020),
      ('42 × 23 = ?', 966),
      ('75 × 12 = ?', 900),
      ('64 × 16 = ?', 1024),
      ('99 × 9 = ?', 891),
      ('88 × 11 = ?', 968),
      ('Dünya ile Ay arası ortalama kaç bin km''dir?', 384),
      ('Türkiye''nin telefon alan kodu kaçtır?', 90),
      ('Bir günde toplam kaç dakika vardır?', 1440),
      ('Güneş Sistemi''ndeki gezegen sayısı kaçtır?', 8),
      ('İnsan vücudunda ortalama kaç kemik bulunur?', 206),
      ('İstanbul''un fethinin yılı kaçtır?', 1453),
      ('Everest Tepesi deniz seviyesinden kaç metre yüksekliktedir?', 8848),
      ('Işık 1 saniyede yaklaşık kaç bin km yol alır?', 300),
      ('Standart bir piyanoda toplam kaç tuş bulunur?', 88),
      ('Cumhuriyet''in ilan edildiği yıl kaçtır?', 1923),
      ('Dünya çevresi ekvatorda yaklaşık kaç bin km''dir?', 40),
      ('Bir maratonda toplam kaç tam kilometre koşulur?', 42)
    ) as t(p, a) order by random() limit 1;

    v_prompt := v_math.p;
    v_target := v_math.a;
    v_starts := now();
    v_ends   := now() + interval '22 seconds';
  elsif v_kind = 'reflex' then
    v_starts := now() + make_interval(secs => 2 + random() * 3);
    v_ends   := v_starts + interval '12 seconds';
  else
    v_starts := now();
    v_ends   := now() + interval '20 seconds';
  end if;

  insert into room_minigames (room_id, kind, prompt, target_num, status, starts_at)
  values (p_room, v_kind, v_prompt, v_target, 'live', v_starts);

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = v_ends
   where id = p_room;
end $$;

-- Mini oyun cevabı gönderme (sayı tahmini desteği ile)
create or replace function submit_minigame_entry(
  p_minigame uuid,
  p_target uuid default null,
  p_guess int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mg room_minigames; v_room rooms; v_me players;
  v_ms int;
begin
  select * into v_mg from room_minigames where id = p_minigame;
  if not found or v_mg.status <> 'live' then raise exception 'minigame_closed'; end if;
  select * into v_room from rooms where id = v_mg.room_id;
  if v_room.paused then raise exception 'game_paused'; end if;

  select * into v_me from players where room_id = v_mg.room_id and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;

  if exists (select 1 from minigame_entries where minigame_id = p_minigame and player_id = v_me.id) then
    return;
  end if;

  if v_mg.kind = 'reflex' then
    if now() < v_mg.starts_at then raise exception 'too_early'; end if;
    v_ms := greatest(1, floor(extract(epoch from (now() - v_mg.starts_at)) * 1000)::int);
  end if;

  insert into minigame_entries (minigame_id, player_id, target_player_id, reaction_ms, guess_num)
  values (p_minigame, v_me.id, p_target, v_ms, p_guess);
end $$;

-- Mini oyunu sonuçlandırma
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

  elsif v_mg.kind = 'math_guess' then
    -- Hedefe en yakın tahmini yapan takım kazanır (en küçük fark)
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
    -- social_guess
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

-- 6. İNŞA AŞAMASINDA ERKEN GEÇİŞ (HAZIR BUTONU)
create or replace function set_building_ready(p_room uuid, p_ready boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  if v_me.team_side is null then raise exception 'no_team'; end if;
  if not v_me.is_architect then raise exception 'not_architect'; end if;

  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.phase <> 'building' then raise exception 'not_building_phase'; end if;

  if v_me.team_side = 'A' then
    update rooms set building_ready_a = p_ready where id = p_room returning * into v_room;
  else
    update rooms set building_ready_b = p_ready where id = p_room returning * into v_room;
  end if;

  -- Her iki takım da hazırsa beklemeden Oylama aşamasına geç
  if v_room.building_ready_a and v_room.building_ready_b then
    update rooms
       set phase = 'voting',
           phase_started_at = now(),
           phase_ends_at = now() + interval '30 seconds'
     where id = p_room
     returning * into v_room;
  end if;

  return jsonb_build_object(
    'ready_a', v_room.building_ready_a,
    'ready_b', v_room.building_ready_b,
    'phase', v_room.phase
  );
end $$;

-- 7. YARATIK İSMİ VE UNVANI/ÖZEL GÜCÜ
create or replace function set_creature_name(p_room uuid, p_name text, p_title text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_phase game_phase;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase not in ('building', 'voting') then raise exception 'naming_not_allowed'; end if;

  update room_teams
     set creature_name = left(btrim(p_name), 60),
         creature_title = case when p_title is not null and btrim(p_title) <> '' then left(btrim(p_title), 60) else creature_title end
   where room_id = p_room and side = v_me.team_side;
end $$;

-- 8. OYUN İLERLEME (advance_game)
create or replace function advance_game(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_before game_phase; v_after game_phase;
  v_open room_rounds; v_next room_rounds; v_mg room_minigames;
  v_total int; v_done int; v_last timestamptz; v_players int; v_count int;
  v_mg_count int; v_should_minigame boolean := false;
begin
  if not is_member(p_room) then raise exception 'not_in_game'; end if;

  select * into v_room from rooms where id = p_room for update;
  v_before := v_room.phase;
  if v_room.paused or v_room.phase in ('lobby', 'results') then
    return jsonb_build_object('phase', v_before, 'advanced', false);
  end if;

  -- ===== SORU =====
  if v_room.phase = 'question' then
    select * into v_open from room_rounds where room_id = p_room and status = 'open' limit 1;
    if found then
      if now() >= v_open.closes_at then
        perform _resolve_round(v_open.id, null);
      end if;
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select max(resolved_at) into v_last from room_rounds where room_id = p_room and status = 'resolved';
    if v_last > now() - interval '3 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select count(*), count(*) filter (where status = 'resolved') into v_total, v_done
      from room_rounds where room_id = p_room;
    select count(*) into v_mg_count from room_minigames where room_id = p_room;
    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;

    -- Mini oyun tetikleme kuralları:
    -- 8 soru (quick)   : 1 mini oyun (4. sorudan sonra)
    -- 14 soru (standard): 2 mini oyun (5. ve 10. sorudan sonra)
    -- 20 soru (long)   : 3 mini oyun (5., 10. ve 15. sorudan sonra)
    if v_total = 8 and v_mg_count = 0 and v_done >= 4 then
      v_should_minigame := true;
    elsif v_total = 14 and ((v_mg_count = 0 and v_done >= 5) or (v_mg_count = 1 and v_done >= 10)) then
      v_should_minigame := true;
    elsif v_total >= 20 and ((v_mg_count = 0 and v_done >= 5) or (v_mg_count = 1 and v_done >= 10) or (v_mg_count = 2 and v_done >= 15)) then
      v_should_minigame := true;
    end if;

    if not found then
      update rooms
         set phase = 'building',
             phase_started_at = now(),
             phase_ends_at = now() + interval '90 seconds',
             building_ready_a = false,
             building_ready_b = false
       where id = p_room;
    elsif v_should_minigame then
      perform _start_minigame(p_room);
    else
      perform _open_round(v_next.id);
    end if;

  -- ===== MİNİ OYUN =====
  elsif v_room.phase = 'minigame' then
    select * into v_mg from room_minigames where room_id = p_room order by created_at desc limit 1;

    if v_mg.status = 'live' then
      select count(*) into v_players from players where room_id = p_room;
      select count(*) into v_count   from minigame_entries where minigame_id = v_mg.id;
      if now() >= v_room.phase_ends_at or v_count >= v_players then
        perform _resolve_minigame(v_mg.id);
      end if;
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    if v_mg.resolved_at > now() - interval '6 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if found then
      perform _open_round(v_next.id);
      update rooms set phase = 'question' where id = p_room;
    else
      update rooms
         set phase = 'building',
             phase_started_at = now(),
             phase_ends_at = now() + interval '90 seconds',
             building_ready_a = false,
             building_ready_b = false
       where id = p_room;
    end if;

  -- ===== İNŞA (Erken Hazır Desteği) =====
  elsif v_room.phase = 'building' then
    if now() >= v_room.phase_ends_at or (v_room.building_ready_a and v_room.building_ready_b) then
      update rooms set phase = 'voting', phase_started_at = now(),
                       phase_ends_at = now() + interval '30 seconds'
       where id = p_room;
    end if;

  -- ===== OYLAMA =====
  elsif v_room.phase = 'voting' then
    select count(*) into v_players from players where room_id = p_room;
    select count(*) into v_count   from votes   where room_id = p_room;
    if now() >= v_room.phase_ends_at or v_count >= v_players then
      update rooms set phase = 'results', phase_started_at = now(), phase_ends_at = null
       where id = p_room;
    end if;
  end if;

  select phase into v_after from rooms where id = p_room;
  return jsonb_build_object('phase', v_after, 'advanced', v_after <> v_before);
end $$;

-- 9. SONUÇLARDA UNVAN BİLGİSİNİ DÖNDÜRME
create or replace function get_results(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_a record; v_b record; v_official team_side; v_funny team_side;
begin
  if not is_member(p_room) then raise exception 'not_in_game'; end if;
  if room_phase(p_room) <> 'results' then raise exception 'results_not_ready'; end if;

  select t.*,
         (select count(*) from team_pieces tp where tp.room_id = t.room_id and tp.side = t.side) as pieces,
         (select count(*) from votes v where v.room_id = t.room_id and v.voted_side = t.side)     as funny_votes
    into v_a from room_teams t where t.room_id = p_room and t.side = 'A';
  select t.*,
         (select count(*) from team_pieces tp where tp.room_id = t.room_id and tp.side = t.side) as pieces,
         (select count(*) from votes v where v.room_id = t.room_id and v.voted_side = t.side)     as funny_votes
    into v_b from room_teams t where t.room_id = p_room and t.side = 'B';

  v_official := case
    when v_a.score > v_b.score then 'A'::team_side
    when v_b.score > v_a.score then 'B'::team_side
    when v_a.pieces > v_b.pieces then 'A'::team_side
    when v_b.pieces > v_a.pieces then 'B'::team_side
    else null
  end;

  v_funny := case
    when v_a.funny_votes > v_b.funny_votes then 'A'::team_side
    when v_b.funny_votes > v_a.funny_votes then 'B'::team_side
    else null
  end;

  return jsonb_build_object(
    'official_winner', v_official,
    'funny_winner',    v_funny,
    'teams', jsonb_build_object(
      'A', jsonb_build_object('score', v_a.score, 'pieces', v_a.pieces, 'funny_votes', v_a.funny_votes, 'creature_name', v_a.creature_name, 'creature_title', v_a.creature_title),
      'B', jsonb_build_object('score', v_b.score, 'pieces', v_b.pieces, 'funny_votes', v_b.funny_votes, 'creature_name', v_b.creature_name, 'creature_title', v_b.creature_title)
    )
  );
end $$;

-- 10. 40+ YENİ VE ZENGİN PARÇA KATALOĞU (Ucube / Mecha / Canavar Mimarisi)
insert into pieces (slug, name_tr, category, tier, emoji) values
  -- Temel Kat (Gövde, Şasi, Taban):
  ('mecha-govde',      'Mecha Şasisi',       'body',      'base', '🤖'),
  ('ejder-govde',      'Ejderha Gövdesi',    'body',      'base', '🐉'),
  ('uzayli-jel',       'Jelatin Gövde',      'body',      'base', '👾'),
  ('pelus-govde',      'Tontiş Gövde',       'body',      'base', '🦁'),
  ('zirh-govde',       'Şövalye Zırhı',      'body',      'base', '🛡️'),
  ('dinozor-govde',    'T-Rex Gövdesi',      'body',      'base', '🦖'),
  ('ufo-taban',        'UFO Tabanı',         'body',      'base', '🛸'),
  ('kutuk-govde',      'Büyülü Kütük',       'body',      'base', '🪵'),
  ('volkan-govde',     'Lav Reaktörü',       'body',      'base', '🌋'),
  ('bulut-taban',      'Uçan Bulut',         'body',      'base', '☁️'),
  ('dev-goz-2',        'Lazer Göz',          'eyes',      'base', '👁️'),
  ('keskin-dis',       'Canavar Ağzı',       'mouth',     'base', '🦷'),
  ('atesli-agiz',      'Alev Püskürteç',     'mouth',     'base', '🔥'),
  ('sevimli-yuz',      'Masum Bakış',        'face',      'base', '🥺'),

  -- Gövde Katı (Uzuvlar, Kanatlar, Çarklar, Kollar):
  ('siborg-kol',       'Siborg Kolu',        'arms',      'body', '🦾'),
  ('dev-pence',        'Canavar Pençesi',    'arms',      'body', '🥊'),
  ('ahtapot-kol',      'Ahtapot Dokunaç',    'arms',      'body', '🐙'),
  ('melek-kanat',      'Işık Kanatları',     'wings',     'body', '🪽'),
  ('yarasa-kanat',     'Yarasa Kanatları',   'wings',     'body', '🦇'),
  ('roket-itici',      'Çift Roket Motoru',  'engines',   'body', '🚀'),
  ('altin-cark',       'Buhar Çarkı',        'gear',      'body', '⚙️'),
  ('elektrik-kol',     'Şimşek Bobini',      'arms',      'body', '⚡'),
  ('sarilici-kuyruk',  'Kertenkele Kuyruğu', 'tail',      'body', '🦎'),
  ('tilki-kuyruk',     'Alevli Tilki Kuyruğu','tail',     'body', '🦊'),
  ('yayli-bacak',      'Zıplayan Bacak',     'legs',      'body', '🦿'),
  ('dev-teker',        'Canavar Tekerlek',   'wheels',    'body', '🛞'),
  ('testereli-kol',    'Lazer Testere',      'arms',      'body', '🪚'),
  ('zehirli-sarmasik', 'Zehirli Sarmaşık',   'arms',      'body', '🌿'),

  -- Çatı Katı (Başlıklar, Taçlar, Auralar, Efsanevi Güçler):
  ('galaksi-taci',     'Galaksi Tacı',       'crown',     'roof', '👑'),
  ('buyucu-asasi',     'Kozmik Asa',         'weapon',    'roof', '🔮'),
  ('efsane-kilic',     'Işık Kılıcı',        'weapon',    'roof', '⚔️'),
  ('ates-aurasi',      'Alev Çemberi',       'aura',      'roof', '🌟'),
  ('firtina-boynuz',   'Fırtına Boynuzu',    'horns',     'roof', '🦄'),
  ('korsan-sapkasi',   'Kaptan Şapkası',     'hat',       'roof', '🏴‍☠️'),
  ('akil-anten',       'Telepatik Anten',    'antenna',   'roof', '📡'),
  ('samuray-migfer',   'Samuray Miğferi',    'hat',       'roof', '🪖'),
  ('kristal-boynuz',   'Elmas Boynuz',       'horns',     'roof', '💎'),
  ('kara-delik',       'Girdap Reaktörü',    'aura',      'roof', '🌪️'),
  ('hologram-gozluk',  'Siborg Vizörü',      'face',      'roof', '🥽'),
  ('altin-halo',       'Kutsal Halka',       'aura',      'roof', '✨')
on conflict (slug) do nothing;
