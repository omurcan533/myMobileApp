-- =============================================================================
-- 20261022000002_fix_minigame_entries_and_joker.sql
-- 1. minigame_entries RLS: Odaya üye olan herkesin mini oyun cevaplarını okuyabilmesi
--    (böylece grup oylamasında diğerlerinin oyları, bar dolumu ve mat tahminleri canlı görünür)
-- 2. Matematik mini oyununda 2 kişi cevap verince süreyi beklemeden anında bitirme
-- 3. Joker özelliğinin mevcut soruyu doğrudan çözüp parça kazandırması
-- =============================================================================

-- 1. Mini oyun girişleri RLS düzeltmesi
drop policy if exists entries_read on minigame_entries;
create policy entries_read on minigame_entries for select to authenticated
  using (
    exists (select 1 from room_minigames m where m.id = minigame_id and is_member(m.room_id))
  );

-- 2. Mini oyun cevabı gönderme (matematik oyununda 2 kişi veya herkes cevap verince anında bitir)
create or replace function submit_minigame_entry(
  p_minigame uuid,
  p_target uuid default null,
  p_guess int default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mg room_minigames; v_room rooms; v_me players;
  v_ms int;
  v_count int; v_players int;
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

  -- Hızlı matematik tahmininde 2 kişi veya tüm odadaki oyuncular cevap verdiyse hemen sonuçlandır
  if v_mg.kind = 'math_guess' then
    select count(*) into v_count from minigame_entries where minigame_id = p_minigame;
    select count(*) into v_players from players where room_id = v_mg.room_id;
    if v_count >= 2 or v_count >= v_players then
      perform _resolve_minigame(p_minigame);
    end if;
  end if;
end $$;

-- 3. advance_game içinde de matematik oyunu için 2 cevap kontrolü
create or replace function advance_game(p_room uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms; v_before game_phase; v_round room_rounds; v_next room_rounds;
  v_mg room_minigames; v_players int; v_count int; v_should_minigame boolean;
begin
  select * into v_room from rooms where id = p_room for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.paused or v_room.phase = 'lobby' or v_room.phase = 'results' then
    return jsonb_build_object('phase', v_room.phase, 'advanced', false);
  end if;

  v_before := v_room.phase;

  -- ===== SORU AŞAMASI =====
  if v_room.phase = 'question' then
    select * into v_round from room_rounds where room_id = p_room and status = 'open' order by idx limit 1;
    if found then
      if now() < v_round.closes_at then
        return jsonb_build_object('phase', v_before, 'advanced', false);
      end if;
      perform _resolve_round(v_round.id, null);
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    select * into v_round from room_rounds where room_id = p_room and status = 'resolved' order by resolved_at desc limit 1;
    if v_round.resolved_at > now() - interval '3 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    v_should_minigame := (v_round.idx in (3, 6, 9, 12, 15, 18))
      and not exists (
        select 1 from room_minigames m
         where m.room_id = p_room
           and m.created_at > v_round.resolved_at - interval '30 seconds'
      );

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
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
      if now() >= v_room.phase_ends_at or v_count >= v_players or (v_mg.kind = 'math_guess' and v_count >= 2) then
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

  return jsonb_build_object('phase', (select phase from rooms where id = p_room), 'advanced', true);
end $$;

-- 4. Joker: Soruyu çözmeden doğrudan takıma kazandırıp turu sonuçlandırır
create or replace function use_joker(p_room uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me players; v_room rooms; v_round room_rounds;
begin
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;

  select * into v_room from rooms where id = p_room;
  if v_room.phase <> 'question' or v_room.paused then raise exception 'joker_not_allowed'; end if;

  -- Takımın jokeri var mı kontrol et ve 1 azalt
  update room_teams
     set jokers_left = jokers_left - 1
   where room_id = p_room and side = v_me.team_side and jokers_left > 0;
  if not found then raise exception 'no_jokers_left'; end if;

  -- Şu an açık olan turu bul
  select * into v_round
    from room_rounds
   where room_id = p_room and status = 'open'
   order by idx limit 1;

  if not found then
    -- Eğer açık tur yoksa jokeri iade et
    update room_teams set jokers_left = jokers_left + 1 where room_id = p_room and side = v_me.team_side;
    raise exception 'round_closed';
  end if;

  -- Turu takıma kazandırarak çöz ve parça ver
  perform _resolve_round(v_round.id, v_me.team_side, 'joker');

  return v_round.piece_id;
end $$;

grant execute on function use_joker(uuid) to authenticated;
grant execute on function submit_minigame_entry(uuid, uuid, int) to authenticated;
