import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CanvasBoard } from '../components/Canvas';
import { Hint } from '../components/Hint';
import { Btn, Muted, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { secondsLeft } from '../lib/selectors';
import { teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, Side } from '../lib/types';

export function VotingScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 44 - 14) / 2;
  const now = useNow();
  const left = secondsLeft(data.room.phase_ends_at, now);
  const myVote = data.votes.find((v) => v.voter_id === me.id);
  const { toast, show } = useToast();

  const vote = (side: Side) =>
    api
      .castVote(data.room.id, side)
      .then(() => {
        soundFx.vote();
        haptic.success();
        show('Oyun gizlice kaydedildi 🤫');
      })
      .catch((e) => show((e as Error).message));

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= BAŞLIK & DURUM ================= */}
        <View style={s.header}>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>GİZLİ OYLAMA EVRESİ</Text>
          </View>
          <Title size={28}>En Çılgın Tasarım?</Title>
        </View>

        <TimerBar left={left} total={30} label="Kalan Oy Süresi" />

        <Hint id="voting" text="Gizli oy! İstediğin yaratığa oy verebilirsin; ister kendi takımına, ister rakibe." />

        {/* ================= YARATIK OYLAMA KARTLARI ================= */}
        <View style={s.voteRow}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = data.teams.find((x) => x.side === side);
            const mine = me.team_side === side;
            const voted = myVote?.voted_side === side;
            const tColor = teamColor(side);

            return (
              <View key={side} style={[s.voteCard, { width: colW }, voted && s.voteCardVoted]}>
                {/* Takım Çipi */}
                <View
                  style={[
                    s.teamChip,
                    { backgroundColor: `${tColor}16`, borderColor: `${tColor}38` },
                  ]}
                >
                  <View style={[s.chipDot, { backgroundColor: tColor }]} />
                  <Text style={[s.teamChipText, { color: tColor }]}>
                    {teamName(side)}{mine ? ' (Biz)' : ''}
                  </Text>
                </View>

                {/* Çizgisiz, Zarif Tuval */}
                <View style={s.canvasContainer}>
                  <CanvasBoard ctx={ctx} side={side} size={colW - 24} />
                </View>

                {/* Yaratık Adı */}
                <Text style={s.creatureName} numberOfLines={2}>
                  {t?.creature_name ?? 'İsimsiz Ucube'}
                </Text>

                {/* Oy Butonu */}
                <Btn
                  title={voted ? '✓ Oyun Burada' : '😂 Oy Ver'}
                  tone={voted ? 'success' : 'primary'}
                  onPress={() => vote(side)}
                  style={s.voteBtn}
                />
              </View>
            );
          })}
        </View>

        <View style={s.statusFooter}>
          <Muted style={{ textAlign: 'center' }}>
            {myVote ? '✓ Oyun kaydedildi, diğer oyuncular bekleniyor…' : '👉 Bir yaratık seçip oyunu ver.'}
          </Muted>
        </View>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 36 },
  header: { paddingTop: 4, marginBottom: 2 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#8B5CF6',
  },
  liveText: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  voteRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  voteCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  voteCardVoted: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: '#101724',
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  teamChipText: { fontSize: 12, fontWeight: '700' },
  canvasContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0E131F',
  },
  creatureName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    minHeight: 38,
  },
  voteBtn: {
    width: '100%',
    paddingVertical: 12,
  },
  statusFooter: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
