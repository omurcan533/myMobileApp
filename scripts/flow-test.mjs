// Tam oyun akışı testi: node scripts/flow-test.mjs   (~2 dk sürer; inşa fazının 75 sn'sini bekler)
// Önce 20261019000002_state_machine.sql çalıştırılmış olmalı.
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ANSWERS = {
  ZPURAK: 'karpuz', NAKRAMA: 'makarna', LABUZBIDO: 'buzdolabı', 'YEMŞEİS': 'şemsiye', FONTELE: 'telefon',
  'Dişleri var': 'tarak', 'Yaşlandıkça kısalır': 'mum', 'Suya girmez': 'gölge',
  'Ne kadar çok kurutursan': 'havlu', 'Adını söylediğin': 'sessizlik',
  'Her gün gelmeye': 'yarın', 'Hangi sorunun': 'uyuyor musun',
};
const answerFor = (prompt) => ANSWERS[Object.keys(ANSWERS).find((k) => prompt.startsWith(k))];

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function player() {
  const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInAnonymously();
  if (error) throw new Error(error.message);
  return c;
}

const A = await player();
const B = await player();
const { data: created } = await A.rpc('create_room', { p_nickname: 'Ali', p_mode: 'quick' });
const room = created.room_id;
await B.rpc('join_room', { p_code: created.code, p_nickname: 'Veli' });
await A.rpc('start_game', { p_room: room });

// Hangi istemci hangi takımda?
const { data: ps } = await A.from('players').select('id,nickname,team_side,is_captain,is_architect').eq('room_id', room);
const nick = (n) => ps.find((p) => p.nickname === n);
const teamOf = { Ali: nick('Ali').team_side, Veli: nick('Veli').team_side };
check('İki oyuncu farklı takımlarda, ikisi de kaptan+mimar',
  teamOf.Ali !== teamOf.Veli && ps.every((p) => p.is_captain && p.is_architect));
const clientOf = { [teamOf.Ali]: A, [teamOf.Veli]: B };
const aSide = teamOf.Ali;

const phaseOf = async () => (await A.from('rooms').select('*').eq('id', room).single()).data;

// ---- SORU FAZI + DEVRE ARASI ----
let sawMinigame = false;
let stolen = false;
for (let guard = 0; guard < 40; guard++) {
  const r = await phaseOf();

  if (r.phase === 'question') {
    const { data: open } = await A.from('room_rounds').select('*').eq('room_id', room).eq('status', 'open').maybeSingle();
    if (open) {
      const ans = answerFor(open.prompt);
      if (open.kind === 'anagram') {
        await A.rpc('submit_answer', { p_round: open.id, p_body: ans });
      } else if (open.tier === 'body' && !stolen) {
        // İlk bilmecede A yanlış bilir -> parça rakibe geçmeli
        stolen = true;
        const res = await clientOf[aSide].rpc('submit_final', { p_round: open.id, p_body: 'yanlış' });
        const { data: rr } = await A.from('room_rounds').select('winner_side').eq('id', open.id).single();
        check('Bilmece yanlış -> parça rakibe devredildi', res.data?.correct === false && rr.winner_side !== aSide, `kazanan=${rr.winner_side}`);
      } else {
        await clientOf[aSide].rpc('submit_final', { p_round: open.id, p_body: ans });
      }
    }
    const early = await B.rpc('advance_game', { p_room: room });
    if (open) check('Tur çözülür çözülmez advance_game bekletiyor (3 sn gösterim)', early.data?.advanced === false);
    await sleep(3300);
    const adv = await B.rpc('advance_game', { p_room: room });
    if (adv.error) { check('advance_game', false, adv.error.message); break; }
  } else if (r.phase === 'minigame') {
    sawMinigame = true;
    const { data: mg } = await A.from('room_minigames').select('*').eq('room_id', room).order('created_at', { ascending: false }).limit(1).single();
    console.log(`   Devre arası: ${mg.kind} ${mg.prompt ? '— ' + mg.prompt : ''}`);
    // Yerel saat sunucudan farklı olabilir: sunucu "BAS!" diyene kadar tekrar dene.
    const tap = async (c) => {
      for (let i = 0; i < 40; i++) {
        const res = await c.rpc('submit_minigame_entry', { p_minigame: mg.id, p_target: nick('Veli').id });
        if (!res.error?.message?.includes('too_early')) return res;
        await sleep(250);
      }
    };
    const ea = await tap(A);
    await sleep(150); // B biraz geç dokunur
    const eb = await tap(B);
    check('Mini oyun girişleri', !ea.error && !eb.error, ea.error?.message ?? eb.error?.message);
    await B.rpc('advance_game', { p_room: room });
    const { data: done } = await A.from('room_minigames').select('status,winner_side').eq('id', mg.id).single();
    check('Mini oyun herkes girince çözüldü', done.status === 'done', JSON.stringify(done));
    await sleep(6300);
    const adv = await B.rpc('advance_game', { p_room: room });
    check('Mini oyundan sonra soru fazına dönüldü', adv.data?.phase === 'question', JSON.stringify(adv.data));
  } else break;
}
check('Devre arası mini oyun oynandı', sawMinigame);

let r = await phaseOf();
check('Tüm turlar bitince inşa fazı', r.phase === 'building', `faz=${r.phase}`);

