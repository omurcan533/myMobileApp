import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CoinPill, Avatar, GemIcon, Text } from './ui';
import { teamMascot } from '../lib/art';
import { alpha, colors, teamColor, teamName } from '../lib/theme';
import type { Ctx, Side } from '../lib/types';

/** Canlı takip: iki takımın anlık puanı, topladığı parçalar ve kredisi (Fantasy kart tarzı HUD). */
export function Scoreboard({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog } = ctx;
  return (
    <View style={s.wrap}>
      <View style={s.row}>
        {(['A', 'B'] as Side[]).map((side) => {
          const t = data.teams.find((x) => x.side === side);
          const pieces = data.teamPieces.filter((p) => p.side === side);
          const mine = me.team_side === side;
          const tColor = teamColor(side);

          return (
            <View
              key={side}
              style={[
                s.box,
                { borderColor: alpha(tColor, mine ? 0.7 : 0.28), shadowColor: tColor, shadowOpacity: mine ? 0.4 : 0.12 },
              ]}
            >
              <LinearGradient
                colors={[alpha(tColor, mine ? 0.3 : 0.16), 'rgba(8,16,32,0.92)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={s.head}>
                <Avatar source={teamMascot(side)} size={38} ring={tColor} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[s.teamText, { color: tColor }]}>
                    {teamName(side)}
                  </Text>
                  {mine && <Text style={s.mineTag}>SENİN TAKIMIN</Text>}
                </View>
              </View>

              <View style={s.scoreRow}>
                <GemIcon size={20} color={tColor} />
                <Text display style={s.score}>{t?.score ?? 0}</Text>
                <Text style={s.scoreUnit}>puan</Text>
              </View>

              <View style={s.subRow}>
                <View style={s.piecesContainer}>
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
      <View style={s.vsWrap} pointerEvents="none">
        <LinearGradient colors={['#FFE066', '#FF9F1C']} style={s.vs}>
          <Text display style={s.vsText}>VS</Text>
        </LinearGradient>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { marginBottom: 10 },
  row: { flexDirection: 'row', gap: 10 },
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
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  teamText: { fontSize: 13, fontWeight: '700' },
  mineTag: { color: colors.muted, fontSize: 8.5, fontWeight: '700', letterSpacing: 1.1, marginTop: 1 },
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
