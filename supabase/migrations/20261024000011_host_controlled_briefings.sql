-- 20261024000011_host_controlled_briefings.sql
-- Kurucu kontrollü bilgilendirme (süresiz, herkese açık, kurucu 'Devam Et' dediğinde başlayan sorular ve mini oyunlar)

-- 1. Eski 5 saniyelik otomatik geçiş tetikleyicilerini kaldır
drop trigger if exists room_rounds_reserve_briefing on public.room_rounds;
drop trigger if exists rooms_reserve_minigame_briefing on public.rooms;
drop function if exists _reserve_round_briefing();
drop function if exists _reserve_minigame_briefing();

-- 2. Bilgilendirme sırasında soru cevaplarının veya harf açmanın erkenden gönderilmesini engelle
create or replace function _guard_round_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_round room_rounds;
begin
  select * into v_round from room_rounds where id = new.round_id;
  if v_round.opens_at is null or now() < v_round.opens_at then
    raise exception 'too_early';
  end if;
  return new;
end $$;

-- 3. Bilgilendirme sırasında mini oyun girişlerinin erkenden gönderilmesini engelle
create or replace function _guard_minigame_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_starts_at timestamptz;
begin
  select starts_at into v_starts_at from room_minigames where id = new.minigame_id;
  if v_starts_at is null or now() < v_starts_at then
    raise exception 'too_early';
  end if;
  return new;
end $$;

-- 4. Bilgilendirme aşamasındaki turun erken çözümlenmesini engelle
create or replace function _guard_round_resolution_briefing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'resolved'
     and old.status = 'open'
     and (old.opens_at is null or now() < old.opens_at) then
    raise exception 'too_early';
  end if;
  return new;
end $$;

-- 5. Yeni soru açıldığında süreyi hemen başlatma (opens_at = null, closes_at = null)
create or replace function _open_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_round room_rounds;
begin
  update room_rounds
     set status = 'open',
         opens_at = null,
         closes_at = null
   where id = p_round
   returning * into v_round;

  update rooms
     set phase_started_at = now(),
         phase_ends_at = null
   where id = v_round.room_id;
end $$;

-- 6. Yeni mini oyun başladığında süreyi hemen başlatma (starts_at = null, phase_ends_at = null)
create or replace function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_roll float := random();
  v_kind minigame_kind;
  v_prompt text := null;
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
  end if;

  insert into room_minigames (room_id, kind, prompt, target_num, status, starts_at)
  values (p_room, v_kind, v_prompt, v_target, 'live', null);

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = null
   where id = p_room;
end $$;

