import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CanvasBoard } from '../components/Canvas';
import { Btn, Card, Muted, Pulse, Screen, Title } from '../components/ui';
import { api } from '../lib/api';
import { colors, teamColor, teamName } from '../lib/theme';
import type { Ctx, GameResults, Side } from '../lib/types';

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog, onLeave } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 40 - 12) / 2;
  const [res, setRes] = useState<GameResults | null>(null);

  useEffect(() => {
    api.results(data.room.id).then(setRes).catch(() => undefined);
  }, [data.room.id]);

  if (!res) return <Screen><View style={s.center}><Muted>Sonuçlar hesaplanıyor…</Muted></View></Screen>;

  const banner = (title: string, emoji: string, side: Side | null) => (
    <Pulse>
      <Card style={{ alignItems: 'center', gap: 4, borderWidth: 2, borderColor: side ? teamColor(side) : colors.surface2 }}>
        <Muted>{title}</Muted>
        <Text style={{ fontSize: 44 }}>{side ? emoji : '🤝'}</Text>
        <Text style={[s.winner, { color: side ? teamColor(side) : colors.text }]}>{side ? teamName(side) : 'Berabere'}</Text>
        {side && me.team_side === side && <Text style={s.mine}>Bu bizim! 🎉</Text>}
      </Card>
    </Pulse>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
        <Title size={32}>🏁 Sonuçlar</Title>
        {banner('RESMİ ŞAMPİYON', '🏆', res.official_winner)}
        {banner('EN KOMİK / ÇILGIN TASARIM', '🤪', res.funny_winner)}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['A', 'B'] as Side[]).map((side) => (
            <View key={side} style={{ width: colW, gap: 6 }}>
              <Text style={{ color: teamColor(side), fontWeight: '900' }}>{teamName(side)}</Text>
              <CanvasBoard ctx={ctx} side={side} size={colW} />
              <Text style={s.creature} numberOfLines={2}>{res.teams[side].creature_name ?? 'İsimsiz Ucube'}</Text>
            </View>
          ))}
        </View>

        {(['A', 'B'] as Side[]).map((side) => {
          const t = res.teams[side];
          const pieces = data.teamPieces.filter((p) => p.side === side);
          return (
            <Card key={side} style={{ gap: 6, borderWidth: 2, borderColor: teamColor(side) }}>
              <Text style={{ color: teamColor(side), fontWeight: '900' }}>{teamName(side)}</Text>
              <Text style={{ fontSize: 26 }}>{pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join(' ')}</Text>
              <Muted>{t.score} puan · {t.pieces} parça · {t.funny_votes} komiklik oyu</Muted>
            </Card>
          );
        })}
        <Btn title="Ana menüye dön" tone="success" onPress={onLeave} />
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  winner: { fontSize: 28, fontWeight: '900' },
  mine: { color: colors.yellow, fontWeight: '900' },
  creature: { color: colors.text, fontSize: 17, fontWeight: '900' },
});
