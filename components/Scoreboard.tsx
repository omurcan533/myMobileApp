import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, teamColor, teamName } from '../lib/theme';
import type { Ctx, Side } from '../lib/types';

/** Canlı takip: iki takımın anlık puanı ve topladığı parçalar. */
export function Scoreboard({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog } = ctx;
  return (
    <View style={s.row}>
      {(['A', 'B'] as Side[]).map((side) => {
        const t = data.teams.find((x) => x.side === side);
        const pieces = data.teamPieces.filter((p) => p.side === side);
        const mine = me.team_side === side;
        return (
          <View key={side} style={[s.box, { borderColor: teamColor(side), backgroundColor: mine ? teamColor(side) + '22' : colors.surface }]}>
            <View style={s.head}>
              <Text style={[s.name, { color: teamColor(side) }]}>{teamName(side)}{mine ? ' • Biz' : ''}</Text>
              <Text style={s.score}>{t?.score ?? 0}</Text>
            </View>
            <Text style={s.pieces} numberOfLines={1}>
              {pieces.length ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join('') : '—'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  box: { flex: 1, borderWidth: 2, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 12, fontWeight: '900' },
  score: { color: colors.text, fontSize: 24, fontWeight: '900' },
  pieces: { fontSize: 16, marginTop: 2 },
});
