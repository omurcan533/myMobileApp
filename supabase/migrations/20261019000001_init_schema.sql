-- =============================================================================
-- myMobileApp: Takım Bulmaca & Kolaj Yaratık Oyunu  |  İlk şema (v1)
-- =============================================================================
-- Mimari ilkeleri:
--   * Kimlik: Supabase Anonymous Auth (auth.uid()). Dashboard > Auth > Providers
--     > "Allow anonymous sign-ins" açık olmalı.
--   * Oyun durum makinesi VERİTABANINDA tutulur (rooms.phase). İstemciler
--     Supabase Realtime (Postgres Changes) ile dinler.
--   * İstemci tablolara DOĞRUDAN YAZMAZ. Tüm kritik yazmalar SECURITY DEFINER
--     RPC fonksiyonlarıyla yapılır (hile önleme: doğru cevap, cooldown, rol
--     kontrolü sunucuda). Tek istisna: Mimar'ın canvas_items yazması (RLS ile).
--   * `questions` tablosu istemciye KAPALI (cevaplar sızmasın). Oyuncular soru
--     metnini room_rounds anlık görüntüsünden okur.
-- =============================================================================

-- ---------- ENUM'LAR ---------------------------------------------------------
create type game_mode      as enum ('quick', 'long');
create type game_phase     as enum ('lobby', 'question', 'minigame', 'building', 'voting', 'results');
create type team_side      as enum ('A', 'B');
create type question_tier  as enum ('base', 'body', 'roof');          -- temel / gövde / çatı
create type question_kind  as enum ('anagram', 'riddle', 'social');
create type round_status   as enum ('pending', 'open', 'resolved');
create type piece_source   as enum ('question', 'steal', 'joker', 'minigame');
create type minigame_kind  as enum ('reflex', 'social_guess');

-- ---------- YARDIMCI FONKSİYONLAR (saf) ---------------------------------------
-- Oda kodu: karışabilen karakterler (0,O,1,I) yok.
create function gen_room_code() returns text
language plpgsql as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i int;
begin
  for i in 1..5 loop
    v_code := v_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return v_code;
end $$;

-- Türkçe duyarlı cevap normalizasyonu: İ/I, ç ğ ö ş ü ı, boşluk ve noktalama.
create function norm_answer(t text) returns text
language sql immutable as $$
  select regexp_replace(
           translate(
             lower(replace(replace(coalesce(t, ''), 'İ', 'i'), 'I', 'ı')),
             'ıçğöşüâîû', 'icgosuaiu'),
           '[^a-z0-9]', '', 'g')
$$;

-- Parça puanı (denge ayarı için tek yerden değiştirilebilir).
create function tier_points(t question_tier) returns int
language sql immutable as $$
  select case t when 'base' then 1 when 'body' then 2 else 3 end
$$;

-- Soru süreleri (saniye).
create function tier_seconds(t question_tier) returns int
language sql immutable as $$
  select case t when 'base' then 20 when 'body' then 45 else 60 end
$$;

create function other_side(s team_side) returns team_side
language sql immutable as $$
  select case s when 'A' then 'B'::team_side else 'A'::team_side end
$$;

-- ---------- TABLOLAR ---------------------------------------------------------

-- Soru havuzu (istemciye kapalı)
create table questions (
  id               uuid primary key default gen_random_uuid(),
  kind             question_kind not null,
  tier             question_tier,                 -- social için null
  prompt           text not null,                 -- anagramda karışık harfler
  answer           text,                          -- social için null
  accepted_answers text[] not null default '{}',  -- alternatif doğru cevaplar
  hints            text[] not null default '{}',
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint q_answer_required check (kind = 'social' or answer is not null),
  constraint q_tier_required   check (kind = 'social' or tier is not null)
);

-- Parça kataloğu (emoji şimdilik yer tutucu; sonra asset_url ile değişir)
create table pieces (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  name_tr   text not null,
  category  text not null,          -- eyes, ears, nose, legs, arms, wheels, wings, body, accessory, roof...
  tier      question_tier not null, -- hangi kattaki sorular bu parçayı ödül olarak verir
  emoji     text not null,
  asset_url text
);

create table rooms (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  host_user_id     uuid not null references auth.users(id) on delete cascade,
  mode             game_mode not null default 'quick',
  phase            game_phase not null default 'lobby',
  jokers_per_team  int not null default 1,
  paused           boolean not null default false,
  paused_at        timestamptz,
  phase_started_at timestamptz,
  phase_ends_at    timestamptz,
  created_at       timestamptz not null default now()
);

