-- Public metadata only; numeric answers remain in the existing RLS-protected table.
alter table public.room_minigames add column if not exists math_state jsonb;

create or replace function public.configure_math_questions(p_minigame uuid,p_count integer) returns void
language plpgsql security definer set search_path=public as $fn$
declare m room_minigames;
begin
 if p_count is null or p_count not in (1,3,5) then raise exception 'invalid_question_count'; end if;
 select * into m from room_minigames where id=p_minigame;
 if not found then raise exception 'minigame_not_found'; end if;
 perform 1 from rooms where id=m.room_id for update;
 select * into m from room_minigames where id=p_minigame for update;
 if not exists(select 1 from players where room_id=m.room_id and user_id=auth.uid() and is_host) then raise exception 'not_host'; end if;
 if m.kind<>'math_guess' or m.status<>'live' or m.starts_at is not null or coalesce((m.math_state->>'index')::int,1)<>1 then raise exception 'configuration_closed'; end if;
 update room_minigames set math_state=jsonb_build_object('count',p_count,'index',1,'prompts',jsonb_build_array(m.prompt)) where id=p_minigame;
end $fn$;
revoke all on function public.configure_math_questions(uuid,integer) from public,anon;
grant execute on function public.configure_math_questions(uuid,integer) to authenticated;

create or replace function public._start_math_followup(p_minigame uuid) returns boolean
language plpgsql security invoker set search_path=public as $fn$
declare m room_minigames; q record; next_id uuid; total int; n int;
begin
 select * into m from room_minigames where id=p_minigame for update;
 if not found or m.kind<>'math_guess' or m.status<>'done' then return false; end if;
 total:=coalesce((m.math_state->>'count')::int,1); n:=coalesce((m.math_state->>'index')::int,1);
 if n>=total then return false; end if;
 if exists(select 1 from room_minigames where room_id=m.room_id and created_at>m.created_at) then return false; end if;
 select * into q from (values
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
    ) as t(p, a) where not coalesce(m.math_state->'prompts','[]'::jsonb) ? t.p order by random() limit 1;
 if not found then raise exception 'no_unused_math_questions'; end if;
 insert into room_minigames(room_id,kind,prompt,status,starts_at,math_state,created_at)
 values(m.room_id,'math_guess',q.p,'live',null,jsonb_build_object('count',total,'index',n+1,'prompts',coalesce(m.math_state->'prompts','[]'::jsonb)||jsonb_build_array(q.p)),clock_timestamp()) returning id into next_id;
 insert into private_minigame_answers(minigame_id,answer) values(next_id,q.a);
 update rooms set phase='minigame',phase_started_at=now(),phase_ends_at=null where id=m.room_id;
 return true;
