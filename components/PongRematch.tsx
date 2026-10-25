import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { supabase } from '../lib/supabase';
import { Btn, Card, Eyebrow, Muted, Text, Title, useToast } from './ui';
import { colors } from '../lib/theme';
import type { Ctx, Minigame } from '../lib/types';

type Vote = { player_id: string; yes: boolean };
type PongState = Record<string, any>;

export function PongRematch({ ctx, mg }: { ctx: Ctx; mg: Minigame }) {
 const { me, data } = ctx;
 const [votes, setVotes] = useState<Vote[]>([]);
 const [state, setState] = useState<PongState>((mg as Minigame & { pong_state?: PongState }).pong_state ?? {});
 const [busy, setBusy] = useState(false);
 const [approved, setApproved] = useState(false);
 const [now, setNow] = useState(Date.now());
 const { toast, show } = useToast();
 const deadline = mg.resolved_at ? Date.parse(mg.resolved_at) + 30000 : 0;
 const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
 const isOriginal = !(mg as Minigame & { rematch_of?: string | null }).rematch_of;
 const myVote = votes.find(v => v.player_id === me.id);
 const yes = votes.filter(v => v.yes).length;
 const needed = Math.floor(data.players.length / 2) + 1;
 const myRole = (['a1','a2','b1','b2'] as const).find(k => state[k] === me.id);
 const mySide = myRole?.startsWith('a') ? 'A' : 'B';
 const occupied = new Set(['a1','a2','b1','b2'].map(k => state['rematch_' + k] ?? state[k]));
 const candidates = useMemo(() => data.players.filter(p => p.team_side === mySide && p.id !== me.id && !occupied.has(p.id)), [data.players, mySide, state, me.id]);
 useEffect(() => {
  let alive = true;
  const refresh = async () => {
   const [v, m] = await Promise.all([
    supabase.from('pong_rematch_votes').select('player_id,yes').eq('minigame_id',mg.id),
    supabase.from('room_minigames').select('pong_state,rematch_approved_at').eq('id',mg.id).single(),
   ]);
   if (!alive) return;
   if (v.data) setVotes(v.data as Vote[]);
   if (m.data?.pong_state) setState(m.data.pong_state as PongState);
   if (m.data) setApproved(!!m.data.rematch_approved_at);
   setNow(Date.now());
  };
  void refresh();
  const timer = setInterval(refresh, 1500);
  return () => { alive = false; clearInterval(timer); };
 }, [mg.id]);
 const vote = async (value: boolean) => {
  if (busy || remaining === 0 || approved) return;
  setBusy(true);
  const { error } = await supabase.rpc('pong_vote_rematch',{ p_minigame: mg.id,p_yes:value });
  if (error) show(error.message,'error');
  else {
   setVotes(old => [...old.filter(v=>v.player_id!==me.id),{player_id:me.id,yes:value}]);
  }
  setBusy(false);
 };
 const transfer = async (target: string) => {
  if (busy || !myRole || (!approved && remaining === 0)) return;
  setBusy(true);
  const { error } = await supabase.rpc('pong_transfer_role',{p_minigame:mg.id,p_target:target});
  if (error) show(error.message,'error');
  else {
   setState(old => ({...old,['rematch_'+myRole]:target}));
   show('Rövanş rolün takım arkadaşına devredildi.','success');
  }
  setBusy(false);
 };
 const start = async () => {
  if (!me.is_host || busy || !approved) return;
  setBusy(true);
  const { error } = await supabase.rpc('pong_start_rematch',{p_minigame:mg.id});
  if (error) show(error.message,'error');
  setBusy(false);
 };
 if (!isOriginal) return null;
 return (
  <View style={{ gap: 12 }}>
   <Card accent={colors.cyan} style={{ gap: 12 }}>
    <Eyebrow color={colors.cyan}>RÖVANŞ OYLAMASI</Eyebrow>
    <Title size={22}>Bir maç daha?</Title>
    <Muted>Odadaki oyuncuların yarısından fazlası EVET derse rövanş otomatik hazırlanır. Her oyuncunun bir oyu vardır.</Muted>
    <Text style={{ color: colors.text, fontWeight: '800' }}>Evet: {yes} / {needed} gerekli · {votes.length}/{data.players.length} oy</Text>
    <Muted>Oylama için kalan süre: {remaining} sn</Muted>
    {approved ? <View style={{ gap: 8 }}><Title size={18}>🎉 Rövanş kabul edildi!</Title><Muted>Oyuncular şimdi rollerini takım arkadaşlarına devredebilir. Yönetici hazır olduğunda rövanşı başlatır.</Muted>{me.is_host && <Btn title="Rövanşı Hazırla" tone="success" disabled={busy} onPress={start} />}</View> : remaining > 0 ? (
     <View style={{ flexDirection: 'row', gap: 10 }}>
      <View style={{ flex: 1 }}><Btn title={myVote?.yes === true ? '✓ EVET' : 'EVET'} tone="success" disabled={busy} onPress={() => vote(true)} /></View>
      <View style={{ flex: 1 }}><Btn title={myVote?.yes === false ? '✓ HAYIR' : 'HAYIR'} tone="ghost" disabled={busy} onPress={() => vote(false)} /></View>
     </View>
    ) : <Muted>Oylama süresi doldu. Yeterli çoğunluk sağlanmadıysa oyun akışı devam eder.</Muted>}
   </Card>
   {myRole && (approved || remaining > 0) && (
    <Card style={{ gap: 10 }}>
     <Title size={18}>Rolü Devret</Title>
     <Muted>Rövanşta kendi {myRole.endsWith('1') ? '▲ YUKARI' : '▼ AŞAĞI'} rolünü aynı takımdan başka bir oyuncuya devredebilirsin. Bu seçim yalnızca rövanş için geçerlidir.</Muted>
     <Text style={{ color: colors.text, fontWeight: '800' }}>Mevcut rol: {data.players.find(p=>p.id===(state['rematch_'+myRole] ?? state[myRole]))?.nickname ?? 'Oyuncu'}</Text>
     {candidates.length ? candidates.map(p=>(
      <Btn key={p.id} title={p.nickname + ' oyuncusuna devret'} tone="ghost" disabled={busy} onPress={()=>transfer(p.id)} />
     )) : <Muted>Takımında rolü devredebileceğin uygun oyuncu bulunmuyor.</Muted>}
    </Card>
   )}
   {toast}
  </View>
 );
}
