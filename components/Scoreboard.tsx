import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { teamColor, teamName } from '../lib/theme';
import type { Ctx, Side } from '../lib/types';

/** Canlı takip: iki takımın anlık puanı ve topladığı parçalar (Midas Tarzı Stat Widget). */
export function Scoreboard({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog } = ctx;
  return (
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
              mine && s.boxMine,
            ]}
          >
            <View style={s.head}>
              <View
                style={[
                  s.teamBadge,
                  { backgroundColor: `${tColor}16`, borderColor: `${tColor}35` },
                ]}
              >
                <View style={[s.teamDot, { backgroundColor: tColor }]} />
                <Text style={[s.teamText, { color: tColor }]}>
                  {teamName(side)}{mine ? ' (Biz)' : ''}
                </Text>
              </View>
              <Text style={s.score}>{t?.score ?? 0}</Text>
            </View>
            <View style={s.subRow}>
              <View style={s.piecesContainer}>
                <Text style={s.pieces} numberOfLines={1}>
                  {pieces.length
                    ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join(' ')
                    : '—'}
                </Text>
              </View>
              <View style={s.creditBadge}>
                <Text style={s.creditBadgeText}>🪙 {t?.credits ?? 10}</Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  box: {
    flex: 1,
    backgroundColor: '#101521',
    borderWidth: 1,
    borderColor: '#1C2436',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  boxMine: {
    borderColor: '#242F46',
    backgroundColor: '#121826',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 100,
    borderWidth: 1,
  },
  teamDot: { width: 6, height: 6, borderRadius: 3 },
  teamText: { fontSize: 11, fontWeight: '700' },
  score: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  piecesContainer: {
    flex: 1,
    backgroundColor: '#090C14',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 28,
    justifyContent: 'center',
  },
  pieces: { fontSize: 14 },
  creditBadge: {
    backgroundColor: '#161D2C',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242F46',
    paddingVertical: 4,
    paddingHorizontal: 8,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditBadgeText: {
    color: '#F59E0B',
    fontSize: 12,
    fontWeight: '800',
  },
});