create table players (
  id           uuid primary key default gen_random_uuid(),
  room_id      uuid not null references rooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  nickname     text not null check (char_length(nickname) between 1 and 20),
  team_side    team_side,                      -- start_game ile atanır
  is_host      boolean not null default false,
  is_captain   boolean not null default false,
  is_architect boolean not null default false,
  locked_until timestamptz,                    -- anagram yanlış cevap cooldown'u
  joined_at    timestamptz not null default now(),
  unique (room_id, user_id)
);
create unique index players_nickname_uq   on players (room_id, lower(nickname));
create unique index players_captain_uq    on players (room_id, team_side) where is_captain;
create unique index players_architect_uq  on players (room_id, team_side) where is_architect;
create index players_user_idx on players (user_id);

-- Takım başına durum (puan, joker, yaratık adı)
create table room_teams (
  room_id       uuid not null references rooms(id) on delete cascade,
  side          team_side not null,
  score         int not null default 0,
  jokers_left   int not null default 0,
  creature_name text check (char_length(creature_name) <= 60),
  primary key (room_id, side)
);

-- Oyun başında önceden üretilen tüm turlar (pending turlar istemciye gizli)
create table room_rounds (
  id              uuid primary key default gen_random_uuid(),
  room_id         uuid not null references rooms(id) on delete cascade,
  idx             int not null,
  tier            question_tier not null,
  kind            question_kind not null,
  question_id     uuid not null references questions(id),
  prompt          text not null,
  hints           text[] not null default '{}',
  piece_id        uuid not null references pieces(id),   -- turun ödül parçası
  status          round_status not null default 'pending',
  opens_at        timestamptz,
  closes_at       timestamptz,
  winner_side     team_side,                              -- null: kimse kazanmadı
  revealed_answer text,                                   -- tur bitince açılır
  resolved_at     timestamptz,
  unique (room_id, idx)
);

-- Tahminler: anagramda bireysel cevap, bilmecede takım öneri çipleri + kaptan finali
create table round_answers (
  id         uuid primary key default gen_random_uuid(),
  round_id   uuid not null references room_rounds(id) on delete cascade,
  room_id    uuid not null references rooms(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  side       team_side not null,
  body       text not null check (char_length(body) between 1 and 80),
  is_final   boolean not null default false,
  is_correct boolean,                       -- bilmece önerilerinde null (sızıntı olmasın)
  created_at timestamptz not null default now()
);
create index round_answers_round_idx on round_answers (round_id, side);

-- Takımların kazandığı parça envanteri
create table team_pieces (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  side       team_side not null,
  piece_id   uuid not null references pieces(id),
  round_id   uuid references room_rounds(id) on delete set null,
  source     piece_source not null,
  created_at timestamptz not null default now()
);
create index team_pieces_room_idx on team_pieces (room_id, side);

-- Mimar tuvali (2D çıkartma kolajı)
create table canvas_items (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references rooms(id) on delete cascade,
  side          team_side not null,
  team_piece_id uuid not null unique references team_pieces(id) on delete cascade,
  x             real not null default 0,      -- tuval koordinatı (0..1 normalize önerilir)
  y             real not null default 0,
  scale         real not null default 1 check (scale > 0),
  rotation      real not null default 0,      -- derece
  flip_x        boolean not null default false,
  z_index       int not null default 0,
  updated_at    timestamptz not null default now()
);
create index canvas_items_room_idx on canvas_items (room_id, side);

create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger canvas_items_touch before update on canvas_items
  for each row execute function touch_updated_at();

-- Devre arası mini oyunlar
create table room_minigames (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  kind        minigame_kind not null,
  prompt      text,                            -- sosyal tahmin sorusu
  status      text not null default 'pending' check (status in ('pending', 'live', 'done')),
  starts_at   timestamptz,                     -- "BAS!" anı (sunucu saati)
  winner_side team_side,
  created_at  timestamptz not null default now()
);

create table minigame_entries (
  id               uuid primary key default gen_random_uuid(),
  minigame_id      uuid not null references room_minigames(id) on delete cascade,
  player_id        uuid not null references players(id) on delete cascade,
  target_player_id uuid references players(id) on delete cascade,  -- sosyal tahmin: seçilen arkadaş
  reaction_ms      int,                                            -- refleks: sunucu hesaplar
  created_at       timestamptz not null default now(),
  unique (minigame_id, player_id)
);

-- Çifte oylamanın 2. kategorisi: En Komik / En Çılgın Tasarım (gizli oy)
create table votes (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  voter_id   uuid not null references players(id) on delete cascade,
  voted_side team_side not null,
  created_at timestamptz not null default now(),
  unique (room_id, voter_id)
);

-- ---------- RLS YARDIMCILARI -------------------------------------------------
create function is_member(p_room uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where room_id = p_room and user_id = auth.uid())
$$;

create function my_side(p_room uuid) returns team_side
language sql stable security definer set search_path = public as $$
  select team_side from players where room_id = p_room and user_id = auth.uid()
$$;

create function is_architect_of(p_room uuid, p_side team_side) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from players
    where room_id = p_room and user_id = auth.uid()
      and team_side = p_side and is_architect)