end $fn$;
revoke all on function public._start_math_followup(uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.advance_game(p_room uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and v_room.selected_games && array['reflex','math_guess','social_guess','tug_of_war']::text[]
      and not exists (
        select 1 from room_minigames m
         where m.room_id = p_room
           and m.created_at > v_round.resolved_at - interval '30 seconds'
      );

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if not found and public.has_unplayed_selected_minigame(p_room) then
      perform _start_minigame(p_room);
    elsif not found then
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
      if (v_mg.kind in ('pong','tug_of_war') and v_room.phase_ends_at is not null and now() >= v_room.phase_ends_at) or (v_mg.kind not in ('pong','tug_of_war') and (now() >= v_room.phase_ends_at or (v_players > 0 and v_count >= v_players))) then
        perform _resolve_minigame(v_mg.id);
      end if;
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    if v_mg.kind = 'pong' and v_mg.rematch_approved_at is not null and not exists(select 1 from room_minigames where rematch_of=v_mg.id) then
      return jsonb_build_object('phase',v_before,'advanced',false);
    end if;



    if v_mg.kind='tug_of_war' and v_mg.rematch_approved_at is null then return jsonb_build_object('phase',v_before,'advanced',false); end if;
    if v_mg.resolved_at > now() - interval '6 seconds' then
      return jsonb_build_object('phase', v_before, 'advanced', false);
    end if;

    if v_mg.kind='math_guess' and public._start_math_followup(v_mg.id) then
      return jsonb_build_object('phase','minigame','advanced',true);
    end if;

    select * into v_next from room_rounds where room_id = p_room and status = 'pending' order by idx limit 1;
    if found then
      perform _open_round(v_next.id);
      update rooms set phase = 'question' where id = p_room;
    elsif public.has_unplayed_selected_minigame(p_room) then
      perform _start_minigame(p_room);
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
end $function$
;
CREATE OR REPLACE FUNCTION public.vote_architect(p_room uuid, p_candidate uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_me players; v_cand players; v_phase game_phase; v_size int; v_tally int;
begin
  perform 1 from rooms where id=p_room for update;
  select * into v_me from players where room_id = p_room and user_id = auth.uid();
  if not found or v_me.team_side is null then raise exception 'not_in_game'; end if;
  select * into v_cand from players where id = p_candidate and room_id = p_room;
  if not found or v_cand.team_side is distinct from v_me.team_side then raise exception 'invalid_candidate'; end if;
  select phase into v_phase from rooms where id = p_room;
  if v_phase not in ('question', 'minigame', 'building') then raise exception 'architect_change_not_allowed'; end if;
  if v_phase='building' and not v_me.is_captain then raise exception 'not_captain'; end if;
  if v_cand.is_architect then return false; end if;
  if v_phase='building' then
    update players set is_architect=false where room_id=p_room and team_side=v_me.team_side and is_architect;
    update players set is_architect=true where id=p_candidate;
    delete from architect_votes av using players pv where av.voter_id=pv.id and av.room_id=p_room and pv.team_side=v_me.team_side;
    update rooms set building_ready_a=case when v_me.team_side='A' then false else building_ready_a end, building_ready_b=case when v_me.team_side='B' then false else building_ready_b end where id=p_room;
    return true;
  end if;

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
end $function$
;
CREATE OR REPLACE FUNCTION public._start_minigame(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_roll float := random();
  v_kind minigame_kind;
  v_prompt text := null;
  v_target int := null;
  v_math record;
  v_song record;
  v_new_id uuid;
begin
  select public.next_selected_minigame_kind(p_room) into v_kind;
  if v_kind is null then raise exception 'no_minigames_selected'; end if;

  if v_kind = 'social_guess' then
    select q.prompt into v_prompt from questions q where q.kind='social' and q.active
      and not exists(select 1 from room_minigames m where m.room_id=p_room and m.kind='social_guess' and m.prompt=q.prompt)
      order by random() limit 1;
    if v_prompt is null then select prompt into v_prompt from questions where kind='social' and active order by random() limit 1; end if;
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

  if v_kind = 'song_complete' then
    select artist,title,genre into v_song from public.song_questions order by random() limit 1;
    v_prompt := v_song.artist || ' · ' || v_song.genre || E'\nŞarkının adını tamamla: ' ||
      case when position(' ' in v_song.title)>0 then
        left(v_song.title,length(v_song.title)-length(split_part(reverse(v_song.title),' ',1))-1) || ' _____'
      else left(v_song.title,1) || repeat('_',greatest(2,char_length(v_song.title)-1)) end;
  end if;
  insert into room_minigames (room_id, kind, prompt, target_num, status, starts_at)
  values (p_room, v_kind, v_prompt, null, 'live', null) returning id into v_new_id;
  if v_kind = 'song_complete' then insert into public.song_game_secrets(minigame_id,answer) values(v_new_id,v_song.title); end if;
  if v_kind = 'math_guess' then insert into private_minigame_answers(minigame_id, answer) values(v_new_id,v_target); end if;
  if v_kind = 'line_connect' then update room_minigames set line_connect_state=public.line_connect_board(v_new_id) where id=v_new_id; end if;
  if v_kind = 'survivor_memory' then
    insert into public.survivor_secrets(minigame_id,greens,white_row,white_col)
    values(v_new_id,array(select floor(random()*5)::int from generate_series(1,7)),floor(random()*7)::int,floor(random()*5)::int);
    update public.room_minigames set survivor_state='{"A":{"row":0,"retry":false,"failed":false},"B":{"row":0,"retry":false,"failed":false}}'::jsonb where id=v_new_id;
  end if;
  if v_kind = 'pong' then perform public.pong_initialize(v_new_id); end if;

  update rooms set phase = 'minigame', phase_started_at = now(), phase_ends_at = null
   where id = p_room;
end $function$
;

insert into public.questions(kind,prompt,active)
select 'social'::question_kind,v.prompt,true from (values
('Bu grupta kim bir tartışmada haksız olduğunu anlayınca konuyu değiştirir?'),
('Kim arkadaşının flörtünü beğense ilk önce en yakın arkadaşına itiraf eder?'),
('Kim birinin mesajını gruba atıp topluca cevap yazdırır?'),
('Kim ayrıldığı kişiyi merak etmiyorum deyip profilini kontrol eder?'),
('Kim arkadaşının sırrını anlatırken isim vermiyorum ama diye başlar?'),
('Kim bu grupta gizlice en çok ilgi bekliyor?'),
('Kim barışmak istediği halde karşı tarafın ilk mesajı atmasını bekler?'),
('Kim bir buluşmayı iptal etmek için en yaratıcı bahaneyi uydurur?'),
('Kim herkesin içinde sakin durup özelden en sert yorumu yapar?'),
('Kim ben kıskanç değilim deyip bütün detayları fark eder?'),
('Kim eski sevgilisi yazsa gruba danışıp yine kendi bildiğini yapar?'),
('Kim bir arkadaşına kırıldığı halde hiçbir şey yok der?'),
('Kim bu grupta bir tartışmayı yanlışlıkla yeniden alevlendirir?'),
('Kim hoşlandığı kişinin yanında en çok karakter değiştirir?'),
('Kim bir dedikoduyu öğrenmek için sadece dinliyorum rolü yapar?'),
('Kim gruptan biri ünlü olsa ilk ben keşfettim der?'),
('Kim bir arkadaşının kombinini överken kendi içinde beğenmez?'),
('Kim mesajı görüp cevap vermediği halde çevrimiçi yakalanır?'),
('Kim bu grupta en kolay trip atar ama en zor kabul eder?'),
('Kim arkadaşına tavsiye verdiği şeyi kendi hayatında asla uygulamaz?'),
('Kim bir oyunu kaybedince bağlantıyı suçlar?'),
('Kim bu grupta kimin kimden hoşlandığını ilk fark eder?'),
('Kim arkadaşının flörtünü sorguya çekip görüşmeyi iş mülakatına çevirir?'),
('Kim bir tartışmada ekran görüntülerini delil olarak hazır tutar?'),
('Kim beni bu işe karıştırmayın deyip bütün ayrıntıları sorar?'),
('Kim arkadaşları arasında gizlice en çok rekabet ediyor?'),
('Kim bu grupta özür dilemek yerine yemek ısmarlar?'),
('Kim yanlışlıkla attığı mesajı silince daha çok şüphe çeker?'),
('Kim bir planı kendi istemediği için herkesin vazgeçmesini sağlar?'),
('Kim bir arkadaşının yeni ilişkisine ilk günden yorum yapar?'),
('Kim bir itiraf oyununda soruyu cevaplamak yerine başkasına yöneltir?'),
('Kim bu grupta en masum görünüp en şaşırtıcı itirafı yapar?')
) v(prompt) where not exists(select 1 from public.questions q where q.kind='social' and q.prompt=v.prompt);
