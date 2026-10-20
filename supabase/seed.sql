-- =============================================================================
-- Başlangıç verisi. Bu küçük set şemayı test etmek içindir;
-- gerçek hedef: 150-200 elle yazılmış, yerel kültüre uygun Türkçe soru.
-- Not: Hızlı mod 3 temel + 2 gövde + 1 çatı ister. Uzun mod (5/4/3) için
-- havuz büyütülmeli; yetersizse start_game mevcut sorularla daha az tur kurar.
-- =============================================================================

-- ---------- PARÇA KATALOĞU (emoji = geçici görsel) ----------------------------
insert into pieces (slug, name_tr, category, tier, emoji) values
  ('dev-goz',     'Dev Göz',         'eyes',      'base', '👁️'),
  ('kulak',       'Kocaman Kulak',   'ears',      'base', '👂'),
  ('burun',       'Burun',           'nose',      'base', '👃'),
  ('ayak',        'Çıplak Ayak',     'legs',      'base', '🦶'),
  ('sapka',       'Şapka',           'accessory', 'base', '🎩'),
  ('kol',         'Kas Kol',         'arms',      'body', '💪'),
  ('tekerlek',    'Tekerlek',        'wheels',    'body', '🛞'),
  ('kanat',       'Kanat',           'wings',     'body', '🪽'),
  ('govde-yumurta','Yumurta Gövde',  'body',      'body', '🥚'),
  ('govde-corap', 'Çorap Gövde',     'body',      'body', '🧦'),
  ('baca',        'Baca',            'roof',      'roof', '🏭'),
  ('boynuz',      'Tek Boynuz',      'horns',     'roof', '🦄'),
  ('tac',         'Taç',             'accessory', 'roof', '👑'),
  ('roket',       'Roket',           'roof',      'roof', '🚀');

-- ---------- TEMEL KAT: ANAGRAM -----------------------------------------------
insert into questions (kind, tier, prompt, answer, hints) values
  ('anagram', 'base', 'ZPURAK',      'karpuz',    '{"Yazın vazgeçilmezi"}'),
  ('anagram', 'base', 'NAKRAMA',     'makarna',   '{"İtalyan mutfağından"}'),
  ('anagram', 'base', 'LABUZBIDO',   'buzdolabı', '{"Mutfakta bulunur"}'),
  ('anagram', 'base', 'YEMŞEİS',     'şemsiye',   '{"Yağmurda lazım"}'),
  ('anagram', 'base', 'FONTELE',     'telefon',   '{"Hepimizin elinde"}');

-- ---------- GÖVDE: BİLMECE ---------------------------------------------------
insert into questions (kind, tier, prompt, answer, accepted_answers, hints) values
  ('riddle', 'body', 'Dişleri var ama ısırmaz; her sabah saçımızı düzeltir.',
     'tarak', '{}', '{"Banyo dolabında durur"}'),
  ('riddle', 'body', 'Yaşlandıkça kısalır, karanlıkta ışık verir.',
     'mum', '{}', '{"Doğum günü pastasında da var"}'),
  ('riddle', 'body', 'Suya girmez, ıslanmaz; ama her yerde bizimle gelir.',
     'gölge', '{"golge"}', '{"Güneş çıkınca belirir"}'),
  ('riddle', 'body', 'Ne kadar çok kurutursan o kadar ıslanır.',
     'havlu', '{"banyo havlusu"}', '{"Duştan sonra kullanılır"}'),
  ('riddle', 'body', 'Adını söylediğin anda yok olur.',
     'sessizlik', '{"sessiz"}', '{"Kütüphanede çok bulunur"}');

-- ---------- ÇATI: ZOR BİLMECE ------------------------------------------------
insert into questions (kind, tier, prompt, answer, accepted_answers, hints) values
  ('riddle', 'roof', 'Her gün gelmeye çalışır ama asla bugün olamaz. Nedir?',
     'yarın', '{"yarin"}', '{"Takvimde hep bir sonraki sayfa","Dün değil, bugün değil"}'),
  ('riddle', 'roof', 'Hangi sorunun cevabı asla "evet" olamaz?',
     'uyuyor musun', '{"uyuyor musun?","uyuyormusun"}', '{"Sorunun cevabı uykudan uyandırır"}');

-- ---------- SOSYAL TAHMİN (mini oyun) ---------------------------------------
insert into questions (kind, tier, prompt) values
  ('social', null, 'Bu grupta randevusuna en çok geç kalan kim?'),
  ('social', null, 'Hesabı ödeyeceği zaman tuvalete "kaybolan" kim?'),
  ('social', null, 'Bir gün çok ünlü olacak kişi kim?'),
  ('social', null, 'Mesajı görüp günlerce cevap vermeyen kim?');
