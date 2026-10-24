import React, { useEffect, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Btn, Eyebrow, Pulse, Reveal, RoomExitButton, Screen, Text, useToast } from '../components/ui';
import { api } from '../lib/api';
import { avatarFor, teamMascot } from '../lib/art';
import { alpha, colors, teamColor } from '../lib/theme';
import type { Ctx, Player, Side } from '../lib/types';

const PLAYER_START_MS = 700;
const PLAYER_INTERVAL_MS = 1450;
const PLAYER_ANIMATION_MS = 760;
const CAPTAIN_GAP_MS = 750;
const CAPTAIN_INTRO_MS = 500;
const CAPTAIN_INTERVAL_MS = 2400;
const OUTRO_MS = 500;
const PLAYER_SPOTLIGHT_HOLD_MS = PLAYER_INTERVAL_MS - PLAYER_ANIMATION_MS;

export function teamRevealDuration(playerCount: number) {
  return PLAYER_START_MS + playerCount * PLAYER_INTERVAL_MS + PLAYER_ANIMATION_MS + CAPTAIN_GAP_MS + CAPTAIN_INTRO_MS + 2 * CAPTAIN_INTERVAL_MS + OUTRO_MS;
}

function PlayerSpotlight({ player, elapsedInSlot }: { player: Player; elapsedInSlot: number }) {
  const { width } = useWindowDimensions();
  const [move] = useState(() => new Animated.Value(0));
  const [initialElapsed] = useState(elapsedInSlot);
  const initialProgress = Math.max(0, Math.min(1, (initialElapsed - PLAYER_SPOTLIGHT_HOLD_MS) / PLAYER_ANIMATION_MS));
  const targetX = (player.team_side === 'A' ? -1 : 1) * Math.min(116, width * 0.29);

  React.useEffect(() => {
    move.setValue(initialProgress);
    if (initialProgress >= 1) return;

    const alreadyMovingMs = Math.max(0, initialElapsed - PLAYER_SPOTLIGHT_HOLD_MS);
    const animation = Animated.sequence([
      Animated.delay(Math.max(0, PLAYER_SPOTLIGHT_HOLD_MS - initialElapsed)),
      Animated.timing(move, {
        toValue: 1,
        duration: Math.max(1, PLAYER_ANIMATION_MS - alreadyMovingMs),
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [initialElapsed, initialProgress, move]);

  return (
    <Animated.View
      style={[
        s.spotlightReveal,
        {
          opacity: move.interpolate({ inputRange: [0, 1], outputRange: [1, 0.28] }),
          transform: [
            { translateX: move.interpolate({ inputRange: [0, 1], outputRange: [0, targetX] }) },
            { translateY: move.interpolate({ inputRange: [0, 1], outputRange: [0, 118] }) },
            { scale: move.interpolate({ inputRange: [0, 1], outputRange: [1, 0.46] }) },
          ],
        },
      ]}
    >
      <Reveal style={{ width: '100%' }}>
        <View style={[s.spotlightCard, { borderColor: alpha(teamColor(player.team_side), 0.8) }]}>
          <LinearGradient colors={[alpha(teamColor(player.team_side), 0.32), 'rgba(5,10,20,0.95)']} style={StyleSheet.absoluteFill} />
          <Avatar source={avatarFor(player.nickname)} size={88} ring={teamColor(player.team_side)} glow />
          <View style={s.spotlightInfo}>
            <Text style={[s.assignment, { color: teamColor(player.team_side) }]}>YENİ OYUNCU</Text>
            <Text numberOfLines={1} display style={s.spotlightName}>{player.nickname}</Text>
            <Text style={[s.assignment, { color: teamColor(player.team_side) }]}>TAKIM {player.team_side}'YE KATILIYOR</Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={32} color={teamColor(player.team_side)} />
        </View>
      </Reveal>
    </Animated.View>
  );
}

function TeamColumn({ side, players, visibleAt }: { side: Side; players: Player[]; visibleAt: (player: Player) => boolean }) {
  const color = teamColor(side);
  return (
    <View style={[s.teamPanel, { borderColor: alpha(color, 0.45) }]}>
      <LinearGradient colors={[alpha(color, 0.3), alpha(color, 0.12), 'rgba(5,10,20,0.94)']} style={StyleSheet.absoluteFill} />
      <View style={s.teamHeading}>
        <Image source={teamMascot(side)} style={s.mascot} />
        <View>
          <View style={[s.teamBadge, { backgroundColor: alpha(color, 0.2), borderColor: alpha(color, 0.55) }]}>
            <View style={[s.teamDot, { backgroundColor: color }]} />
            <Text display style={s.teamTitle}>TAKIM {side}</Text>
          </View>
          <Text style={s.teamSubtitle}>{players.length} oyuncu</Text>
        </View>
      </View>
      <ScrollView style={s.rosterScroll} contentContainerStyle={s.roster} showsVerticalScrollIndicator={false}>
        {players.map((player) => visibleAt(player) && (
          <Reveal key={player.id} style={s.playerReveal}>
            <View style={s.playerRow}>
              <Avatar source={avatarFor(player.nickname)} size={31} ring={player.is_captain ? colors.gold : alpha(color, 0.75)} />
              <Text numberOfLines={1} style={s.playerName}>{player.nickname}</Text>
              {player.is_captain && <Ionicons name="star" size={13} color={colors.gold} />}
            </View>
          </Reveal>
        ))}
      </ScrollView>
    </View>
  );
}

function CaptainCard({ player, side }: { player: Player; side: Side }) {
  const color = teamColor(side);
  return (
    <View style={[s.captainCard, { borderColor: alpha(color, 0.55) }]}>
      <LinearGradient colors={[alpha(color, 0.34), 'rgba(5,10,20,0.94)']} style={StyleSheet.absoluteFill} />
      <Avatar source={avatarFor(player.nickname)} size={46} ring={colors.gold} glow />
      <View style={s.captainInfo}>
        <Text style={[s.captainTeam, { color }]}>TAKIM {side} KAPTANI</Text>
        <Text numberOfLines={1} style={s.captainName}>{player.nickname}</Text>
      </View>
      <Ionicons name="ribbon" size={22} color={colors.gold} />
    </View>
  );
}

function CaptainSpotlight({ player, side }: { player: Player; side: Side }) {
  const color = teamColor(side);
  return (
    <View style={[s.spotlightCard, s.captainSpotlight, { borderColor: alpha(colors.gold, 0.8) }]}>
      <LinearGradient colors={['rgba(255,181,46,0.28)', alpha(color, 0.22), 'rgba(5,10,20,0.92)']} style={StyleSheet.absoluteFill} />
      <Avatar source={avatarFor(player.nickname)} size={88} ring={colors.gold} glow />
      <View style={s.spotlightInfo}>
        <Text style={s.captainEyebrow}>TAKIM {side} KAPTANI</Text>
        <Text numberOfLines={1} display style={s.spotlightName}>{player.nickname}</Text>
        <Text style={[s.assignment, { color }]}>TAKIMIN LİDERİ</Text>
      </View>
      <Pulse amount={1.12}><Ionicons name="ribbon" size={30} color={colors.gold} /></Pulse>
    </View>
  );
}

export function TeamRevealScreen({ ctx }: { ctx: Ctx }) {
  const phaseStartedAt = ctx.data.room.phase_started_at;
  const [timeline, setTimeline] = useState(() => ({ phaseStartedAt, startedAt: Date.now() }));
  const timelineForRender = timeline.phaseStartedAt === phaseStartedAt
    ? timeline
    : { phaseStartedAt, startedAt: Date.now() };
  const [, setClock] = useState(0);
  const elapsed = Math.max(0, Date.now() - timelineForRender.startedAt);
  const { height } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  useEffect(() => {
    if (timeline.phaseStartedAt === phaseStartedAt) return;
    setTimeline({ phaseStartedAt, startedAt: Date.now() });
  }, [phaseStartedAt, timeline.phaseStartedAt]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  const players = [...ctx.data.players].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id));
  const playersBySide = {
    A: players.filter((player) => player.team_side === 'A'),
    B: players.filter((player) => player.team_side === 'B'),
  };
  const maxTeamHeight = Math.max(150, Math.min(330, height - 480));
  const teamPanelHeight = Math.min(82 + Math.max(playersBySide.A.length, playersBySide.B.length) * 48, maxTeamHeight);
  const activeIndex = Math.floor((elapsed - PLAYER_START_MS) / PLAYER_INTERVAL_MS);
  const activePlayer = activeIndex >= 0 && activeIndex < players.length && elapsed < PLAYER_START_MS + players.length * PLAYER_INTERVAL_MS
    ? players[activeIndex]
    : null;
  const captainRevealAt = PLAYER_START_MS + players.length * PLAYER_INTERVAL_MS + PLAYER_ANIMATION_MS + CAPTAIN_GAP_MS + CAPTAIN_INTRO_MS;
  const captains = (['A', 'B'] as const).map((side) => playersBySide[side].find((player) => player.is_captain)).filter((player): player is Player => !!player);
  const activeCaptainIndex = Math.floor((elapsed - captainRevealAt) / CAPTAIN_INTERVAL_MS);
  const activeCaptain = activeCaptainIndex >= 0 && activeCaptainIndex < captains.length ? captains[activeCaptainIndex] : null;
  const captainsFinished = elapsed >= captainRevealAt + captains.length * CAPTAIN_INTERVAL_MS;
  const revealComplete = elapsed >= teamRevealDuration(players.length);

  const visibleAt = (player: Player) => {
    const index = players.findIndex((candidate) => candidate.id === player.id);
    return elapsed >= PLAYER_START_MS + (index + 1) * PLAYER_INTERVAL_MS;
  };

  const startGame = async () => {
    if (!ctx.me.is_host || !revealComplete || busy) return;
    setBusy(true);
    try {
      await api.startGame(ctx.data.room.id);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const shuffleTeams = async () => {
    if (!ctx.me.is_host || !revealComplete || busy) return;
    setBusy(true);
    try {
      await api.shuffleTeams(ctx.data.room.id);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={s.content}>
        <View style={s.headerRow}>
          <View style={s.heading}>
            <Eyebrow live color={colors.mint} dot={colors.mint}>Takım dağılımı</Eyebrow>
            <Text display style={s.title}>Taraflar belli oluyor</Text>
            <Text style={s.subtitle}>Oyuncular sırayla takımlarına yerleşiyor</Text>
          </View>
          <RoomExitButton onExit={ctx.exitRoom} />
        </View>

        <View style={s.spotlight}>
          {activePlayer ? (
            <PlayerSpotlight
              key={activePlayer.id}
              player={activePlayer}
              elapsedInSlot={elapsed - (PLAYER_START_MS + activeIndex * PLAYER_INTERVAL_MS)}
            />
          ) : activeCaptain ? (
            <Reveal key={`captain-${activeCaptain.id}`} style={s.spotlightReveal}>
              <CaptainSpotlight player={activeCaptain} side={activeCaptain.team_side as Side} />
            </Reveal>
          ) : (
            <View style={s.waitingSpotlight}>
              <Ionicons name={captainsFinished ? 'checkmark-circle' : 'people'} size={22} color={captainsFinished ? colors.mint : colors.cyan} />
              <Text style={s.waitingText}>{captainsFinished ? 'Takımlar hazır!' : elapsed >= captainRevealAt ? 'Kaptanlar tanıtıldı' : 'Takım yerleşimi tamamlanıyor…'}</Text>
            </View>
          )}
        </View>

        <View style={[s.teams, { height: teamPanelHeight }]}>
          <TeamColumn side="A" players={playersBySide.A} visibleAt={visibleAt} />
          <TeamColumn side="B" players={playersBySide.B} visibleAt={visibleAt} />
        </View>

        <View style={s.captainsSection}>
          {captainsFinished ? (
            <Reveal>
              <Pulse amount={1.025}>
                <View style={s.captainsReveal}>
                  <View style={s.captainsTitleRow}>
                    <Ionicons name="ribbon" size={19} color={colors.gold} />
                    <Text display style={s.captainsTitle}>KAPTANLARINIZ</Text>
                    <Ionicons name="ribbon" size={19} color={colors.gold} />
                  </View>
                  <View style={s.captainGrid}>
                    {captains.map((player) => <CaptainCard key={player.id} player={player} side={player.team_side as Side} />)}
                  </View>
                </View>
              </Pulse>
            </Reveal>
          ) : (
            <View style={s.captainPlaceholder}>
              <Ionicons name="sparkles" size={17} color={colors.gold} />
              <Text style={s.captainWaiting}>{elapsed >= captainRevealAt ? 'Liderler sırayla tanıtılıyor' : 'Liderler birazdan belli olacak'}</Text>
            </View>
          )}
        </View>

        <View style={s.actionSection}>
          {revealComplete ? ctx.me.is_host ? (
            <View style={s.hostActions}>
              <Btn title="Takımları Karıştır" icon="shuffle" tone="ghost" size="md" loading={busy} onPress={shuffleTeams} />
              <Btn title="Oyuna Başla" icon="rocket" tone="success" loading={busy} onPress={startGame} />
            </View>
          ) : (
            <View style={s.hostWaiting}>
              <Ionicons name="hourglass" size={18} color={colors.cyan} />
              <Text style={s.hostWaitingText}>Kurucunun oyunu başlatması bekleniyor</Text>
            </View>
          ) : (
            <View style={s.hostWaiting}>
              <Ionicons name="sparkles" size={18} color={colors.gold} />
              <Text style={s.hostWaitingText}>Tanıtım tamamlanınca oyun başlayabilir</Text>
            </View>
          )}
        </View>
      </View>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, justifyContent: 'flex-start', gap: 8, paddingBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heading: { flex: 1, alignItems: 'center', gap: 3, paddingTop: 2 },
  title: { color: colors.text, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  spotlight: { minHeight: 64, justifyContent: 'center' },
  spotlightReveal: { width: '100%' },
  spotlightCard: { minHeight: 132, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 22, borderWidth: 1.5, backgroundColor: colors.glassStrong },
  captainSpotlight: { borderWidth: 2 },
  spotlightInfo: { flex: 1, gap: 4 },
  spotlightName: { color: colors.text, fontSize: 29, fontWeight: '900' },
  assignment: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  captainEyebrow: { color: colors.gold, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  waitingSpotlight: { height: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glass },
  waitingText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  teams: { flexDirection: 'row', alignItems: 'stretch', gap: 8, minHeight: 0 },
  teamPanel: { flex: 1, overflow: 'hidden', padding: 10, gap: 8, borderWidth: 1, borderRadius: 20, backgroundColor: colors.glassStrong },
  teamHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mascot: { width: 38, height: 38, borderRadius: 19 },
  teamBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 10 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  teamTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  teamSubtitle: { color: colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2 },
  rosterScroll: { flex: 1, minHeight: 0 },
  roster: { gap: 6, paddingBottom: 2 },
  playerReveal: { width: '100%' },
  playerRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 7, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(5,10,20,0.82)' },
  playerName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '800' },
  captainsSection: { minHeight: 76, justifyContent: 'center' },
  captainPlaceholder: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  captainWaiting: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  captainsReveal: { gap: 8 },
  captainsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  captainsTitle: { color: colors.gold, fontSize: 17, fontWeight: '900' },
  captainGrid: { flexDirection: 'row', gap: 8 },
  captainCard: { flex: 1, minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, backgroundColor: colors.glassStrong },
  captainInfo: { flex: 1, gap: 3 },
  captainTeam: { color: colors.textSoft, fontSize: 10, fontWeight: '800' },
  captainName: { color: colors.text, fontSize: 14, fontWeight: '900' },
  actionSection: { flexGrow: 1, minHeight: 48, justifyContent: 'flex-end' },
  hostActions: { gap: 7 },
  hostWaiting: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hostWaitingText: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
});
