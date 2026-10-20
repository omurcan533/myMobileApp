-- =============================================================================
-- Adım 3: Oyun durum makinesi
--   lobby -> question -> (devre arası) minigame -> question -> building -> voting -> results
--
-- advance_game(room): HERHANGİ bir oyuncu çağırabilir, idempotenttir. Sunucu
-- süre/koşulu kendisi doğrular; koşul sağlanmadıysa hiçbir şey yapmaz. Böylece
-- host'un bağlantısı koparsa bile oyun takılmaz. İstemciler zamanlayıcı bitince
-- (ve bir tur çözülünce) bu fonksiyonu çağırır.
-- =============================================================================

alter table rooms          add column midpoint_done boolean not null default false;
alter table room_minigames add column resolved_at   timestamptz;

-- Mimar değişimi için takım içi çoğunluk oyu
create table architect_votes (
  room_id      uuid not null references rooms(id) on delete cascade,
  voter_id     uuid not null references players(id) on delete cascade,
  candidate_id uuid not null references players(id) on delete cascade,
  primary key (room_id, voter_id)
);
alter table architect_votes enable row level security;
create policy architect_votes_read on architect_votes for select to authenticated
  using (
    is_member(room_id)
    and exists (select 1 from players v where v.id = voter_id and v.team_side = my_side(room_id))
  );
alter publication supabase_realtime add table architect_votes;

-- ---------- İÇ FONKSİYONLAR --------------------------------------------------

-- Devre arası mini oyunu başlatır (refleks ya da sosyal tahmin).
create function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_kind minigame_kind := (case when random() < 0.5 then 'reflex' else 'social_guess' end)::minigame_kind;
  v_prompt text; v_starts timestamptz; v_ends timestamptz;
begin
  if v_kind = 'social_guess' then
    select prompt into v_prompt from questions where kind = 'social' and active order by random() limit 1;
    if v_prompt is null then v_kind := 'reflex'; end if;
  end if;

  if v_kind = 'reflex' then
    v_starts := now() + make_interval(secs => 2 + random() * 3);   -- "BAS!" anı belirsiz
    v_ends   := v_starts + interval '8 seconds';
  else
    v_starts := now();
    v_ends   := now() + interval '20 seconds';
  end if;

  insert into room_minigames (room_id, kind, prompt, status, starts_at)
  values (p_room, v_kind, v_prompt, 'live', v_starts);

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = v_ends
   where id = p_room;
end $$;

-- Mini oyunu sonuçlandırır, kazanana bonus parça (+2 puan) verir.
--   reflex       : takımın ortalama tepki süresi düşük olan kazanır (dokunmayan = 5000 ms ceza)
--   social_guess : grubun en çok seçtiği kişiyi, takım üyelerinin en yüksek oranı seçen takım kazanır
create function _resolve_minigame(p_mg uuid) returns void
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
    update room_teams set score = score + 2 where room_id = v_mg.room_id and side = v_win;
  end if;

  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now() where id = p_mg;
end $$;