-- 7. Kurucu "Devam Et" dediğinde süreyi ve oyunu başlatan fonksiyon
create or replace function confirm_briefing(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_room rooms;
  v_round room_rounds;
  v_mg room_minigames;
  v_mod int;
  v_starts timestamptz;
  v_ends timestamptz;
  v_secs int;
begin
  if not exists (
    select 1 from players
     where room_id = p_room
       and user_id = auth.uid()
       and is_host
  ) then
    raise exception 'not_host';
  end if;

  select * into v_room from rooms where id = p_room for update;
  if not found or v_room.paused then
    return;
  end if;

  -- Kurucunun en az 5 saniye beklemesini zorunlu kıl (yanlışlıkla veya kötü niyetle hızlı geçişi önlemek için)
  if v_room.phase_started_at is not null and now() < v_room.phase_started_at + interval '4.8 seconds' then
    raise exception 'too_early';
  end if;

  if v_room.phase = 'question' then
    select * into v_round
      from room_rounds
     where room_id = p_room
       and status = 'open'
       and opens_at is null
     order by idx
     limit 1
     for update;

    if found then
      v_secs := tier_seconds(v_round.tier);
      update room_rounds
         set opens_at = now(),
             closes_at = now() + make_interval(secs => v_secs)
       where id = v_round.id;

      update rooms
         set phase_started_at = now(),
             phase_ends_at = now() + make_interval(secs => v_secs)
       where id = p_room;
    end if;

  elsif v_room.phase = 'minigame' then
    select * into v_mg
      from room_minigames
     where room_id = p_room
       and status = 'live'
       and starts_at is null
     order by created_at desc
     limit 1
     for update;

    if found then
      if v_mg.kind = 'math_guess' then
        v_starts := now();
        v_ends := now() + interval '26 seconds';
      elsif v_mg.kind = 'social_guess' then
        v_starts := now();
        v_ends := now() + interval '35 seconds';
      else
        -- variant: mod % 3 (0: reflex, 1: memory, 2: balance)
        select coalesce(sum(ascii(c)), 0) % 3 into v_mod
          from regexp_split_to_table(v_mg.id::text, '') as c;

        if v_mod = 0 then
          -- Saf refleks: yeşil ışığa kadar 2 sn bekleme
          v_starts := now() + interval '2 seconds';
          v_ends := v_starts + interval '30 seconds';
        else
          -- Hafıza veya denge
          v_starts := now();
          v_ends := now() + interval '32 seconds';
        end if;
      end if;

      update room_minigames
         set starts_at = v_starts
       where id = v_mg.id;

      update rooms
         set phase_started_at = now(),
             phase_ends_at = v_ends
       where id = p_room;
    end if;
  end if;
end $$;

revoke execute on function public.confirm_briefing(uuid) from public, anon;
grant execute on function public.confirm_briefing(uuid) to authenticated;

-- 8. Mola bitişi düzeltmesi
create or replace function _shift_briefings_on_resume() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_pause_gap interval;
begin
  if old.paused and not new.paused and old.paused_at is not null then
    v_pause_gap := now() - old.paused_at;

    update room_rounds
       set opens_at = opens_at + v_pause_gap,
           closes_at = closes_at + v_pause_gap
     where room_id = new.id
       and status = 'open'
       and opens_at is not null
       and opens_at > old.paused_at;

    update room_minigames
       set starts_at = starts_at + v_pause_gap
     where room_id = new.id
       and status = 'live'
       and starts_at is not null
       and starts_at > old.paused_at;
  end if;
  return new;
end $$;

-- 9. Sosyal tahmin mini oyununda beraberlik düzeltmesi
-- Eğer en çok oy alan birden fazla kişi varsa (örn. 1 oy ömür, 1 oy doğuş), rastgele UUID ile kazanan seçilmez; tur berabere biter.
create or replace function _resolve_minigame(p_mg uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_mg room_minigames;
  v_a numeric;
  v_b numeric;
  v_top uuid;
  v_win team_side;
  v_piece uuid;
  v_max_votes int;
  v_top_count int;
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
    v_win := case when v_a < v_b then 'A'::team_side when v_b < v_a then 'B'::team_side else null end;

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
    -- Sosyal tahmin: En yüksek oyu alan tek bir kişi varsa çoğunluk kararı oluşmuştur.
    select count(*) into v_max_votes
      from minigame_entries
     where minigame_id = p_mg and target_player_id is not null
     group by target_player_id
     order by count(*) desc
     limit 1;

    -- En yüksek oyu alan kaç farklı aday var?
    select count(*) into v_top_count
      from (
        select target_player_id
          from minigame_entries
         where minigame_id = p_mg and target_player_id is not null
         group by target_player_id
        having count(*) = v_max_votes
      ) t;

    -- Yalnızca tek bir çoğunluk adayı varsa (beraberlik yoksa) takımların oy oranı karşılaştırılır:
    if coalesce(v_max_votes, 0) > 0 and v_top_count = 1 then
      select target_player_id into v_top
        from minigame_entries
       where minigame_id = p_mg and target_player_id is not null
       group by target_player_id
       order by count(*) desc
       limit 1;

      select coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'A'), 0)::numeric
               / nullif(count(*) filter (where p.team_side = 'A'), 0),
             coalesce(sum((e.target_player_id = v_top)::int) filter (where p.team_side = 'B'), 0)::numeric
               / nullif(count(*) filter (where p.team_side = 'B'), 0)
        into v_a, v_b
        from players p
        left join minigame_entries e on e.player_id = p.id and e.minigame_id = p_mg
       where p.room_id = v_mg.room_id;

      v_win := case when v_a > v_b then 'A'::team_side when v_b > v_a then 'B'::team_side else null end;
    else
      -- En çok oyu alan birden fazla kişi varsa (örn. 1 oy ömür, 1 oy doğuş) veya oy yoksa berabere
      v_win := null;
    end if;
  end if;

  if v_win is not null then
    select id into v_piece from pieces order by random() limit 1;
    insert into team_pieces (room_id, side, piece_id, source) values (v_mg.room_id, v_win, v_piece, 'minigame');
    update room_teams set score = score + 2 where room_id = v_mg.room_id and side = v_win;
  end if;

  update room_minigames set status = 'done', winner_side = v_win, resolved_at = now() where id = p_mg;
end $$;
