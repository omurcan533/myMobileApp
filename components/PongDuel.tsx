import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { supabase } from '../lib/supabase';
import { Card, Eyebrow, Muted, Text, Title, Tap } from './ui';
import { colors, alpha } from '../lib/theme';
import type { Ctx, Minigame } from '../lib/types';

type State = {
 a1: string; a2: string; b1: string; b2: string;
 ay: number; by: number;
 x: number; y: number; scoreA: number; scoreB: number; savesA?: number; savesB?: number; goalsByPlayer?: Record<string, number>;
};
const MAX_W = 320;
const H = 220;
const PAD = 44;
const emojiList = ['👏', '🔥', '😂', '😱', '❤️'];

export function PongDuel({ ctx, mg, live }: { ctx: Ctx; mg: Minigame; live: boolean }) {
 const { data, me } = ctx;
 const { width: screenWidth } = useWindowDimensions();
 const W = Math.min(MAX_W, Math.max(220, screenWidth - 94));
 const [state, setState] = useState<State | null>((mg as Minigame & { pong_state?: State }).pong_state ?? null);
 const [reaction, setReaction] = useState<{ emoji: string; id: number } | null>(null);
 const [goal, setGoal] = useState<{ side: 'A' | 'B'; score: number } | null>(null);
 const lastScores = useRef<{ a: number; b: number } | null>(null);
 const [clock, setClock] = useState(Date.now());
 const holding = useRef<ReturnType<typeof setInterval> | null>(null);
 const reactionId = useRef(0);
 const cheerChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
 const countdown = live && mg.starts_at ? Math.max(0, Math.ceil((Date.parse(mg.starts_at) - clock) / 1000)) : 0;
 const active = live && !!mg.starts_at && countdown === 0 && !data.room.paused;
 const isHost = me.is_host;
 const mySlot = state ? (['a1','a2','b1','b2'] as const).find((k) => state[k] === me.id) : undefined;
 const myDirection = mySlot ? (mySlot.endsWith('1') ? -1 : 1) : null;
 const players = useMemo(() => data.players, [data.players]);
 const playerName = (id?: string) => players.find((p) => p.id === id)?.nickname ?? 'Oyuncu';
 useEffect(() => {
  setState((mg as Minigame & { pong_state?: State }).pong_state ?? null);
 }, [mg.id, (mg as Minigame & { pong_state?: State }).pong_state]);
 useEffect(() => {
  const timer = setInterval(() => setClock(Date.now()), 150);
  return () => clearInterval(timer);
 }, []);
 useEffect(() => { lastScores.current = null; setGoal(null); }, [mg.id]);
 useEffect(() => {
  if (!state) return;
  const previous = lastScores.current;
  if (previous) {
   if (state.scoreA > previous.a) setGoal({ side: 'A', score: state.scoreA });
   else if (state.scoreB > previous.b) setGoal({ side: 'B', score: state.scoreB });
  }
  lastScores.current = { a: state.scoreA, b: state.scoreB };
 }, [state?.scoreA, state?.scoreB, mg.id]);
 useEffect(() => {
  if (!goal) return;
  const timer = setTimeout(() => setGoal(null), 2200);
  return () => clearTimeout(timer);
 }, [goal]);
 useEffect(() => {
  const channel = supabase.channel('pong-' + mg.id);
  channel.on('broadcast', { event: 'cheer' }, ({ payload }) => {
   setReaction({ emoji: String(payload?.emoji ?? '👏'), id: ++reactionId.current });
  });
  cheerChannel.current = channel;
  channel.subscribe();
  return () => { cheerChannel.current = null; void supabase.removeChannel(channel); };
 }, [mg.id]);
 useEffect(() => {
  if (!live || !mg.starts_at) return;
  let inFlight = false;
  const poll = setInterval(async () => {
   if (inFlight) return;
   inFlight = true;
   try {
    if (isHost) {
     const { data: updated } = await supabase.rpc('pong_tick', { p_minigame: mg.id });
     if (updated) setState(updated as State);
    } else {
     const { data: updated } = await supabase.from('room_minigames').select('pong_state').eq('id', mg.id).single();
     if (updated?.pong_state) setState(updated.pong_state as State);
    }
   } finally { inFlight = false; }
  }, isHost ? 120 : 220);
  return () => clearInterval(poll);
 }, [live, !!mg.starts_at, isHost, mg.id]);
 const release = () => {
  if (holding.current) clearInterval(holding.current);
  holding.current = null;
 };
 useEffect(() => release, []);
 const move = (direction: number) => {
  if (!active || myDirection !== direction) return;
  void supabase.rpc('pong_input', { p_minigame: mg.id, p_direction: direction });
 };
 const hold = (direction: number) => {
  if (myDirection !== direction) return;
  release();
  move(direction);
  holding.current = setInterval(() => move(direction), 110);
 };
 const cheer = (emoji: string) => {
  setReaction({ emoji, id: ++reactionId.current });
  void cheerChannel.current?.send({ type: 'broadcast', event: 'cheer', payload: { emoji } });
 };
 const scoreA = state?.scoreA ?? 0;
 const scoreB = state?.scoreB ?? 0;
 const goalLeaders = Object.entries(state?.goalsByPlayer ?? {}).filter(([,n])=>n>0).sort((a,b)=>b[1]-a[1]);
 const topGoals = goalLeaders[0]?.[1] ?? 0;
 const topScorers = goalLeaders.filter(([,n])=>n===topGoals);
 return (
  <View style={{ gap: 12 }}>
   <Card accent={colors.cyan} style={{ gap: 10 }}>
    <Eyebrow color={colors.cyan}>2'YE 2 · CANLI PONG DÜELLOSU</Eyebrow>
    <View style={styles.score}>
     <Text style={styles.teamA}>TAKIM A</Text>
     <Title size={30}>{scoreA} : {scoreB}</Title>
     <Text style={styles.teamB}>TAKIM B</Text>
    </View>
    <Muted style={{ textAlign: 'center' }}>Tek çubuk, iki oyuncu! Biri yukarı, diğeri aşağı yönlendirir. İlk 5 gol kazanır.</Muted>
    {countdown > 0 && <View style={styles.countdown}><Text style={styles.countdownNumber}>{countdown}</Text><Muted style={{ textAlign: 'center' }}>Hazır ol! Maç başlıyor…</Muted></View>}
    {goal && <View style={[styles.goalBanner, { backgroundColor: alpha(goal.side === 'A' ? colors.cyan : colors.gold, 0.22), borderColor: goal.side === 'A' ? colors.cyan : colors.gold }]}><Text style={styles.goalText}>⚽ GOOOL! TAKIM {goal.side} · {goal.score}. GOL 🎉</Text></View>}
    {state ? (
     <View style={[styles.board, { width: W }]}>
      <View style={[styles.middle, { left: W / 2 }]} />
      <View style={[styles.paddle, styles.left, { top: state.ay * H - PAD / 2, backgroundColor: colors.cyan }]} />
      <View style={[styles.paddle, styles.right, { top: state.by * H - PAD / 2, backgroundColor: colors.gold }]} />
      <View style={[styles.ball, { left: state.x * W - 6, top: state.y * H - 6 }]} />
     </View>
    ) : <Muted>Maç hazırlanıyor…</Muted>}
    <View style={styles.teams}>
     <View style={{ flex: 1 }}><Text style={styles.teamA}>▲ {playerName(state?.a1)}</Text><Text style={styles.teamA}>▼ {playerName(state?.a2)}</Text></View>
     <View style={{ flex: 1, alignItems: 'flex-end' }}><Text style={styles.teamB}>▲ {playerName(state?.b1)}</Text><Text style={styles.teamB}>▼ {playerName(state?.b2)}</Text></View>
    </View>
    {!live && state && <View style={styles.results}><Title size={18}>⚽ Gol Kralı</Title>{topScorers.length ? <Text style={styles.starText}>{topScorers.map(([id])=>playerName(id)).join(' · ')} — {topGoals} gol katkısı</Text> : <Muted>Oyuncu bazında kaydedilmiş gol katkısı yok.</Muted>}<Muted>Gol, golü atan takımın son çubuk temasındaki yönlendirici oyuncuya yazılır; ortak kontrol nedeniyle bu bir katkı istatistiğidir.</Muted><Title size={18}>🏅 Maçın Savunma Yıldızları</Title><Muted>Takım A: {state.savesA ?? 0} kurtarış · Takım B: {state.savesB ?? 0} kurtarış</Muted><Text style={styles.starText}>{(state.savesA ?? 0) === (state.savesB ?? 0) ? 'İki takım da savunmada eşit!' : (state.savesA ?? 0) > (state.savesB ?? 0) ? `Takım A savunma yıldızları: ${playerName(state.a1)} ve ${playerName(state.a2)}` : `Takım B savunma yıldızları: ${playerName(state.b1)} ve ${playerName(state.b2)}`}</Text><Muted>Çubuk ortak kontrol edildiği için kurtarışlar takım bazında sayılır.</Muted></View>}
    {mySlot && active ? (
     <View style={{ gap: 10 }}>
      <Title size={17} style={{ textAlign: 'center' }}>{myDirection === -1 ? 'Sen YUKARI oyuncususun ▲' : 'Sen AŞAĞI oyuncususun ▼'}</Title>
      <View style={styles.controls}>
       <Tap onPressIn={() => hold(myDirection!)} onPressOut={release} onPress={() => move(myDirection!)} style={styles.control}>
        <Text style={styles.controlText}>{myDirection === -1 ? '▲  YUKARI' : '▼  AŞAĞI'}</Text>
       </Tap>
      </View>
     </View>
    ) : <Muted style={{ textAlign: 'center' }}>{countdown > 0 ? 'Hazırlan! Geri sayım bitince kontroller açılacak.' : live ? 'Seyircisin! Arkadaşlarını destekle.' : 'Maç tamamlandı.'}</Muted>}
   </Card>
   <Card style={{ gap: 10 }}>
    <Title size={17}>Canlı Tepkiler {reaction?.emoji ?? ''}</Title>
    <View style={styles.reactions}>
     {emojiList.map((emoji) => <Tap key={emoji} onPress={() => cheer(emoji)} style={styles.reaction}><Text style={{ fontSize: 25 }}>{emoji}</Text></Tap>)}
    </View>
   </Card>
  </View>
 );
}
const styles = StyleSheet.create({
 score: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
 countdown: { alignItems: 'center', gap: 5, padding: 16, borderRadius: 16, backgroundColor: alpha(colors.cyan, 0.15) },
 countdownNumber: { fontSize: 66, fontWeight: '900', color: colors.cyan },
 goalBanner: { borderWidth: 2, borderRadius: 14, padding: 14, alignItems: 'center' },
 goalText: { fontSize: 20, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
 results: { alignItems: 'center', gap: 7, padding: 16, borderRadius: 14, backgroundColor: alpha(colors.gold, 0.12) },
 starText: { color: colors.gold, fontSize: 15, fontWeight: '800', textAlign: 'center' },
 teamA: { color: colors.cyan, fontWeight: '800', fontSize: 13 },
 teamB: { color: colors.gold, fontWeight: '800', fontSize: 13 },
 board: { height: H, alignSelf: 'center', backgroundColor: '#081729', borderWidth: 2, borderColor: '#52647D', borderRadius: 10, overflow: 'hidden' },
 middle: { position: 'absolute', height: H, borderLeftWidth: 2, borderStyle: 'dashed', borderColor: alpha('#FFFFFF', 0.3) },
 paddle: { position: 'absolute', width: 9, height: PAD, borderRadius: 5 },
 left: { left: 8 }, right: { right: 8 },
 ball: { position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: '#FFFFFF' },
 teams: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
 controls: { flexDirection: 'row', gap: 10 },
 control: { flex: 1, backgroundColor: '#193C60', borderColor: colors.cyan, borderWidth: 1, borderRadius: 14, alignItems: 'center', paddingVertical: 22 },
 controlText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
 reactions: { flexDirection: 'row', justifyContent: 'space-around', gap: 6 },
 reaction: { backgroundColor: '#203148', padding: 8, borderRadius: 12 },
});
