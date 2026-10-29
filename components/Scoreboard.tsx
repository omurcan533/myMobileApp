import React, {memo} from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CoinPill, Avatar, GemIcon, RoomExitButton, Text } from './ui';
import { teamMascot } from '../lib/art';
import { alpha, colors, teamColor, teamName } from '../lib/theme';
import { totalQuestionsForRoom } from '../lib/selectors';
import type { Ctx, Side } from '../lib/types';

/** Canlı takip: iki takımın anlık puanı, topladığı parçalar ve kredisi (Fantasy kart tarzı HUD). */
export const Scoreboard=memo(function Scoreboard({ ctx }: { ctx: Ctx }) {
  const {width,height}=useWindowDimensions();
  const compact=width<=430||height<740;
  const { data, me, catalog } = ctx;
  const hasOpenRound = data.rounds.some((round) => round.status === 'open');
  const hasResolvedRound = data.rounds.some((round) => round.status === 'resolved');
  const latestMinigame = data.minigames[data.minigames.length - 1];
  const waitingForHost =
    (data.room.phase === 'question' && !hasOpenRound && hasResolvedRound) ||
    (data.room.phase === 'minigame' && latestMinigame?.status === 'done');
  const currentRound = data.rounds.find((r) => r.status === 'open') ?? [...data.rounds].filter((r) => r.status === 'resolved').sort((a, b) => b.idx - a.idx)[0];
  const questionCount = totalQuestionsForRoom(data.room.mode, data.rounds.length);

  return (
    <View style={s.wrap}>
      <View style={s.topRow}>
        <Text style={s.roomCode}>ODA {data.room.code}</Text>
        {currentRound && data.room.phase === 'question' && (
          <View style={s.questionBadge}>
            <Ionicons name="help-circle" size={14} color={colors.cyan} />
            <Text style={s.questionBadgeText}>Soru {currentRound.idx + 1} / {questionCount}</Text>
          </View>
        )}
        <RoomExitButton onExit={ctx.exitRoom} />
      </View>
      <View style={s.row}>
        {(['A', 'B'] as Side[]).map((side) => {
          const t = data.teams.find((x) => x.side === side);
          const pieces = data.teamPieces.filter((p) => p.side === side);
          const teammates = data.players.filter((player) => player.team_side === side);
          const mine = me.team_side === side;
          const tColor = teamColor(side);

          return (
            <View
              key={side}
              style={[
                s.box,
                compact&&{padding:8,gap:5,borderRadius:15,minWidth:0},
                { borderColor: alpha(tColor, mine ? 0.7 : 0.28), shadowColor: tColor, shadowOpacity: mine ? 0.4 : 0.12 },
                mine ? [s.mineBox, { borderColor: tColor,borderWidth:compact?2:4 }] : s.opponentBox,
              ]}
            >
              <LinearGradient
                colors={[alpha(tColor, mine ? 0.3 : 0.16), 'rgba(8,16,32,0.92)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.head}>
                <Avatar source={teamMascot(side)} size={compact?28:38} ring={tColor} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[s.teamText, { color: tColor }]}>
                    {teamName(side)}
                  </Text>
                  {mine && (
                    <View style={s.mineBadge}>
                      <View style={s.mineDot} />
                      <Text style={s.mineTag}>SENİN TAKIMIN</Text>
                    </View>
                  )}
                </View>
              </View>

              {mine && !compact && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.memberList}>
                  {teammates.map((player) => (
                    <View key={player.id} style={[s.memberChip, player.id === me.id && s.memberSelf]}>
                      <Text numberOfLines={1} style={[s.memberName, player.id === me.id && s.memberSelfName]}>
                        {player.nickname}
                      </Text>
                      {player.id === me.id && <Text style={s.memberSelfLabel}>SEN</Text>}
                    </View>
                  ))}
                </ScrollView>
              )}

              <View style={s.scoreRow}>
                <GemIcon size={20} color={tColor} />
                <Text display style={[s.score,compact&&{fontSize:24,lineHeight:28}]}>{t?.score ?? 0}</Text>
                <Text style={s.scoreUnit}>puan</Text>
              </View>

              <View style={[s.subRow,compact&&{flexDirection:'row',alignItems:'center',gap:4}]}>
                <View style={[s.piecesContainer,compact&&{flex:1,minWidth:0,paddingHorizontal:4}]}>
                  <Text style={s.pieces} numberOfLines={1}>
                    {pieces.length ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join(' ') : '—'}
                  </Text>
                </View>
                <CoinPill value={t?.credits ?? 10} size="sm" />
              </View>
            </View>
          );
        })}
      </View>
      {waitingForHost && (
        <View style={s.hostStatus}>
          <Ionicons name={me.is_host ? 'eye' : 'hourglass'} size={16} color={colors.cyan} />
          <Text style={s.hostStatusText}>
            {me.is_host
              ? 'Sonuçlar ekranda. Hazır olduğunuzda sonraki aşamaya geçin.'
              : 'Sonuçları inceleyin; kurucu sonraki aşamaya geçince oyun devam edecek.'}
          </Text>
        </View>
      )}
      <View style={s.vsWrap} pointerEvents="none">
        <LinearGradient colors={['#FFE066', '#FF9F1C']} style={s.vs}>
          <Text display style={s.vsText}>VS</Text>
        </LinearGradient>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  wrap: { marginBottom: 10 },
  topRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  roomCode: { color: colors.subtle, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  questionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: alpha(colors.cyan, 0.14),
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.45),
  },
  questionBadgeText: {
    color: colors.cyan,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  row: { flexDirection: 'row', gap: 10 },
  hostStatus: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 13, borderWidth: 1, borderColor: alpha(colors.cyan, 0.36), backgroundColor: alpha(colors.cyan, 0.1) },
  hostStatusText: { flex: 1, color: colors.textSoft, fontSize: 11, fontWeight: '700' },
  box: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 22,
    padding: 12,
    gap: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  mineBox: { borderWidth: 4, shadowOpacity: 0.62, shadowRadius: 22 },
  opponentBox: { opacity: 0.72 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  teamText: { fontSize: 14, fontWeight: '800' },
  mineBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4, marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: alpha(colors.cyan, 0.48), backgroundColor: alpha(colors.cyan, 0.18) },
  mineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan },
  mineTag: { color: colors.text, fontSize: 8, fontWeight: '900' },
  memberList: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberChip: { maxWidth: 88, minHeight: 21, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 8, backgroundColor: 'rgba(5,10,20,0.64)' },
  memberSelf: { borderWidth: 1, borderColor: alpha(colors.cyan, 0.55), backgroundColor: alpha(colors.cyan, 0.14) },
  memberName: { flexShrink: 1, color: colors.textSoft, fontSize: 9, fontWeight: '700' },
  memberSelfName: { color: colors.text },
  memberSelfLabel: { color: colors.cyan, fontSize: 7, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', letterSpacing: -0.5, lineHeight: 34 },
  scoreUnit: { color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 8 },
  subRow: { gap: 6 },
  piecesContainer: {
    backgroundColor: colors.inset,
    borderRadius: 11,
    paddingVertical: 4,
    paddingHorizontal: 9,
    minHeight: 28,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pieces: { fontSize: 14 },
  vsWrap: { position: 'absolute', top: '38%', left: 0, right: 0, alignItems: 'center' },
  vs: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#0A1428',
    shadowColor: colors.gold,
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  vsText: { color: '#3A2100', fontSize: 11, fontWeight: '900' },
});