$$;

create function room_phase(p_room uuid) returns game_phase
language sql stable security definer set search_path = public as $$
  select phase from rooms where id = p_room
$$;

-- ---------- RLS --------------------------------------------------------------
alter table questions        enable row level security;  -- politika yok = istemciye kapalı
alter table pieces           enable row level security;
alter table rooms            enable row level security;
alter table players          enable row level security;
alter table room_teams       enable row level security;
alter table room_rounds      enable row level security;
alter table round_answers    enable row level security;
alter table team_pieces      enable row level security;
alter table canvas_items     enable row level security;
alter table room_minigames   enable row level security;
alter table minigame_entries enable row level security;
alter table votes            enable row level security;

create policy pieces_read on pieces for select to authenticated using (true);

create policy rooms_read       on rooms       for select to authenticated using (is_member(id));
create policy players_read     on players     for select to authenticated using (is_member(room_id));
create policy room_teams_read  on room_teams  for select to authenticated using (is_member(room_id));
create policy team_pieces_read on team_pieces for select to authenticated using (is_member(room_id));

-- Gelecek (pending) turlar sızmasın
create policy rounds_read on room_rounds for select to authenticated
  using (is_member(room_id) and status <> 'pending');

-- Kendi takımının tahminleri; rakibinkiler tur bitince açılır
create policy answers_read on round_answers for select to authenticated
  using (
    is_member(room_id) and (
      side = my_side(room_id)
      or exists (select 1 from room_rounds r where r.id = round_id and r.status = 'resolved')
    )
  );

-- Rakip tuvali oylama aşamasına kadar sürpriz kalır
create policy canvas_read on canvas_items for select to authenticated
  using (
    is_member(room_id) and (
      side = my_side(room_id) or room_phase(room_id) in ('voting', 'results')
    )
  );

-- Tuvali yalnızca ilgili takımın Mimar'ı ve yalnızca 'building' fazında değiştirebilir
create policy canvas_insert on canvas_items for insert to authenticated
  with check (
    is_architect_of(room_id, side) and room_phase(room_id) = 'building'
    and exists (select 1 from team_pieces tp
                where tp.id = team_piece_id and tp.room_id = canvas_items.room_id and tp.side = canvas_items.side)
  );
create policy canvas_update on canvas_items for update to authenticated
  using      (is_architect_of(room_id, side) and room_phase(room_id) = 'building')
  with check (is_architect_of(room_id, side) and room_phase(room_id) = 'building');
create policy canvas_delete on canvas_items for delete to authenticated
  using (is_architect_of(room_id, side) and room_phase(room_id) = 'building');

create policy minigames_read on room_minigames for select to authenticated using (is_member(room_id));

-- Mini oyun girişleri: kendi girişin; herkesinki oyun bitince
create policy entries_read on minigame_entries for select to authenticated
  using (
    exists (select 1 from room_minigames m where m.id = minigame_id and is_member(m.room_id))
    and (
      player_id in (select id from players where user_id = auth.uid())
      or exists (select 1 from room_minigames m where m.id = minigame_id and m.status = 'done')
    )
  );

-- Oylar gizli: kendi oyun; herkesinki sonuç ekranında
create policy votes_read on votes for select to authenticated
  using (
    is_member(room_id) and (
      voter_id in (select id from players where user_id = auth.uid())
      or room_phase(room_id) = 'results'
    )
  );

