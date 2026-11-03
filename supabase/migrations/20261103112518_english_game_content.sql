-- Shared game language is fixed per room; UI language stays per device.
-- Existing rooms and questions keep Turkish. No live round content is rewritten.
alter table public.rooms add column if not exists game_language text not null default 'tr' check (game_language in ('tr','en'));
alter table public.questions add column if not exists language text not null default 'tr' check (language in ('tr','en'));
alter table public.song_questions add column if not exists language text not null default 'tr' check (language in ('tr','en'));
create index if not exists questions_active_language_kind_tier on public.questions(language,kind,tier) where active;

create or replace function public.create_room_localized(p_nickname text,p_mode public.game_mode default 'quick',p_language text default 'tr') returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_language is null or p_language not in ('tr','en') then raise exception 'invalid_language'; end if;
 result:=public.create_room(p_nickname,p_mode);
 update public.rooms set game_language=p_language where id=(result->>'room_id')::uuid and host_user_id=auth.uid();
 return result;
end $$;
revoke all on function public.create_room_localized(text,public.game_mode,text) from public,anon;
grant execute on function public.create_room_localized(text,public.game_mode,text) to authenticated;

create or replace function public.set_room_game_language(p_room uuid,p_language text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;
begin
 if auth.uid() is null then raise exception 'not_authenticated'; end if;
 if p_language is null or p_language not in ('tr','en') then raise exception 'invalid_language'; end if;
 select * into r from public.rooms where id=p_room for update;
 if not found then raise exception 'room_not_found'; end if;
 if r.host_user_id<>auth.uid() then raise exception 'not_host'; end if;
 if r.phase<>'lobby' or r.closed_at is not null then raise exception 'language_locked'; end if;
 update public.rooms set game_language=p_language where id=p_room;
end $$;
revoke all on function public.set_room_game_language(uuid,text) from public,anon;
grant execute on function public.set_room_game_language(uuid,text) to authenticated;

create or replace function public.list_open_rooms_localized()
returns table(code text,mode text,phase text,player_count integer,host_nickname text,created_at timestamptz,game_language text)
language sql security definer set search_path='' as $$
 select x.*,r.game_language from public.list_open_rooms() x join public.rooms r on r.code=x.code
$$;
revoke all on function public.list_open_rooms_localized() from public,anon;
grant execute on function public.list_open_rooms_localized() to authenticated;

create or replace function public._english_math_prompt(p_prompt text) returns text
language sql immutable set search_path='' as $$
 select case p_prompt
  when 'Dünya ile Ay arası ortalama kaç bin km''dir?' then 'What is the average Earth–Moon distance in thousands of kilometres?'
  when 'Türkiye''nin telefon alan kodu kaçtır?' then 'What is Turkey''s international calling code?'
  when 'Bir günde toplam kaç dakika vardır?' then 'How many minutes are there in a day?'
  when 'Güneş Sistemi''ndeki gezegen sayısı kaçtır?' then 'How many planets are there in our Solar System?'
  when 'İnsan vücudunda ortalama kaç kemik bulunur?' then 'How many bones does an adult human usually have?'
  when 'İstanbul''un fethinin yılı kaçtır?' then 'In which year was Constantinople conquered by the Ottomans?'
  when 'Everest Tepesi deniz seviyesinden kaç metre yüksekliktedir?' then 'Before its 2020 remeasurement, what was Mount Everest''s commonly quoted height in metres?'
  when 'Işık 1 saniyede yaklaşık kaç bin km yol alır?' then 'About how many thousand kilometres does light travel in a second?'
  when 'Standart bir piyanoda toplam kaç tuş bulunur?' then 'How many keys does a standard piano have?'
  when 'Cumhuriyet''in ilan edildiği yıl kaçtır?' then 'In which year was the Republic of Turkey proclaimed?'
  when 'Dünya çevresi ekvatorda yaklaşık kaç bin km''dir?' then 'About how many thousand kilometres is Earth''s equatorial circumference?'
  when 'Bir maratonda toplam kaç tam kilometre koşulur?' then 'How many whole kilometres are in a marathon (ignoring the remaining metres)?'
  else p_prompt end
$$;
revoke all on function public._english_math_prompt(text) from public,anon,authenticated;

insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('library'),'library',array[]::text[],array['A quiet place full of books']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='library');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('computer'),'computer',array[]::text[],array['A machine with a keyboard and a screen']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='computer');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('helicopter'),'helicopter',array[]::text[],array['An aircraft with spinning blades']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='helicopter');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('microscope'),'microscope',array[]::text[],array['Makes tiny things look large']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='microscope');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('breakfast'),'breakfast',array[]::text[],array['The first meal of the day']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='breakfast');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('chocolate'),'chocolate',array[]::text[],array['A sweet made from cocoa']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='chocolate');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('theater'),'theater',array[]::text[],array['Actors perform on its stage']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='theater');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('photograph'),'photograph',array[]::text[],array['A moment captured by a camera']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='photograph');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('television'),'television',array[]::text[],array['Change its channels with a remote']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='television');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('umbrella'),'umbrella',array[]::text[],array['Keeps the rain off your head']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='umbrella');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('rainbow'),'rainbow',array[]::text[],array['An arc of colors after the rain']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='rainbow');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('butterfly'),'butterfly',array[]::text[],array['It starts life as a caterpillar']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='butterfly');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('tortoise'),'tortoise',array[]::text[],array['A slow animal with a hard shell']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='tortoise');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('tangerine'),'tangerine',array[]::text[],array['A small orange citrus fruit']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='tangerine');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('dragon'),'dragon',array[]::text[],array['A mythical fire-breathing creature']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='dragon');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('thermometer'),'thermometer',array[]::text[],array['Measures temperature']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='thermometer');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('binoculars'),'binoculars',array[]::text[],array['Help you see distant things']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='binoculars');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('staircase'),'staircase',array[]::text[],array['Takes you up one step at a time']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='staircase');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('waterfall'),'waterfall',array[]::text[],array['Water falling from a height']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='waterfall');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('peninsula'),'peninsula',array[]::text[],array['Land surrounded by water on three sides']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='peninsula');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('compass'),'compass',array[]::text[],array['Its needle points north']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='compass');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('telescope'),'telescope',array[]::text[],array['Used to look at distant stars']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='telescope');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('astronaut'),'astronaut',array[]::text[],array['A person who travels into space']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='astronaut');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('aquarium'),'aquarium',array[]::text[],array['A glass home for fish']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='aquarium');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('bicycle'),'bicycle',array[]::text[],array['Move it by pedaling']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='bicycle');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('sunflower'),'sunflower',array[]::text[],array['A tall plant with a sunny yellow flower']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='sunflower');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('cauliflower'),'cauliflower',array[]::text[],array['A vegetable with a white, flowery head']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='cauliflower');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('cucumber'),'cucumber',array[]::text[],array['A green vegetable often used in salads']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='cucumber');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('artichoke'),'artichoke',array[]::text[],array['A vegetable with overlapping leaves']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='artichoke');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('volcano'),'volcano',array[]::text[],array['A mountain that erupts with lava']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='volcano');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('engineer'),'engineer',array[]::text[],array['Designs bridges and machines']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='engineer');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('ambulance'),'ambulance',array[]::text[],array['An emergency vehicle with a siren']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='ambulance');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('refrigerator'),'refrigerator',array[]::text[],array['Keeps your food cold']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='refrigerator');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('sandwich'),'sandwich',array[]::text[],array['A filling between slices of bread']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='sandwich');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('keyboard'),'keyboard',array[]::text[],array['You type on its keys']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='keyboard');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('backpack'),'backpack',array[]::text[],array['Carry it on your back']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='backpack');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('snowflake'),'snowflake',array[]::text[],array['A tiny ice crystal falling from a cloud']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='snowflake');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('lighthouse'),'lighthouse',array[]::text[],array['Guides ships away from danger']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='lighthouse');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('pineapple'),'pineapple',array[]::text[],array['A tropical fruit with a spiky crown']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='pineapple');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('dinosaur'),'dinosaur',array[]::text[],array['A prehistoric animal']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='dinosaur');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('suitcase'),'suitcase',array[]::text[],array['Pack your clothes in it for a trip']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='suitcase');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('jellyfish'),'jellyfish',array[]::text[],array['A sea creature with a soft body and tentacles']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='jellyfish');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('kangaroo'),'kangaroo',array[]::text[],array['An animal that carries its young in a pouch']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='kangaroo');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('crocodile'),'crocodile',array[]::text[],array['A large reptile with powerful jaws']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='crocodile');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('magnet'),'magnet',array[]::text[],array['Attracts iron']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='magnet');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('pancake'),'pancake',array[]::text[],array['A flat breakfast treat made in a pan']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='pancake');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('treasure'),'treasure',array[]::text[],array['Something valuable hidden by a pirate']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='treasure');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'anagram'::public.question_kind,'base'::public.question_tier,public._scramble('whisper'),'whisper',array[]::text[],array['Speak so quietly that few can hear']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='anagram' and answer='whisper');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have teeth but never bite. I tidy your hair. What am I?','comb',array['a comb']::text[],array['Look in the bathroom']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='comb');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I get shorter as I get older and give light in the dark. What am I?','candle',array['a candle']::text[],array['You may see me on a birthday cake']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='candle');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I follow you in sunlight but never get wet when I cross water. What am I?','shadow',array['a shadow','your shadow']::text[],array['You cannot pick me up']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='shadow');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'The more I dry, the wetter I become. What am I?','towel',array['a towel','bath towel']::text[],array['Use me after a shower']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='towel');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'Say my name and I disappear. What am I?','silence',array[]::text[],array['Often requested in libraries']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='silence');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I show everyone''s face but have no face of my own. What am I?','mirror',array['a mirror']::text[],array['Made with glass']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='mirror');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I answer when you call, but I have no mouth. Mountains are my home. What am I?','echo',array['an echo']::text[],array['Try shouting in a valley']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='echo');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have an eye but cannot see. I pull a thread behind me. What am I?','needle',array['a needle']::text[],array['A tailor uses me']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='needle');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have two blades but cannot fight. I cut paper and fabric. What am I?','scissors',array['a pair of scissors']::text[],array['Also used by hairdressers']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='scissors');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have hands but cannot hold things, and a face but cannot smile. What am I?','clock',array['a clock','watch','a watch']::text[],array['I tell you something all day']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='clock');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I fall from the sky, turn the world white and melt in the sunshine. What am I?','snow',array[]::text[],array['A sign of winter']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='snow');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I shine at night with borrowed light and change shape through the month. What am I?','moon',array['the moon']::text[],array['Earth''s natural satellite']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='moon');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'No doors, no windows, but yellow and white are hidden inside. What am I?','egg',array['an egg']::text[],array['A common breakfast food']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='egg');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have steps but never walk. I take people both up and down. What am I?','stairs',array['staircase','a staircase']::text[],array['Between floors']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='stairs');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'My needle points the same way and helps lost travelers. What am I?','compass',array['a compass']::text[],array['Find north']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='compass');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I am empty until you breathe into me. Too much air and I burst. What am I?','balloon',array['a balloon']::text[],array['A party decoration']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='balloon');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have many colors and appear after rain, but no one can touch me. What am I?','rainbow',array['a rainbow']::text[],array['A colorful arc']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='rainbow');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'People cry when they cut me, though I never make a sound. What am I?','onion',array['an onion']::text[],array['Used in cooking']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='onion');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have mountains without rocks and oceans without water. What am I?','map',array['a map','atlas','an atlas']::text[],array['A world on paper']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='map');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have leaves but am not a tree, and a spine but no bones. What am I?','book',array['a book']::text[],array['Read me']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='book');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I cannot be seen, yet I make leaves dance and push sailing boats. What am I?','wind',array['the wind']::text[],array['I can become a storm']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='wind');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I have eight legs and build my own web. What am I?','spider',array['a spider']::text[],array['Not an insect']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='spider');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I visit flowers and make something sweet in a hive. What am I?','bee',array['a bee','honeybee','honey bee']::text[],array['Think of honey']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='bee');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'body'::public.question_tier,'I sleep by day, fly by night and hang upside down, but I am not a bird. What am I?','bat',array['a bat']::text[],array['A flying mammal']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='bat');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the largest ocean on Earth?','pacific',array['pacific ocean','the pacific ocean']::text[],array['Its name means peaceful']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='pacific');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'Who painted the Mona Lisa?','leonardo da vinci',array['da vinci','leonardo','davinci']::text[],array['An Italian Renaissance artist']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='leonardo da vinci');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'Which element has atomic number 1?','hydrogen',array[]::text[],array['The most abundant element in the universe']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='hydrogen');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the chemical symbol for gold?','au',array[]::text[],array['From the Latin word aurum']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='au');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'How many keys does a standard piano have?','88',array['eighty eight']::text[],array['52 white and 36 black']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='88');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'How many pieces does each player start with in chess?','16',array['sixteen']::text[],array['Eight pawns and eight others']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='16');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'How many bones does an adult human usually have?','206',array['two hundred six','two hundred and six']::text[],array['Babies start with more']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='206');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the tallest land animal?','giraffe',array['a giraffe']::text[],array['A very long neck']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='giraffe');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'Who was the first person to walk on the Moon?','neil armstrong',array['armstrong']::text[],array['Apollo 11, 1969']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='neil armstrong');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the coldest continent?','antarctica',array[]::text[],array['At the South Pole']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='antarctica');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the sum of a triangle''s interior angles, in degrees?','180',array['one hundred eighty','180 degrees']::text[],array['Two right angles']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='180');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'How many seconds are there in an hour?','3600',array['three thousand six hundred']::text[],array['60 times 60']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='3600');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What positive number multiplied by itself makes 144?','12',array['twelve']::text[],array['A dozen']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='12');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'Which planet is known as the Red Planet?','mars',array[]::text[],array['Fourth from the Sun']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='mars');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the largest planet in our Solar System?','jupiter',array[]::text[],array['A gas giant with a Great Red Spot']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='jupiter');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'How many sides does a hexagon have?','6',array['six']::text[],array['One more than a pentagon']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='6');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What gas do plants take in for photosynthesis?','carbon dioxide',array['co2']::text[],array['Its formula contains one carbon atom']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='carbon dioxide');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'What is the fastest land animal?','cheetah',array['a cheetah']::text[],array['A spotted big cat']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='cheetah');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'At sea level, at what Celsius temperature does pure water boil?','100',array['100 degrees','one hundred']::text[],array['Three digits']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='100');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'riddle'::public.question_kind,'roof'::public.question_tier,'Which instrument is used to measure temperature?','thermometer',array['a thermometer']::text[],array['Can be used to check for a fever']::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='riddle' and answer='thermometer');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who is most likely to arrive late for a date?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who is most likely to arrive late for a date?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who would become famous one day?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who would become famous one day?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who reads a message and takes days to reply?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who reads a message and takes days to reply?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who changes the subject when they realize they are losing an argument?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who changes the subject when they realize they are losing an argument?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who would ask the group to write a reply to a message?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who would ask the group to write a reply to a message?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who says they are not curious, then checks their ex''s profile?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who says they are not curious, then checks their ex''s profile?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who invents the most creative excuse to cancel plans?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who invents the most creative excuse to cancel plans?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who stays quiet in public but sends the sharpest comments privately?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who stays quiet in public but sends the sharpest comments privately?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who notices every detail while claiming not to be jealous?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who notices every detail while claiming not to be jealous?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who asks for advice and then does whatever they wanted anyway?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who asks for advice and then does whatever they wanted anyway?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who says nothing is wrong when they are upset?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who says nothing is wrong when they are upset?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who would accidentally restart an argument?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who would accidentally restart an argument?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who acts differently around their crush?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who acts differently around their crush?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who pretends they are only listening while collecting gossip?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who pretends they are only listening while collecting gossip?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who would say they discovered a friend before that friend became famous?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who would say they discovered a friend before that friend became famous?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who gets caught online after ignoring a message?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who gets caught online after ignoring a message?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who gives advice they would never follow?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who gives advice they would never follow?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who blames the connection after losing a game?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who blames the connection after losing a game?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who notices a secret crush first?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who notices a secret crush first?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who turns meeting a friend''s date into a job interview?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who turns meeting a friend''s date into a job interview?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who keeps screenshots ready as evidence in an argument?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who keeps screenshots ready as evidence in an argument?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who says leave me out of it, then asks for every detail?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who says leave me out of it, then asks for every detail?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who apologizes by buying food?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who apologizes by buying food?');
insert into public.questions(kind,tier,prompt,answer,accepted_answers,hints,language)
select 'social'::public.question_kind,null,'Who creates more suspicion by deleting an accidental message?',null,array[]::text[],array[]::text[],'en'
where not exists(select 1 from public.questions where language='en' and kind='social' and prompt='Who creates more suspicion by deleting an accidental message?');
insert into public.song_questions(artist,title,genre,language) select 'The Beatles','Hey Jude','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='The Beatles' and title='Hey Jude');
insert into public.song_questions(artist,title,genre,language) select 'Queen','Bohemian Rhapsody','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='Queen' and title='Bohemian Rhapsody');
insert into public.song_questions(artist,title,genre,language) select 'Adele','Hello','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Adele' and title='Hello');
insert into public.song_questions(artist,title,genre,language) select 'ABBA','Dancing Queen','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='ABBA' and title='Dancing Queen');
insert into public.song_questions(artist,title,genre,language) select 'Michael Jackson','Billie Jean','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Michael Jackson' and title='Billie Jean');
insert into public.song_questions(artist,title,genre,language) select 'Ed Sheeran','Shape of You','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Ed Sheeran' and title='Shape of You');
insert into public.song_questions(artist,title,genre,language) select 'Taylor Swift','Shake It Off','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Taylor Swift' and title='Shake It Off');
insert into public.song_questions(artist,title,genre,language) select 'Coldplay','Viva la Vida','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='Coldplay' and title='Viva la Vida');
insert into public.song_questions(artist,title,genre,language) select 'Oasis','Wonderwall','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='Oasis' and title='Wonderwall');
insert into public.song_questions(artist,title,genre,language) select 'The Police','Every Breath You Take','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='The Police' and title='Every Breath You Take');
insert into public.song_questions(artist,title,genre,language) select 'Elton John','Rocket Man','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Elton John' and title='Rocket Man');
insert into public.song_questions(artist,title,genre,language) select 'John Lennon','Imagine','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='John Lennon' and title='Imagine');
insert into public.song_questions(artist,title,genre,language) select 'David Bowie','Space Oddity','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='David Bowie' and title='Space Oddity');
insert into public.song_questions(artist,title,genre,language) select 'Nirvana','Smells Like Teen Spirit','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='Nirvana' and title='Smells Like Teen Spirit');
insert into public.song_questions(artist,title,genre,language) select 'The Rolling Stones','Paint It Black','rock','en' where not exists(select 1 from public.song_questions where language='en' and artist='The Rolling Stones' and title='Paint It Black');
insert into public.song_questions(artist,title,genre,language) select 'Whitney Houston','I Will Always Love You','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Whitney Houston' and title='I Will Always Love You');
insert into public.song_questions(artist,title,genre,language) select 'Beyonce','Halo','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Beyonce' and title='Halo');
insert into public.song_questions(artist,title,genre,language) select 'Bruno Mars','Just the Way You Are','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Bruno Mars' and title='Just the Way You Are');
insert into public.song_questions(artist,title,genre,language) select 'Lady Gaga','Bad Romance','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Lady Gaga' and title='Bad Romance');
insert into public.song_questions(artist,title,genre,language) select 'Katy Perry','Firework','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Katy Perry' and title='Firework');
insert into public.song_questions(artist,title,genre,language) select 'Dua Lipa','Levitating','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Dua Lipa' and title='Levitating');
insert into public.song_questions(artist,title,genre,language) select 'The Weeknd','Blinding Lights','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='The Weeknd' and title='Blinding Lights');
insert into public.song_questions(artist,title,genre,language) select 'Sia','Chandelier','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Sia' and title='Chandelier');
insert into public.song_questions(artist,title,genre,language) select 'Rihanna','Diamonds','pop','en' where not exists(select 1 from public.song_questions where language='en' and artist='Rihanna' and title='Diamonds');

