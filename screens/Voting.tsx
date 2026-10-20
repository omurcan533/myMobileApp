import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CanvasBoard } from '../components/Canvas';
import { Hint } from '../components/Hint';
import { Btn, Muted, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { secondsLeft } from '../lib/selectors';
import { colors, teamColor, teamName } from '../lib/theme';
import type { Ctx, Side } from '../lib/types';

export function VotingScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 40 - 12) / 2;
  const now = useNow();
  const left = secondsLeft(data.room.phase_ends_at, now);
  const myVote = data.votes.find((v) => v.voter_id === me.id);
  const { toast, show } = useToast();

  const vote = (side: Side) => api.castVote(data.room.id, side).then(() => show('Oyun gizlice kaydedildi 🤫')).catch((e) => show((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Title>😂 En Komik / En Çılgın Tasarım?</Title>
        <TimerBar left={left} total={30} color={colors.yellow} />
        <Hint id="voting" text="Gizli oy! Kendi takımına oy veremezsin, rakibin yaratığına oy ver." />

        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = data.teams.find((x) => x.side === side);
            const mine = me.team_side === side;
            const voted = myVote?.voted_side === side;
            return (
              <View key={side} style={{ width: colW, gap: 8 }}>
                <Text style={{ color: teamColor(side), fontWeight: '900' }}>{teamName(side)}{mine ? ' • Biz' : ''}</Text>
                <CanvasBoard ctx={ctx} side={side} size={colW} />
                <Text style={s.name} numberOfLines={2}>{t?.creature_name ?? 'İsimsiz Ucube'}</Text>
                <Btn
                  title={mine ? 'Bizim' : voted ? '✓ Oyun burada' : '😂 Oy ver'}
                  tone={mine ? 'ghost' : voted ? 'success' : 'custom'}
                  color={teamColor(side)}
                  disabled={mine}
                  onPress={() => vote(side)}
                />
              </View>
            );
          })}
        </View>
        <Muted style={{ textAlign: 'center' }}>{myVote ? 'Diğer oyuncular bekleniyor…' : 'Bir yaratık seç.'}</Muted>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  name: { color: colors.text, fontSize: 17, fontWeight: '900' },
});