const { data: rounds } = await A.from('room_rounds').select('status').eq('room_id', room);
check('6 tur da çözüldü', rounds.length === 6 && rounds.every((x) => x.status === 'resolved'), `${rounds.length} tur`);

// ---- İNŞA ----
const { data: myPieces } = await A.from('team_pieces').select('id').eq('room_id', room).eq('side', aSide);
const place = await A.from('canvas_items').insert({ room_id: room, side: aSide, team_piece_id: myPieces[0].id, x: 0.5, y: 0.5, scale: 1.4, rotation: 35 });
check('Mimar tuvale parça yerleştirdi', !place.error, place.error?.message);

const { data: myItems } = await A.from('canvas_items').select('id').eq('room_id', room).eq('side', aSide);
const upd = await A.from('canvas_items').update({ x: 0.2, scale: 2, rotation: 45, flip_x: true, z_index: 5 }).eq('id', myItems[0].id).select();
check('Mimar parçayı taşıyıp döndürebiliyor (kalıcı)', !upd.error && upd.data?.[0]?.rotation === 45 && upd.data?.[0]?.flip_x === true);

// Canlı yayın (Broadcast): Mimar hareket yollar, takım arkadaşı alır
const chName = `canvas-${room}-${aSide}`;
let got = null;
const listener = B.channel(chName, { config: { broadcast: { self: false } } })
  .on('broadcast', { event: 'move' }, ({ payload }) => { got = payload; });
await new Promise((res) => listener.subscribe((st) => st === 'SUBSCRIBED' && res()));
const sender = A.channel(chName);
await new Promise((res) => sender.subscribe((st) => st === 'SUBSCRIBED' && res()));
await sender.send({ type: 'broadcast', event: 'move', payload: { from: nick('Ali').id, id: myItems[0].id, tf: { x: 0.9 } } });
for (let i = 0; i < 20 && !got; i++) await sleep(100);
check('Canlı hareket yayını (Broadcast) alınıyor', got?.tf?.x === 0.9);
await A.removeChannel(sender);
await B.removeChannel(listener);

const bSide = teamOf.Veli;
const { data: bPieces } = await B.from('team_pieces').select('id').eq('room_id', room).eq('side', bSide);
const cheat = await A.from('canvas_items').insert({ room_id: room, side: bSide, team_piece_id: bPieces[0].id });
check('Rakip tuvaline yazmak engelleniyor', !!cheat.error);

const spy = await B.from('canvas_items').select('id').eq('room_id', room);
check('Rakip tuvali oylamaya kadar gizli', spy.data.length === 0);

const hijack = await B.from('canvas_items').update({ x: 0.99 }).eq('id', myItems[0].id).select();
check('Rakip tuvali değiştirilemiyor', !hijack.error && hijack.data.length === 0);

const del = await A.from('canvas_items').delete().eq('id', myItems[0].id).select();
check('Mimar parçayı tuvalden kaldırabiliyor', !del.error && del.data.length === 1);
const re = await A.from('canvas_items').insert({ room_id: room, side: aSide, team_piece_id: myPieces[0].id, x: 0.5, y: 0.5, scale: 1.4, rotation: 35 });
check('Parça yeniden yerleştirilebiliyor', !re.error, re.error?.message);

const nm = await A.rpc('set_creature_name', { p_room: room, p_name: 'Dört Gözlü Çorap Canavarı' });
check('Kaptan yaratığı isimlendirdi', !nm.error, nm.error?.message);

const tooSoon = await A.rpc('advance_game', { p_room: room });
check('İnşa süresi dolmadan voting\'e geçilmiyor', tooSoon.data?.phase === 'building');

console.log('   İnşa süresi bekleniyor (~75 sn)...');
let toVote;
for (let i = 0; i < 100; i++) {
  toVote = await B.rpc('advance_game', { p_room: room });
  if (toVote.data?.phase !== 'building') break;
  await sleep(1000);
}
check('İnşa bitti -> oylama', toVote.data?.phase === 'voting', JSON.stringify(toVote.data));

// ---- OYLAMA ----
const own = await A.rpc('cast_vote', { p_room: room, p_side: aSide });
check('Kendi takımına oy verilebiliyor', !own.error);
const seeOpp = await B.from('canvas_items').select('id').eq('room_id', room);
check('Oylamada rakip tuvali görünür', seeOpp.data.length === 1);
await A.rpc('cast_vote', { p_room: room, p_side: bSide });
const noResults = await A.rpc('get_results', { p_room: room });
check('Sonuçlar oylama bitmeden kapalı', !!noResults.error);
await B.rpc('cast_vote', { p_room: room, p_side: aSide });
const fin = await A.rpc('advance_game', { p_room: room });
check('Herkes oy verince sonuçlar', fin.data?.phase === 'results', JSON.stringify(fin.data));

const res = await A.rpc('get_results', { p_room: room });
check('get_results', !res.error, JSON.stringify(res.data ?? res.error));
check('Beraberlikte mizah şampiyonu yok (1-1 oy)', res.data?.funny_winner === null);

console.log(failed ? `\n${failed} test BAŞARISIZ` : '\nTüm testler geçti 🎉');
process.exit(failed ? 1 : 0);