-- ---------- İÇ FONKSİYONLAR (istemciye açık DEĞİL) ----------------------------
create function _is_correct(p_question uuid, p_body text) returns boolean
language sql stable security definer set search_path = public as $$
  select norm_answer(p_body) = norm_answer(q.answer)
      or exists (select 1 from unnest(q.accepted_answers) a where norm_answer(a) = norm_answer(p_body))
  from questions q where q.id = p_question
$$;

create function _open_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_round room_rounds;
begin
  update room_rounds
     set status = 'open', opens_at = now(),
         closes_at = now() + make_interval(secs => tier_seconds(tier))
   where id = p_round
   returning * into v_round;

  update rooms
     set phase_started_at = v_round.opens_at, phase_ends_at = v_round.closes_at
   where id = v_round.room_id;
end $$;

-- Atomik: aynı anda iki takım doğru cevap verirse yalnızca ilki kazanır (FOR UPDATE).
create function _resolve_round(p_round uuid, p_winner team_side, p_source piece_source default 'question')
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_round room_rounds; v_answer text;
begin
  select * into v_round from room_rounds where id = p_round for update;
  if not found or v_round.status <> 'open' then
    return false;
  end if;

  select answer into v_answer from questions where id = v_round.question_id;

  update room_rounds
     set status = 'resolved', winner_side = p_winner,
         revealed_answer = v_answer, resolved_at = now()
   where id = p_round;

  if p_winner is not null then
    insert into team_pieces (room_id, side, piece_id, round_id, source)
    values (v_round.room_id, p_winner, v_round.piece_id, p_round, p_source);

    update room_teams
       set score = score + tier_points(v_round.tier)
     where room_id = v_round.room_id and side = p_winner;
  end if;
  return true;
end $$;

-- ---------- İSTEMCİYE AÇIK RPC'LER -------------------------------------------

create function create_room(p_nickname text, p_mode game_mode default 'quick')
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
      values (v_code, v_uid, p_mode, case p_mode when 'quick' then 1 else 2 end)
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

create function join_room(p_code text, p_nickname text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_nick text := btrim(p_nickname);
  v_room rooms; v_count int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_room from rooms where code = upper(btrim(p_code));
  if not found then raise exception 'room_not_found'; end if;

  -- Yeniden bağlanma
  if exists (select 1 from players where room_id = v_room.id and user_id = v_uid) then
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'rejoined', true);
  end if;

  if v_room.phase <> 'lobby' then raise exception 'game_in_progress'; end if;
  if char_length(v_nick) not between 1 and 20 then raise exception 'invalid_nickname'; end if;
  select count(*) into v_count from players where room_id = v_room.id;
  if v_count >= 12 then raise exception 'room_full'; end if;

  begin
    insert into players (room_id, user_id, nickname) values (v_room.id, v_uid, v_nick);
  exception when unique_violation then
    raise exception 'nickname_taken';
  end;
  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code, 'rejoined', false);
end $$;

