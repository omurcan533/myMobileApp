// Uçtan uca duman testi: node scripts/smoke-test.mjs
// İki anonim oyuncu ile oda kurar, oyunu başlatır, anagram turunu çözer.
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const ANSWERS = { ZPURAK: 'karpuz', NAKRAMA: 'makarna', LABUZBIDO: 'buzdolabı', 'YEMŞEİS': 'şemsiye', FONTELE: 'telefon' };

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

async function player() {
  // Node 20'de yerel WebSocket yok; testte Realtime kullanılmadığı için sahte transport yeterli.
  const c = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: class {} },
  });
  const { error } = await c.auth.signInAnonymously();
  if (error) throw new Error('Anonim giriş başarısız: ' + error.message + ' (Anonymous sign-ins açık mı?)');
  return c;
}

const a = await player();
const b = await player();
check('Anonim oturum (2 oyuncu)', true);

const pieces = await a.from('pieces').select('id');
check('pieces okunabiliyor (seed yüklü)', !pieces.error && pieces.data.length === 14, `${pieces.data?.length ?? pieces.error?.message} parça`);

const q = await a.from('questions').select('answer');
check('questions istemciye KAPALI', !q.error && q.data.length === 0);

const created = await a.rpc('create_room', { p_nickname: 'Ali', p_mode: 'quick' });
check('create_room', !created.error, created.error?.message ?? `kod=${created.data?.code}`);
const { room_id, code } = created.data;

const joined = await b.rpc('join_room', { p_code: code.toLowerCase(), p_nickname: 'Veli' });
check('join_room', !joined.error, joined.error?.message);

const early = await b.rpc('start_game', { p_room: room_id });
check('start_game host olmayana reddediliyor', early.error?.message?.includes('not_host'));

const started = await a.rpc('start_game', { p_room: room_id });
check('start_game', !started.error, started.error?.message);

const rounds = await a.from('room_rounds').select('*').eq('room_id', room_id).order('idx');
check('Turlar görünüyor (yalnızca açık olan)', !rounds.error && rounds.data.length === 1 && rounds.data[0].status === 'open',
  `${rounds.data?.length} tur görünür`);
const r0 = rounds.data[0];
console.log(`   İlk soru: ${r0.prompt} (${r0.kind}/${r0.tier})`);

const wrong = await a.rpc('submit_answer', { p_round: r0.id, p_body: 'yanlışcevap' });
check('Yanlış cevap -> correct:false + cooldown', wrong.data?.correct === false && !!wrong.data?.locked_until, wrong.error?.message);

const locked = await a.rpc('submit_answer', { p_round: r0.id, p_body: ANSWERS[r0.prompt] });
check('Cooldown içinde yeni cevap reddediliyor', locked.error?.message?.includes('locked'));

const right = await b.rpc('submit_answer', { p_round: r0.id, p_body: (ANSWERS[r0.prompt] ?? '').toUpperCase() });
check('Doğru cevap (büyük harf/Türkçe normalize)', right.data?.correct === true, right.error?.message);

const after = await a.from('room_rounds').select('status,winner_side,revealed_answer').eq('id', r0.id).single();
check('Tur çözüldü, cevap açıldı', after.data?.status === 'resolved' && !!after.data?.winner_side, JSON.stringify(after.data));

const teams = await a.from('room_teams').select('side,score').eq('room_id', room_id).order('side');
check('Kazanan takıma puan yazıldı', teams.data?.some((t) => t.score === 1), JSON.stringify(teams.data));

const inv = await a.from('team_pieces').select('side,source').eq('room_id', room_id);
check('Parça envantere eklendi', inv.data?.length === 1, JSON.stringify(inv.data));

console.log(failed ? `\n${failed} test BAŞARISIZ` : '\nTüm testler geçti 🎉');
process.exit(failed ? 1 : 0);