CREATE OR REPLACE FUNCTION public.start_game(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ('base'::question_tier, case v_room.mode::text when 'quick' then 4 when 'standard' then 6 when 'custom' then 6 else 8 end),
      ('body'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 5 when 'custom' then 5 else 7 end),
      ('roof'::question_tier, case v_room.mode::text when 'quick' then 2 when 'standard' then 3 when 'custom' then 3 else 5 end)
    ) as t(tier, cnt)
  loop
    if (v_plan.tier = 'base' and not ('anagram' = any(v_room.selected_games)))
       or (v_plan.tier <> 'base' and not ('riddle' = any(v_room.selected_games))) then
      continue;
    end if;
    insert into room_rounds (room_id, idx, tier, kind, question_id, prompt, hints, piece_id)
    select p_room, v_idx + q.rn::int, v_plan.tier, q.kind, q.id, q.prompt, q.hints,
           (select pc.id from pieces pc where pc.tier = v_plan.tier and q.id is not null order by random() limit 1)
      from (
        select qq.*, row_number() over (order by random()) - 1 as rn
          from questions qq
         where qq.active and qq.language = v_room.game_language
           and qq.tier = v_plan.tier
           and qq.kind = case when v_plan.tier = 'base' then 'anagram'::question_kind else 'riddle'::question_kind end
      ) q
     where q.rn < v_plan.cnt;

    select count(*) into v_idx from room_rounds where room_id = p_room;
  end loop;

  if v_idx = 0 then
    if public.next_selected_minigame_kind(p_room) is not null then
      perform public._start_minigame(p_room);
      return;
    end if;
    raise exception 'no_questions';
  end if;

  update rooms
     set phase = 'question',
         phase_started_at = now(),
         building_ready_a = false,
         building_ready_b = false
    where id = p_room;

  select id into v_first from room_rounds where room_id = p_room and idx = 0;
  perform _open_round(v_first);
