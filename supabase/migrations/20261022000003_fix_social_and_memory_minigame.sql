-- =============================================================================
-- 20261022000003_fix_social_and_memory_minigame.sql
-- 1. submit_final fonksiyonunu esnet:
--    - Kaptan olmayan takım üyelerinin de takımı adına cevap gönderebilmesi (kaptan düşerse veya pasifse oyun kilitlenmesin)
--    - 'social' türündeki turlar için 400 Bad Request (not_a_riddle) vermeden doğrudan çözülmesi
-- 2. Devre arası mini oyun süresi (reflex / memory / balance) 12 saniyeden 30 saniyeye çıkarıldı
--    (böylece sıralamayı izledikten sonra süre bitip ekran kilitlenmez, tıklama serbest kalır)
-- =============================================================================

-- 1. submit_final: bilmece ve sosyal sorular için esnek ve güvenli nihai cevap
create or replace function submit_final(p_round uuid, p_body text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds; v_room rooms; v_me players;
  v_body text := btrim(p_body); v_ok boolean; v_done boolean;
begin
  select * into v_round from room_rounds where id = p_round;
  if not found then raise exception 'round_not_found'; end if;

  select * into v_me from players where room_id = v_round.room_id and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;

  select * into v_room from rooms where id = v_round.room_id;
  if v_room.paused then raise exception 'game_paused'; end if;
  if v_round.status <> 'open' or now() >= v_round.closes_at then raise exception 'round_closed'; end if;
  if char_length(v_body) not between 1 and 80 then raise exception 'invalid_answer'; end if;

  -- Sosyal sorularda doğrudan doğru kabul edilir
  if v_round.kind = 'social' then
    v_ok := true;
    v_done := _resolve_round(p_round, v_me.team_side, 'question');
  else
    v_ok := _is_correct(v_round.question_id, v_body);
    if v_ok then
      v_done := _resolve_round(p_round, v_me.team_side, 'question');
    else
      v_done := _resolve_round(p_round, other_side(v_me.team_side), 'steal');
    end if;
  end if;

  if not v_done then raise exception 'round_closed'; end if;

  insert into round_answers (round_id, room_id, player_id, side, body, is_final, is_correct)
  values (p_round, v_round.room_id, v_me.id, v_me.team_side, v_body, true, v_ok);

  return jsonb_build_object('correct', v_ok);
end $$;

-- 2. _start_minigame: Süreleri hafıza ve refleks oyunlarına yetecek şekilde 30 saniye yap
create or replace function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roll float := random();
  v_kind minigame_kind;
  v_prompt text := null;
  v_target int := null;
  v_starts timestamptz;
  v_ends   timestamptz;
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
    v_ends   := now() + interval '26 seconds';
  elsif v_kind = 'reflex' then
    v_starts := now() + interval '2 seconds';
    v_ends   := v_starts + interval '30 seconds';
  else
    v_starts := now();
    v_ends   := now() + interval '35 seconds';
  end if;

  insert into room_minigames (room_id, kind, prompt, target_num, status, starts_at)
  values (p_room, v_kind, v_prompt, v_target, 'live', v_starts);

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = v_ends
   where id = p_room;
end $$;

grant execute on function submit_final(uuid, text) to authenticated;