-- ---------- advance_game -----------------------------------------------------
create function advance_game(p_room uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_before game_phase; v_after game_phase;
  v_open room_rounds; v_next room_rounds; v_mg room_minigames;
  v_total int; v_done int; v_last timestamptz; v_players int; v_count int;
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
        perform _resolve_round(v_open.id, null);          -- süre doldu, kimse kazanmadı
      end if;
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    -- Sonuç gösterim aralığı: tur çözüldükten 3 sn sonra ilerle
    select max(resolved_at) into v_last from room_rounds where room_id = p_room and status = 'resolved';
    if v_last > now() - interval '3 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select count(*), count(*) filter (where status = 'resolved') into v_total, v_done
      from room_rounds where room_id = p_room;
    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;

    if not found then
      update rooms set phase = 'building', phase_started_at = now(),
                       phase_ends_at = now() + interval '75 seconds'
       where id = p_room;
    elsif not v_room.midpoint_done and v_total >= 4 and v_done >= ceil(v_total / 2.0) then
      perform _start_minigame(p_room);                    -- devre arası: yapının yarısı tamam
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

    if v_mg.resolved_at > now() - interval '6 seconds' then   -- sonuç gösterimi
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    update rooms set midpoint_done = true where id = p_room;
    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if found then
      perform _open_round(v_next.id);
      update rooms set phase = 'question' where id = p_room;
    else
      update rooms set phase = 'building', phase_started_at = now(),
                       phase_ends_at = now() + interval '75 seconds'
       where id = p_room;
    end if;

  -- ===== İNŞA =====
  elsif v_room.phase = 'building' then
    if now() >= v_room.phase_ends_at then
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

-- ---------- SONUÇLAR ---------------------------------------------------------
-- Resmi şampiyon: en yüksek puan (eşitlikte daha çok parça). Mizah şampiyonu: en çok oy.
create function get_results(p_room uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_a record; v_b record; v_official team_side; v_funny team_side;
begin
  if not is_member(p_room) then raise exception 'not_in_game'; end if;
  if room_phase(p_room) <> 'results' then raise exception 'results_not_ready'; end if;

  select t.score, t.creature_name,
         (select count(*) from team_pieces tp where tp.room_id = t.room_id and tp.side = t.side) as pieces,
         (select count(*) from votes v where v.room_id = t.room_id and v.voted_side = t.side)  as funny_votes
    into v_a from room_teams t where t.room_id = p_room and t.side = 'A';
  select t.score, t.creature_name,
         (select count(*) from team_pieces tp where tp.room_id = t.room_id and tp.side = t.side) as pieces,
         (select count(*) from votes v where v.room_id = t.room_id and v.voted_side = t.side)  as funny_votes
    into v_b from room_teams t where t.room_id = p_room and t.side = 'B';

  v_official := case
    when v_a.score > v_b.score then 'A'::team_side
    when v_b.score > v_a.score then 'B'::team_side
    when v_a.pieces > v_b.pieces then 'A'::team_side
    when v_b.pieces > v_a.pieces then 'B'::team_side
  end;
  v_funny := case
    when v_a.funny_votes > v_b.funny_votes then 'A'::team_side
    when v_b.funny_votes > v_a.funny_votes then 'B'::team_side
  end;

  return jsonb_build_object(
    'official_winner', v_official,
    'funny_winner',    v_funny,
    'teams', jsonb_build_object(
      'A', jsonb_build_object('score', v_a.score, 'pieces', v_a.pieces, 'funny_votes', v_a.funny_votes, 'creature_name', v_a.creature_name),
      'B', jsonb_build_object('score', v_b.score, 'pieces', v_b.pieces, 'funny_votes', v_b.funny_votes, 'creature_name', v_b.creature_name)
    )
  );
end $$;

-- ---------- MİMAR DEĞİŞİMİ (takım içi çoğunluk oyu) -------------------------
create function vote_architect(p_room uuid, p_candidate uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_cand players; v_phase game_phase; v_size int; v_tally int;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;
  select * into v_cand from players where id = p_candidate and room_id = p_room;
  if not found or v_cand.team_side is distinct from v_me.team_side then raise exception 'invalid_candidate'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase not in ('question', 'minigame', 'building') then raise exception 'architect_change_not_allowed'; end if;
  if v_cand.is_architect then return false; end if;

  insert into architect_votes (room_id, voter_id, candidate_id) values (p_room, v_me.id, p_candidate)
  on conflict (room_id, voter_id) do update set candidate_id = excluded.candidate_id;

  select count(*) into v_size from players where room_id = p_room and team_side = v_me.team_side;
  select count(*) into v_tally
    from architect_votes av join players pv on pv.id = av.voter_id
   where av.room_id = p_room and av.candidate_id = p_candidate and pv.team_side = v_me.team_side;

  if v_tally * 2 > v_size then
    update players set is_architect = false
     where room_id = p_room and team_side = v_me.team_side and is_architect;
    update players set is_architect = true where id = p_candidate;
    delete from architect_votes av using players pv
     where av.voter_id = pv.id and av.room_id = p_room and pv.team_side = v_me.team_side;
    return true;
  end if;
  return false;
end $$;

-- ---------- submit_minigame_entry: faz ve süre kontrolü ekle ------------------
create or replace function submit_minigame_entry(p_minigame uuid, p_target uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare v_mg room_minigames; v_room rooms; v_me players; v_ms int;
begin
  select * into v_mg from room_minigames where id = p_minigame;
  if not found then raise exception 'minigame_not_found'; end if;
  select * into v_me from players where room_id = v_mg.room_id and user_id = auth.uid();
  if not found then raise exception 'not_in_game'; end if;
  select * into v_room from rooms where id = v_mg.room_id;

  if v_mg.status <> 'live' or v_room.phase <> 'minigame' then raise exception 'not_live'; end if;
  if now() > v_room.phase_ends_at then raise exception 'minigame_over'; end if;

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

-- ---------- YETKİLER ---------------------------------------------------------
-- Supabase yeni fonksiyonlara varsayılan olarak anon/authenticated erişimi verir; önce kapat.
revoke execute on function
  _start_minigame(uuid), _resolve_minigame(uuid), advance_game(uuid),
  get_results(uuid), vote_architect(uuid, uuid), submit_minigame_entry(uuid, uuid)
from public, anon, authenticated;

grant execute on function
  advance_game(uuid), get_results(uuid), vote_architect(uuid, uuid), submit_minigame_entry(uuid, uuid)
to authenticated;
