import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CanvasBoard } from '../components/Canvas';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Float, GemIcon, Muted, Pulse, Reveal, RoomExitButton, Screen, SectionLabel, Title, Text, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { teamMascot } from '../lib/art';
import { recordGame } from '../lib/profile';
import { alpha, colors, gradients, teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, GameResults, Side } from '../lib/types';

/** Oyun verilerinden kişiye özel, şakacı final yorumları üretir. Harici yapay zekâ servisi kullanmaz. */
function playerFinalComment(
  player: { id: string; nickname: string; team_side: Side | null },
  index: number,
  results: GameResults,
  friendScores: { player_id: string; correct: number; attempts: number }[],
  ageScores: { player_id: string; correct: number; total: number }[],
): string {
  const friend = friendScores.find(p => p.player_id === player.id);
  const age = ageScores.find(p => p.player_id === player.id);
  const team = player.team_side ? results.teams[player.team_side] : null;
  const winner = player.team_side !== null && player.team_side === results.official_winner;
  const seed = [...player.id].reduce((n, ch) => n + ch.charCodeAt(0), index);
  const teasing = [
    'Özgüvenin tam, sonuçlar biraz çekingen. Ama sahne enerjin tartışılmaz.',
    'Stratejin o kadar gizemliydi ki rakip takım bile ne yaptığını çözemedi.',
    'Kaos üretiminde doktora yapmış gibisin. Neyse ki eğlence puanın yüksek.',
    'Bazen oyunu değil, oyun seni oynadı. Yine de masaya renk kattın.',
    'Planların sürpriz yumurta gibi: İçinden ne çıkacağı hiç belli olmuyor.',
  ];
  const praise = [];
  if (winner) praise.push('Ama kazanan taraftasın; skor tabelası senin adına konuşuyor.');
  if (friend && friend.attempts > 0 && friend.correct === friend.attempts) praise.push('Arkadaşlarını kusursuz tanıyorsun, buna laf yok.');
  else if (friend && friend.correct > 0) praise.push(`Dostluk hafızasında ${friend.correct}/${friend.attempts} yaptın; hiç fena değil.`);
  if (age && age.total > 0 && age.correct === age.total) praise.push('Yaş tahmininde tam isabet: dedektiflik rozeti senin.');
  if (!praise.length && team && team.pieces > 0) praise.push(`Takımın ${team.pieces} parça topladı; ortada emek var.`);
  return teasing[seed % teasing.length] + ' ' + (praise[0] ?? 'Bu turun asıl başarısı herkesi güldürmen.');
}

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog, exitRoom } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 36 - 14) / 2; // sütun genişliği
  const [res, setRes] = useState<GameResults | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [friendScores,setFriendScores]=useState<{player_id:string;nickname:string;correct:number;attempts:number}[]>([]);
  const [ageScores,setAgeScores]=useState<{player_id:string;correct:number;total:number}[]>([]);
  const { toast, show } = useToast();

  const leave = async () => {
    try {
      await exitRoom();
    } catch (error) {
      show((error as Error).message, 'error');
    }
  };

  useEffect(() => {
    let active = true;
    let revealTimer: ReturnType<typeof setTimeout> | undefined;
    api.results(data.room.id).then((r) => {
      if (!active) return;
      setRevealing(true);
      soundFx.drumRoll();
      revealTimer = setTimeout(() => {
        if (!active) return;
        setRes(r);
        setRevealing(false);
        soundFx.victory();
        haptic.success();
        recordGame(data.room.id, !!r.official_winner && r.official_winner === me.team_side);
      }, 1400);
    }).catch(() => { if (active) setRevealing(false); });
    return () => { active = false; if (revealTimer) clearTimeout(revealTimer); };
  }, [data.room.id, me.team_side]);

  useEffect(()=>{api.friendMemoryLeaderboard(data.room.id).then(setFriendScores).catch(()=>{});api.partyLastAgeEvent(data.room.id).then(id=>id?api.partyAgeResults(id).then(setAgeScores):undefined).catch(()=>{});},[data.room.id]);

  if (!res) {
    return (
      <Screen>
        <View style={s.center}>
          <View style={{ alignSelf: 'flex-end', width: '100%', alignItems: 'flex-end' }}>
            <RoomExitButton onExit={exitRoom} />
          </View>
          <Float amount={8}>
            <View style={s.bigIcon}><Ionicons name="flag" size={42} color={colors.gold} /></View>
          </Float>
          <Title size={24}>{revealing ? 'Kazanan Açıklanıyor…' : 'Sonuçlar Hesaplanıyor…'}</Title>
          <Muted>{revealing ? 'Davullar çalıyor! Hazır mısınız?' : 'Puanlar toplanıyor, lütfen bekle.'}</Muted>
        </View>
      </Screen>
    );
  }

  const isOfficialMine = res.official_winner && me.team_side === res.official_winner;
  const isFunnyMine = res.funny_winner && me.team_side === res.funny_winner;
  const champ = res.official_winner;
  const champColor = champ ? teamColor(champ) : colors.gold;
  const funny = res.funny_winner;
  const funnyColor = funny ? teamColor(funny) : colors.violet;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= BAŞLIK ================= */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.header, { flex: 1 }]}>
            <Eyebrow live color={colors.mint} dot={colors.mint}>Oyun tamamlandı</Eyebrow>
            <Title size={32}>Sonuçlar</Title>
          </View>
          <RoomExitButton onExit={exitRoom} />
        </View>

        <Card style={{gap:9}}><Title size={22}>🏅 Dostluk Madalyaları</Title><Muted>Dostluk Hafızası doğru cevap sıralaması</Muted>{[...friendScores].sort((a,b)=>Number(b.correct)-Number(a.correct)).map((p,i)=><Text key={p.player_id}>{i+1}. {p.nickname} — {p.correct}/{p.attempts} doğru {i===0&&Number(p.correct)>0?'🥇':''}</Text>)}{ageScores.filter(x=>Number(x.total)>0&&Number(x.correct)===Number(x.total)).map(x=><Text key={x.player_id}>🏆 Üstün Dost Madalyası: {data.players.find(p=>p.id===x.player_id)?.nickname} (Tüm yaşlar doğru!)</Text>)}{ageScores.length>0&&ageScores.every(x=>Number(x.correct)!==Number(x.total))&&<Muted>Bu turda tüm yaşları doğru bilen olmadı.</Muted>}</Card>

        {/* ================= OYUNCU FİNAL YORUMLARI ================= */}
        <Card accent={colors.violet} style={{gap:12}}>
          <Title size={23}>🎤 Ucube Jürisi: Final Taşlaması</Title>
          <Muted>Herkese ufak bir laf, hak edene büyük bir alkış! Yorumlar oyun istatistiklerinden otomatik hazırlanır; gerçek yapay zekâ analizi değildir.</Muted>
          {data.players.filter(p=>!(p as any).is_bot).map((player,i)=>(
            <View key={player.id} style={{backgroundColor:colors.inset,borderRadius:14,padding:12,gap:6}}>
              <Title size={18} color={colors.gold}>🎭 {player.nickname}</Title>
              <Text style={{color:colors.text,fontSize:15,lineHeight:23}}>{playerFinalComment(player,i,res,friendScores,ageScores)}</Text>
            </View>
          ))}
        </Card>

        {/* ================= RESMİ ŞAMPİYON ================= */}
        <Reveal>
          <View style={[s.champCard, { borderColor: alpha(colors.gold, 0.6) }]}>
            <LinearGradient
              colors={[alpha(champColor, 0.35), 'rgba(10,20,40,0.95)', alpha(colors.gold, 0.12)]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <Chip icon="trophy" label="Resmi şampiyon" color={colors.gold} />
            <Pulse amount={1.04}>
              <View style={s.champAvatarWrap}>
                {champ ? (
                  <Avatar source={teamMascot(champ)} size={128} ring={colors.gold} />
                ) : (
                  <View style={[s.bigIcon, { width: 128, height: 128, borderRadius: 64 }]}>
                    <Ionicons name="hand-left" size={56} color={colors.gold} />
                  </View>
                )}
                <View style={s.trophyBadge}>
                  <LinearGradient colors={gradients.gold} style={s.trophyBadgeFill}>
                    <Ionicons name="trophy" size={22} color="#4A2A00" />
                  </LinearGradient>
                </View>
              </View>
            </Pulse>
            <Title size={30} color={champ ? champColor : colors.text}>
              {champ ? teamName(champ) : 'Berabere'}
            </Title>
            {champ && (
              <View style={s.pointsPill}>
                <GemIcon size={18} color={champColor} />
                <Text display style={[s.pointsText, { color: champColor }]}>{res.teams[champ].score}</Text>
                <Text style={s.pointsUnit}>puan ile kazandı</Text>
              </View>
            )}
            {isOfficialMine && <Chip icon="happy" label="Bu bizim!" color={colors.mint} solid />}
          </View>
        </Reveal>

        {/* ================= EN KOMİK TASARIM ================= */}
        <Reveal delay={120}>
          <Card accent={colors.violet} style={s.funnyCard}>
            <View style={s.funnyRow}>
              <View style={[s.funnyIcon, { backgroundColor: alpha(colors.violet, 0.16), borderColor: alpha(colors.violet, 0.5) }]}>
                <Ionicons name={funny ? 'happy' : 'hand-left'} size={30} color={colors.violet} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Eyebrow color={colors.violet}>En komik / çılgın tasarım</Eyebrow>
                <Title size={22} color={funny ? funnyColor : colors.text}>
                  {funny ? teamName(funny) : 'Berabere'}
                </Title>
                {funny ? (
                  <Muted>
                    {res.teams[funny].creature_name ?? 'İsimsiz Ucube'} · {res.teams[funny].funny_votes} oy
                  </Muted>
                ) : (
                  <Muted>Takımlar eşit komiklik oyu aldı</Muted>
                )}
              </View>
            </View>
            {isFunnyMine && <Chip icon="star" label="Bizim yaratık!" color={colors.mint} solid />}
          </Card>
        </Reveal>

        {/* ================= YARATIK SERGİSİ ================= */}
        <SectionLabel>Yaratık sergisi</SectionLabel>
        <View style={s.creatureRow}>
          {(['A', 'B'] as Side[]).map((side) => {
            const tColor = teamColor(side);
            const teamData = res.teams[side];
            return (
              <View key={side} style={[s.creatureCard, { width: colW, borderColor: alpha(tColor, 0.4), shadowColor: tColor }]}>
                <LinearGradient
                  colors={[alpha(tColor, 0.26), 'rgba(8,16,32,0.94)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.7 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.teamHead}>
                  <Avatar source={teamMascot(side)} size={32} ring={tColor} />
                  <Text numberOfLines={1} style={[s.teamChipText, { color: tColor }]}>{teamName(side)}</Text>
                </View>
                <View style={s.canvasWrapper}>
                  <CanvasBoard ctx={ctx} side={side} size={colW - 24} />
                </View>
                <Text display style={s.creatureName} numberOfLines={2}>
                  {teamData.creature_name ?? 'İsimsiz Ucube'}
                </Text>
                {teamData.creature_title && (
                  <View style={{ backgroundColor: alpha(tColor, 0.15), borderWidth: 1, borderColor: alpha(tColor, 0.4), borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, marginTop: 4 }}>
                    <Text numberOfLines={1} style={{ color: tColor, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                      ⚡ {teamData.creature_title}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* ================= TAKIM İSTATİSTİKLERİ ================= */}
        <SectionLabel>Takım istatistikleri</SectionLabel>
        <View style={{ gap: 12 }}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = res.teams[side];
            const tColor = teamColor(side);
            const pieces = data.teamPieces.filter((p) => p.side === side);
            return (
              <Card key={side} accent={tColor} style={{ gap: 14 }}>
                <View style={s.scoreCardHead}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar source={teamMascot(side)} size={40} ring={tColor} />
                    <Title size={18} color={tColor}>{teamName(side)}</Title>
                  </View>
                  <View style={s.scorePill}>
                    <GemIcon size={18} color={tColor} />
                    <Text display style={s.scorePillValue}>{t.score}</Text>
                    <Text style={s.scorePillUnit}>puan</Text>
                  </View>
                </View>

                <View style={s.piecesTray}>
                  <Text style={s.piecesList}>
                    {pieces.length ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join('  ') : 'Henüz parça yok'}
                  </Text>
                </View>

                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Text display style={s.statValue}>{t.pieces}</Text>
                    <Text style={s.statLabel}>Parça</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text display style={s.statValue}>{t.funny_votes}</Text>
                    <Text style={s.statLabel}>Komiklik oyu</Text>
                  </View>
                </View>
              </Card>
            );
          })}
        </View>

        {/* ================= ANA MENÜ ================= */}
        <View style={{ marginTop: 10, marginBottom: 16 }}>
          <Btn title="Ana Menüye Dön" tone="gold" icon="home" onPress={leave} />
        </View>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 36, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  bigIcon: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: alpha(colors.gold, 0.12),
    borderWidth: 1.5,
    borderColor: alpha(colors.gold, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  header: { gap: 4, marginTop: 2 },

  champCard: {
    borderRadius: 30,
    borderWidth: 1.5,
    padding: 22,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: colors.gold,
    shadowOpacity: 0.4,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  champAvatarWrap: { marginTop: 4 },
  trophyBadge: {
    position: 'absolute',
    bottom: -6,
    right: -8,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  trophyBadgeFill: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFF1B8',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 100,
  },
  pointsText: { fontSize: 22, fontWeight: '900' },
  pointsUnit: { color: colors.muted, fontSize: 12.5, fontWeight: '600' },

  funnyCard: { gap: 12 },
  funnyRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  funnyIcon: { width: 62, height: 62, borderRadius: 31, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },

  creatureRow: { flexDirection: 'row', gap: 14 },
  creatureCard: {
    borderRadius: 24,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 10,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  teamChipText: { fontSize: 13, fontWeight: '700', flex: 1 },
  canvasWrapper: { borderRadius: 18, overflow: 'hidden' },
  creatureName: { color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },

  scoreCardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.inset,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  scorePillValue: { color: colors.text, fontSize: 20, fontWeight: '900' },
  scorePillUnit: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  piecesTray: {
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
  },
  piecesList: { fontSize: 24, textAlign: 'center', color: colors.muted },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 2 },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '900' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.border },
});
