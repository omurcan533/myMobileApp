-- =============================================================================
-- Kredi sayısını 10 yapma ve Oyun Ortası Grup İtirafı (Social Poll)
-- =============================================================================

-- 1. Takım başlangıç kredisini 10 yap ve mevcut takımları güncelle
alter table room_teams alter column credits set default 10;
update room_teams set credits = 10;

-- 2. Devre arasında Grup İtirafı / Arkadaş Oylamasını garantile (Süre: 40 saniye)
create or replace function _start_minigame(p_room uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prompt text;
  v_starts timestamptz := now();
  v_ends   timestamptz := now() + interval '40 seconds';
begin
  -- Oyun ortasında grup üyeleri hakkında soru seç (kendi dahil herkese oy verebilirler)
  select prompt into v_prompt
    from questions
   where kind = 'social' and active
   order by random()
   limit 1;

  if v_prompt is null then
    v_prompt := 'Gemi yansa/batsa gemisini ilk terk edecek kaptan kim olurdu?';
  end if;

  insert into room_minigames (room_id, kind, prompt, status, starts_at)
  values (p_room, 'social_guess', v_prompt, 'live', v_starts);

  update rooms
     set phase = 'minigame', phase_started_at = v_starts, phase_ends_at = v_ends
   where id = p_room;
end $$;

-- 3. Kullanıcının istediği özel soru ve eğlenceli grup oylaması soruları
insert into questions (kind, tier, prompt) values
  ('social', null, 'Gemi yansa/batsa gemisini ilk terk edecek kaptan kim olurdu?'),
  ('social', null, 'Issız bir adaya düşsek panik yapıp herkesi delirtecek kim?'),
  ('social', null, 'Piyangodan büyük ikramiye çıksa parayı ilk günde bitirecek kim?'),
  ('social', null, 'En komik ve akılalmaz bahaneleri kim uydurur?'),
  ('social', null, 'Zor bir durumda kaldığında ilk kimi arardın?'),
  ('social', null, 'Zombi istilası çıksa gruptan ilk kim elenirdi?'),
  ('social', null, 'Grupta gizli bir yeteneği olduğunu herkesten saklayan kim?'),
  ('social', null, 'Hesap ödeme vakti gelince tuvalete kaybolma ihtimali en yüksek kim?'),
  ('social', null, 'Gece yarısı bile arasan hiç düşünmeden yardıma koşacak kim?'),
  ('social', null, 'Bir gün yanlışlıkla suç örgütü lideri olacak kadar absürt maceralara atılan kim?');