-- Lobi -> Soru: takımları rastgele böler, rolleri ve turları kurar, ilk turu açar.
create function start_game(p_room uuid) returns void
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

  -- Rastgele takım ataması (tek sayıda fazla kişi hangi takıma düşeceği de rastgele)
  with ranked as (
    select id, row_number() over (order by random()) as rn from players where room_id = p_room
  )
  update players p
     set team_side = case when ((ranked.rn % 2) = 1) = v_flip then 'A'::team_side else 'B'::team_side end
    from ranked where p.id = ranked.id;

  -- Varsayılan roller: Kaptan = ilk katılan, Mimar = son katılan (sonra değiştirilebilir)
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

  -- Dikey gerilim: temel -> gövde -> çatı
  for v_plan in
    select * from (values
      ('base'::question_tier, case when v_room.mode = 'quick' then 3 else 5 end),
      ('body'::question_tier, case when v_room.mode = 'quick' then 2 else 4 end),
      ('roof'::question_tier, case when v_room.mode = 'quick' then 1 else 3 end)
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

  update rooms set phase = 'question' where id = p_room;
  select id into v_first from room_rounds where room_id = p_room and idx = 0;
  perform _open_round(v_first);
end $$;

-- Temel kat (anagram): herkes cevap yazar, ilk doğru kazanır, yanlışa 3 sn bireysel cooldown.
-- Gövde/çatı (bilmece): cevaplar takım içi öneri çipi olur (kaptan submit_final ile onaylar).
create function submit_answer(p_round uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds; v_room rooms; v_me players;
  v_body text := btrim(p_body); v_ok boolean; v_locked timestamptz;
begin
  select * into v_round from room_rounds where id = p_round;
  if not found then raise exception 'round_not_found'; end if;
  select * into v_me from players where room_id = v_round.room_id and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;
  select * into v_room from rooms where id = v_round.room_id;

  if v_room.paused then raise exception 'game_paused'; end if;
  if v_round.status <> 'open' or now() >= v_round.closes_at then raise exception 'round_closed'; end if;
  if v_me.locked_until is not null and v_me.locked_until > now() then raise exception 'locked'; end if;
  if char_length(v_body) not between 1 and 80 then raise exception 'invalid_answer'; end if;

  if v_round.kind = 'anagram' then
    v_ok := _is_correct(v_round.question_id, v_body);
    if v_ok then
      if not _resolve_round(p_round, v_me.team_side, 'question') then
        raise exception 'round_closed';   -- rakip bir an önce çözdü
      end if;
    else
      v_locked := now() + interval '3 seconds';
      update players set locked_until = v_locked where id = v_me.id;
    end if;
    insert into round_answers (round_id, room_id, player_id, side, body, is_final, is_correct)
    values (p_round, v_round.room_id, v_me.id, v_me.team_side, v_body, true, v_ok);
    return jsonb_build_object('correct', v_ok, 'locked_until', v_locked);
  end if;

  -- Bilmece: yalnızca öneri (doğruluk bilgisi saklanmaz)
  insert into round_answers (round_id, room_id, player_id, side, body, is_final)
  values (p_round, v_round.room_id, v_me.id, v_me.team_side, v_body, false);
  return jsonb_build_object('suggested', true);
end $$;

-- Bilmece nihai cevabı: yalnızca Kaptan. Doğruysa parça kazanılır; yanlışsa RAKİBE devredilir.
create function submit_final(p_round uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds; v_room rooms; v_me players;
  v_body text := btrim(p_body); v_ok boolean; v_done boolean;
begin
  select * into v_round from room_rounds where id = p_round;
  if not found then raise exception 'round_not_found'; end if;
  select * into v_me from players where room_id = v_round.room_id and user_id = auth.uid();
  if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
  select * into v_room from rooms where id = v_round.room_id;

  if v_round.kind <> 'riddle' then raise exception 'not_a_riddle'; end if;
  if v_room.paused then raise exception 'game_paused'; end if;
  if v_round.status <> 'open' or now() >= v_round.closes_at then raise exception 'round_closed'; end if;
  if char_length(v_body) not between 1 and 80 then raise exception 'invalid_answer'; end if;

  v_ok := _is_correct(v_round.question_id, v_body);
  if v_ok then
    v_done := _resolve_round(p_round, v_me.team_side, 'question');
  else
    v_done := _resolve_round(p_round, other_side(v_me.team_side), 'steal');
  end if;
  if not v_done then raise exception 'round_closed'; end if;

  insert into round_answers (round_id, room_id, player_id, side, body, is_final, is_correct)
  values (p_round, v_round.room_id, v_me.id, v_me.team_side, v_body, true, v_ok);
  return jsonb_build_object('correct', v_ok);
end $$;

-- Süre dolduysa turu kimseye parça vermeden kapatır (herhangi bir oyuncu tetikleyebilir).
create function expire_round(p_round uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_round room_rounds; v_room rooms;
begin
  select * into v_round from room_rounds where id = p_round;
  if not found or not is_member(v_round.room_id) then raise exception 'round_not_found'; end if;
  select * into v_room from rooms where id = v_round.room_id;
  if v_room.paused or v_round.status <> 'open' or now() < v_round.closes_at then
    return false;
  end if;
  return _resolve_round(p_round, null);
end $$;

-- Joker: soru çözmeden doğrudan bonus parça (yalnızca Kaptan, soru fazında).
create function use_joker(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_piece uuid;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
  select * into v_room from rooms where id = p_room;
  if v_room.phase <> 'question' or v_room.paused then raise exception 'joker_not_allowed'; end if;

  update room_teams set jokers_left = jokers_left - 1, score = score + 1
   where room_id = p_room and side = v_me.team_side and jokers_left > 0;
  if not found then raise exception 'no_jokers_left'; end if;

  select id into v_piece from pieces order by random() limit 1;
  insert into team_pieces (room_id, side, piece_id, source)
  values (p_room, v_me.team_side, v_piece, 'joker');
  return v_piece;
end $$;

-- Kaptan: her iki takım için sınırsız mola. Devam edince süreler duraklama kadar öteye kayar.
create function toggle_pause(p_room uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_me players; v_room rooms; v_gap interval;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
  select * into v_room from rooms where id = p_room for update;
  if v_room.phase = 'lobby' then raise exception 'not_started'; end if;

  if not v_room.paused then
    update rooms set paused = true, paused_at = now() where id = p_room;
    return true;
  end if;

  v_gap := now() - v_room.paused_at;
  update rooms
     set paused = false, paused_at = null,
         phase_ends_at = phase_ends_at + v_gap
   where id = p_room;
  update room_rounds set closes_at = closes_at + v_gap
   where room_id = p_room and status = 'open';
  return false;
end $$;

-- Kaptan: yarattığın canavara ortak isim ver.
create function set_creature_name(p_room uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_phase game_phase;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or not v_me.is_captain then raise exception 'not_captain'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase not in ('building', 'voting') then raise exception 'naming_not_allowed'; end if;
  update room_teams set creature_name = left(btrim(p_name), 60)
   where room_id = p_room and side = v_me.team_side;
end $$;

-- Mini oyun girişi. Zaman damgası SUNUCUDA alınır (refleks için adil).
create function submit_minigame_entry(p_minigame uuid, p_target uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_mg room_minigames; v_me players; v_ms int;
begin
  select * into v_mg from room_minigames where id = p_minigame;
  if not found then raise exception 'minigame_not_found'; end if;
  select * into v_me from players where room_id = v_mg.room_id and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  if v_mg.status <> 'live' then raise exception 'not_live'; end if;

  if v_mg.kind = 'reflex' then
    if now() < v_mg.starts_at then raise exception 'too_early'; end if;
    v_ms := floor(extract(epoch from (now() - v_mg.starts_at)) * 1000)::int;
  else
    if p_target is null
       or not exists (select 1 from players where id = p_target and room_id = v_mg.room_id) then
      raise exception 'invalid_target';
    end if;
  end if;

  insert into minigame_entries (minigame_id, player_id, target_player_id, reaction_ms)
  values (p_minigame, v_me.id, p_target, v_ms)
  on conflict (minigame_id, player_id) do nothing;
end $$;

-- Gizli oy. Varsayılan kural: kendi takımının tasarımına oy verilemez (4'e 3 haksızlığını önler).
-- Bu kısıtı kaldırmak için aşağıdaki 'own_team_vote' kontrolünü silmeniz yeterli.
create function cast_vote(p_room uuid, p_side team_side) returns void
language plpgsql security definer set search_path = public as $$
declare v_me players; v_phase game_phase;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase <> 'voting' then raise exception 'voting_closed'; end if;
  if v_me.team_side = p_side then raise exception 'own_team_vote'; end if;

  insert into votes (room_id, voter_id, voted_side) values (p_room, v_me.id, p_side)
  on conflict (room_id, voter_id) do update set voted_side = excluded.voted_side;
end $$;

-- ---------- YETKİLER ---------------------------------------------------------
-- Supabase varsayılan olarak yeni fonksiyonları anon/authenticated'a açar; önce hepsini kapat.
revoke execute on all functions in schema public from public, anon, authenticated;

-- Yalnızca istemci API'si + RLS'in kullandığı yardımcılar:
grant execute on function
  is_member(uuid), my_side(uuid), is_architect_of(uuid, team_side), room_phase(uuid),
  create_room(text, game_mode), join_room(text, text), start_game(uuid),
  submit_answer(uuid, text), submit_final(uuid, text), expire_round(uuid),
  use_joker(uuid), toggle_pause(uuid), set_creature_name(uuid, text),
  submit_minigame_entry(uuid, uuid), cast_vote(uuid, team_side)
to authenticated;

-- ---------- REALTIME ---------------------------------------------------------
alter publication supabase_realtime add table
  rooms, players, room_teams, room_rounds, round_answers, team_pieces,
  canvas_items, room_minigames, minigame_entries, votes;

-- DELETE olaylarında filtre/RLS için eski satırın tamamı gerekir
alter table canvas_items replica identity full;
