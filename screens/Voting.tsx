import React, { useEffect } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CanvasBoard } from '../components/Canvas';
import { Hint } from '../components/Hint';
import { Avatar, Btn, Eyebrow, Muted, RoomExitButton, Screen, TimerBar, Title, Text, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { teamMascot } from '../lib/art';
import { effNow, secondsLeft } from '../lib/selectors';
import { alpha, colors, teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, Side } from '../lib/types';

export function VotingScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 36 - 14) / 2;
  const now = useNow();
  const left = secondsLeft(data.room.phase_ends_at, effNow(data.room, now));
  useEffect(() => { soundFx.suspense(); }, [data.room.id]);
  const myVote = data.votes.find((v) => v.voter_id === me.id);
  const { toast, show } = useToast();

  const vote = (side: Side) =>
    api
      .castVote(data.room.id, side)
      .then(() => {
        soundFx.vote();
        haptic.success();
        show('Oyun gizlice kaydedildi', 'success');
      })
      .catch((e) => show((e as Error).message, 'error'));

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= BAŞLIK & DURUM ================= */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.header, { flex: 1 }]}>
            <Eyebrow live icon="eye-off" color={colors.violet} dot={colors.violet}>Gizli oylama evresi</Eyebrow>
            <Title size={30}>En Çılgın Tasarım?</Title>
          </View>
          <RoomExitButton onExit={ctx.exitRoom} />
        </View>

        <TimerBar left={left} total={30} label="Kalan Oy Süresi" color={colors.violet} />

        <Hint id="voting" text="Gizli oy! İstediğin yaratığa oy verebilirsin; ister kendi takımına, ister rakibe." />

        {/* ================= YARATIK OYLAMA KARTLARI ================= */}
        <View style={s.voteRow}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = data.teams.find((x) => x.side === side);
            const mine = me.team_side === side;
            const voted = myVote?.voted_side === side;
            const tColor = teamColor(side);

            return (
              <View
                key={side}
                style={[
                  s.voteCard,
                  { width: colW, borderColor: alpha(voted ? colors.mint : tColor, voted ? 0.8 : 0.35), shadowColor: voted ? colors.mint : tColor },
                  voted && s.voteCardVoted,
                ]}
              >
                <LinearGradient
                  colors={[alpha(tColor, 0.28), 'rgba(8,16,32,0.94)']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 0.7 }}
                  style={StyleSheet.absoluteFill}
                />
                {voted && (
                  <View style={s.votedBadge}>
                    <Ionicons name="checkmark" size={14} color="#05281A" />
                  </View>
                )}

                {/* Takım başlığı */}
                <View style={s.teamHead}>
                  <Avatar source={teamMascot(side)} size={34} ring={tColor} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={[s.teamChipText, { color: tColor }]}>{teamName(side)}</Text>
                    {mine && <Text style={s.mineTag}>BİZİM TAKIM</Text>}
                  </View>
                </View>

                {/* Tuval */}
                <View style={s.canvasContainer}>
                  <CanvasBoard ctx={ctx} side={side} size={colW - 24} />
                </View>

                {/* Yaratık Adı & Özel Gücü */}
                <Text display style={s.creatureName} numberOfLines={2}>
                  {t?.creature_name ?? 'İsimsiz Ucube'}
                </Text>
                {t?.creature_title && (
                  <View style={{ backgroundColor: alpha(tColor, 0.15), borderWidth: 1, borderColor: alpha(tColor, 0.4), borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8, marginTop: 4, marginBottom: 8 }}>
                    <Text numberOfLines={1} style={{ color: tColor, fontSize: 11, fontWeight: '700', textAlign: 'center' }}>
                      ⚡ {t.creature_title}
                    </Text>
                  </View>
                )}

                {/* Oy Butonu */}
                <Btn
                  title={voted ? 'Oyun Burada' : 'Oy Ver'}
                  icon={voted ? 'checkmark-circle' : 'happy'}
                  tone={voted ? 'success' : 'primary'}
                  size="md"
                  onPress={() => vote(side)}
                  style={s.voteBtn}
                />
              </View>
            );
          })}
        </View>

        <View style={s.statusFooter}>
          <Muted style={{ textAlign: 'center' }}>
            {myVote ? 'Oyun kaydedildi, diğer oyuncular bekleniyor…' : 'Bir yaratık seçip oyunu ver.'}
          </Muted>
        </View>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 14, paddingBottom: 36, paddingTop: 6 },
  header: { gap: 4, marginBottom: 2 },
  voteRow: { flexDirection: 'row', gap: 14, marginTop: 4 },
  voteCard: {
    borderRadius: 26,
    borderWidth: 1.5,
    padding: 12,
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  voteCardVoted: { shadowOpacity: 0.55 },
  votedBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  teamChipText: { fontSize: 13, fontWeight: '700' },
  mineTag: { color: colors.muted, fontSize: 8.5, fontWeight: '700', letterSpacing: 1.1 },
  canvasContainer: { borderRadius: 18, overflow: 'hidden' },
  creatureName: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center', minHeight: 40 },
  voteBtn: { alignSelf: 'stretch' },
  statusFooter: { marginTop: 4, paddingVertical: 12, alignItems: 'center' },
});