end $function$
;

CREATE OR REPLACE FUNCTION public._start_minigame(p_room uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_language text;
  v_kind minigame_kind;
  v_prompt text := null;
  v_target int := null;
  v_math record;
  v_song record;
  v_new_id uuid;
begin
  select game_language into v_language from public.rooms where id=p_room;
  if v_language is null then raise exception 'room_not_found'; end if;
  select public.next_selected_minigame_kind(p_room) into v_kind;
  if v_kind is null then raise exception 'no_minigames_selected'; end if;

  if v_kind = 'social_guess' then
    select q.prompt into v_prompt from questions q where q.kind='social' and q.active and q.language=v_language
      and not exists(select 1 from room_minigames m where m.room_id=p_room and m.kind='social_guess' and m.prompt=q.prompt)
      order by random() limit 1;
    if v_prompt is null then select prompt into v_prompt from questions where kind='social' and active and language=v_language order by random() limit 1; end if;
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

    v_prompt := case when v_language='en' then public._english_math_prompt(v_math.p) else v_math.p end;
    v_target := v_math.a;
  end if;

  if v_kind = 'song_complete' then
    select artist,title,genre into v_song from public.song_questions where language=v_language order by random() limit 1;
    v_prompt := v_song.artist || ' · ' || v_song.genre || case when v_language='en' then E'\nComplete the song title: ' else E'\nŞarkının adını tamamla: ' end ||
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

CREATE OR REPLACE FUNCTION public._start_math_followup(p_minigame uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare m room_minigames; q record; next_id uuid; total int; n int; v_language text;
begin
 select * into m from room_minigames where id=p_minigame for update;
 if not found or m.kind<>'math_guess' or m.status<>'done' then return false; end if;
 select game_language into v_language from public.rooms where id=m.room_id;
 total:=coalesce((m.math_state->>'count')::int,1); n:=coalesce((m.math_state->>'index')::int,1);
 if n>=total then return false; end if;
 if exists(select 1 from room_minigames where room_id=m.room_id and created_at>m.created_at) then return false; end if;
 select case when v_language='en' then public._english_math_prompt(t.p) else t.p end as p,t.a into q from (values
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
    ) as t(p, a) where not coalesce(m.math_state->'prompts','[]'::jsonb) ? (case when v_language='en' then public._english_math_prompt(t.p) else t.p end) order by random() limit 1;
 if not found then raise exception 'no_unused_math_questions'; end if;
 insert into room_minigames(room_id,kind,prompt,status,starts_at,math_state,created_at)
 values(m.room_id,'math_guess',q.p,'live',null,jsonb_build_object('count',total,'index',n+1,'prompts',coalesce(m.math_state->'prompts','[]'::jsonb)||jsonb_build_array(q.p)),clock_timestamp()) returning id into next_id;
 insert into private_minigame_answers(minigame_id,answer) values(next_id,q.a);
 update rooms set phase='minigame',phase_started_at=now(),phase_ends_at=null where id=m.room_id;
 return true;
end $function$
;

notify pgrst,'reload schema';
