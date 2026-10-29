import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Btn, Eyebrow, Pulse, Reveal, RoomExitButton, Screen, Text, useToast } from '../components/ui';
import { api } from '../lib/api';
import { avatarFor, teamMascot } from '../lib/art';
import { alpha, colors, teamColor } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { CaptainDuelRoll, CaptainDuelState, Ctx, Player, Side } from '../lib/types';

// Multi-stage sequential animation timeline constants
const PLAYER_START_MS = 800;
const PLAYER_INTERVAL_MS = 3200;
const STAGE_REVEAL_MS = 900;
const STAGE_SHAKE_MS = 650;
const STAGE_FLIGHT_MS = 950;

const DIE_PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function DieFace({ value, rolling = false, size = 88 }: { value: number; rolling?: boolean; size?: number }) {
  const [displayVal, setDisplayVal] = useState(value);

  useEffect(() => {
    if (!rolling) {
      setDisplayVal(value);
      return;
    }
    const interval = setInterval(() => {
      setDisplayVal(Math.floor(Math.random() * 6) + 1);
    }, 65);
    return () => clearInterval(interval);
  }, [rolling, value]);

  const pips = DIE_PIPS[displayVal] || [4];
  const dotSize = Math.max(5, Math.floor(size * 0.19));
  const radius = Math.max(8, Math.floor(size * 0.22));
  const borderWidth = Math.max(1.5, Math.floor(size * 0.03));
  const bevelWidth = Math.max(3.5, Math.floor(size * 0.07));

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: '#FFFFFF',
        borderWidth,
        borderColor: '#CBD5E1',
        borderBottomWidth: bevelWidth,
        borderBottomColor: '#94A3B8',
        padding: Math.max(3, Math.floor(size * 0.08)),
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.25,
        shadowRadius: 6,
        elevation: 6,
      }}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
        const hasDot = pips.includes(idx);
        return (
          <View
            key={idx}
            style={{
              width: '33.33%',
              height: '33.33%',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {hasDot && (
              <View
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: displayVal === 1 ? '#DC2626' : '#0F172A',
                  shadowColor: displayVal === 1 ? '#DC2626' : 'transparent',
                  shadowOpacity: 0.3,
                  shadowRadius: 2,
                }}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * 5 Aşamalı Profesyonel Oyun UI Animasyonu:
 * 1. The Reveal: 0.3'ten 1.14'e hızlı yaylı pop + beyaz neon ışıma
 * 2. The Decision / Shake: Karar anında 250ms yatay titreme / açısal salınım
 * 3. Curved Path (Arc Motion): Düz çizgi yerine dışa doğru kavis çizerek (parabolik yay) iniş
 * 4. Squash & Stretch: Hıza bağlı genişlikte daralma, boyda uzama ve ulaşılan yuvaya ölçeklenme
 * 5. The Impact: Hedefe çarptığında elastik yay etkisi + kutunun 1.06 genişlemesi ve neon patlaması
 */
function PlayerSpotlight({
  player,
  onImpact,
}: {
  player: Player;
  onImpact?: (side: Side) => void;
}) {
  const { width } = useWindowDimensions();
  const side = player.team_side as Side;
  const color = teamColor(side);
  const isTeamA = side === 'A';
  const targetX = (isTeamA ? -1 : 1) * Math.min(106, width * 0.25);
  const targetY = 135;

  // Animasyon Değerleri
  const revealScale = useRef(new Animated.Value(0.4)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const neonGlow = useRef(new Animated.Value(0)).current;
  const shakeVal = useRef(new Animated.Value(0)).current;
  const flightVal = useRef(new Animated.Value(0)).current;
  const impactBounce = useRef(new Animated.Value(1)).current;

  const [phaseText, setPhaseText] = useState<'reveal' | 'shake' | 'flight'>('reveal');
  const hasImpacted = useRef(false);
  const impactCallback = useRef(onImpact);
  impactCallback.current = onImpact;

  useEffect(() => {
    // 1. AŞAMA: The Reveal (0 - 900ms)
    // 0.4 -> 1.04 dengeli yay + neon parıltı (ekran dışına taşmaz)
    haptic.light();
    Animated.parallel([
      Animated.timing(revealOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(revealScale, {
          toValue: 1.04,
          duration: 250,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(revealScale, { toValue: 1.0, friction: 6, tension: 100, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(neonGlow, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(neonGlow, { toValue: 0.1, duration: 320, useNativeDriver: true }),
      ]),
    ]).start();

    // 2. AŞAMA: The Decision / Shake (900 - 1550ms)
    const shakeTimer = setTimeout(() => {
      setPhaseText('shake');
      haptic.light();
      Animated.sequence([
        Animated.timing(shakeVal, { toValue: -1, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeVal, { toValue: 1, duration: 58, useNativeDriver: true }),
        Animated.timing(shakeVal, { toValue: -0.8, duration: 58, useNativeDriver: true }),
        Animated.timing(shakeVal, { toValue: 0.8, duration: 58, useNativeDriver: true }),
        Animated.timing(shakeVal, { toValue: -0.4, duration: 55, useNativeDriver: true }),
        Animated.timing(shakeVal, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }, STAGE_REVEAL_MS);

    // 3. & 4. AŞAMA: Arc Motion (Kavisli Yol) + Squash & Stretch (1550 - 2500ms)
    const flightTimer = setTimeout(() => {
      setPhaseText('flight');
      Animated.timing(flightVal, {
        toValue: 1,
        duration: STAGE_FLIGHT_MS,
        easing: Easing.bezier(0.2, 0.0, 0.15, 1.0),
        useNativeDriver: true,
      }).start(() => {
        // 5. AŞAMA: The Impact (2500ms - Çarpma anı)
        if (!hasImpacted.current) {
          hasImpacted.current = true;
          impactCallback.current?.(side);

          Animated.sequence([
            Animated.timing(impactBounce, { toValue: 0.86, duration: 75, useNativeDriver: true }),
            Animated.spring(impactBounce, { toValue: 1, friction: 3.2, tension: 100, useNativeDriver: true }),
          ]).start();
        }
      });
    }, STAGE_REVEAL_MS + STAGE_SHAKE_MS);

    return () => {
      clearTimeout(shakeTimer);
      clearTimeout(flightTimer);
    };
  }, [side]);

  // Kavisli Yol (Arc Motion / Bezier Curve):
  // X: Düz gitmek yerine dışa doğru geniş kavis çizer (Team A için sola, Team B için sağa savrulur)
  const arcTranslateX = flightVal.interpolate({
    inputRange: [0, 0.28, 0.68, 1.0],
    outputRange: [0, targetX * 0.45, targetX * 1.32, targetX],
  });

  // Y: Başlangıçta havada asılı kalır gibi az iner, sonra hızla yerçekimiyle aşağı dalar
  const arcTranslateY = flightVal.interpolate({
    inputRange: [0, 0.28, 0.68, 1.0],
    outputRange: [0, 18, 92, targetY],
  });

  // Yatay Karar Titremesi (Stage 2)
  const shakeTranslateX = shakeVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-8, 0, 8],
  });

  const shakeRotate = shakeVal.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3.5deg', '0deg', '3.5deg'],
  });

  // Uçuş Sırasında Yörüngeye Göre Eğilme (Stage 4)
  const flightTilt = flightVal.interpolate({
    inputRange: [0, 0.28, 0.68, 1.0],
    outputRange: ['0deg', isTeamA ? '-6deg' : '6deg', isTeamA ? '-11deg' : '11deg', '0deg'],
  });

  // Birleşik X ve Rotasyon
  const combinedX = Animated.add(arcTranslateX, shakeTranslateX);

  // Squash & Stretch: Uçuş sırasında genişlik basılır (0.84), boy uzar (1.12), inişte hedefe oturur (0.52)
  const scaleX = Animated.multiply(
    revealScale,
    Animated.multiply(
      impactBounce,
      flightVal.interpolate({
        inputRange: [0, 0.28, 0.68, 0.95, 1.0],
        outputRange: [1.0, 0.92, 0.84, 0.58, 0.52],
      })
    )
  );

  const scaleY = Animated.multiply(
    revealScale,
    Animated.multiply(
      impactBounce,
      flightVal.interpolate({
        inputRange: [0, 0.28, 0.68, 0.95, 1.0],
        outputRange: [1.0, 1.08, 1.14, 0.52, 0.52],
      })
    )
  );

  // Kart hedefe oturduğunda saydamlaşıp takım listesine entegre olur
  const cardOpacity = Animated.multiply(
    revealOpacity,
    flightVal.interpolate({
      inputRange: [0, 0.88, 1.0],
      outputRange: [1.0, 1.0, 0.1],
    })
  );

  return (
    <Animated.View
      style={[
        s.spotlightReveal,
        {
          opacity: cardOpacity,
          transform: [
            { translateX: combinedX },
            { translateY: arcTranslateY },
            { rotate: phaseText === 'shake' ? shakeRotate : flightTilt },
            { scaleX },
            { scaleY },
          ],
        },
      ]}
    >
      <View
        style={[
          s.spotlightCard,
          {
            borderColor: phaseText === 'reveal' ? '#FFFFFF' : alpha(color, 0.85),
            shadowColor: phaseText === 'reveal' ? '#FFFFFF' : color,
            shadowOpacity: 0.6,
            shadowRadius: 16,
          },
        ]}
      >
        <LinearGradient
          colors={[alpha(color, 0.35), 'rgba(5,10,20,0.96)']}
          style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
        />

        {/* 1. Aşama Beyaz Neon Patlama Işıması */}
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 20,
              borderWidth: 2,
              borderColor: '#FFFFFF',
              backgroundColor: '#FFFFFF',
              opacity: neonGlow.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0, 0.35, 0],
              }),
              shadowColor: '#FFFFFF',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.85,
              shadowRadius: 14,
            },
          ]}
        />

        <Avatar source={avatarFor(player.nickname)} size={70} ring={color} glow />

        <View style={s.spotlightInfo}>
          <Text style={[s.assignment, { color }]}>
            {phaseText === 'shake'
              ? 'HESAPLANIYOR… ⚡'
              : phaseText === 'flight'
              ? `TAKIM ${side}'YE GİDİYOR!`
              : 'YENİ OYUNCU'}
          </Text>
          <Text numberOfLines={1} display style={s.spotlightName}>
            {player.nickname}
          </Text>
          <Text style={[s.assignment, { color }]}>
            {phaseText === 'shake'
              ? 'SİSTEM TARAF SEÇİYOR…'
              : `TAKIM ${side}'YE KATILIYOR`}
          </Text>
        </View>

        <Ionicons
          name={isTeamA ? 'arrow-back-circle' : 'arrow-forward-circle'}
          size={28}
          color={color}
        />
      </View>
    </Animated.View>
  );
}

function PlayerRowItem({ player, color, rolls }: { player: Player; color: string; rolls?: CaptainDuelRoll[] }) {
  const scale = useRef(new Animated.Value(0.72)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 3.8, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={[s.playerRow, { transform: [{ scale }], opacity }]}>
      <Avatar
        source={avatarFor(player.nickname)}
        size={30}
        ring={player.is_captain ? colors.gold : alpha(color, 0.75)}
      />
      <View style={{ flex: 1, paddingVertical: 6, gap: 3 }}>
        <Text numberOfLines={1} style={[s.playerName, { flex: 0 }]}>{player.nickname}</Text>
        {rolls && <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '800' }}>
          Zar: {rolls.length ? rolls.map((roll) => roll.total).join(' → ') : 'Atılmadı'}
        </Text>}
      </View>
      {player.is_captain && <Ionicons name="star" size={13} color={colors.gold} />}
    </Animated.View>
  );
}

function TeamColumn({
  side,
  players,
  visibleAt,
  impactScale,
  impactGlow,
  rolls,
}: {
  side: Side;
  players: Player[];
  visibleAt?: (player: Player) => boolean;
  impactScale?: Animated.Value;
  impactGlow?: Animated.Value;
  rolls?: CaptainDuelRoll[];
}) {
  const color = teamColor(side);

  return (
    <Animated.View
      style={[
        s.teamPanel,
        {
          borderColor: alpha(color, 0.45),
          transform: [{ scale: impactScale ?? 1 }],
        },
      ]}
    >
      <LinearGradient
        colors={[alpha(color, 0.3), alpha(color, 0.12), 'rgba(5,10,20,0.94)']}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />

      {/* 5. Aşama: Çarpma anında yanan Neon Işıma Parıltısı */}
      {impactGlow && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 20,
              borderWidth: 2.5,
              borderColor: color,
              backgroundColor: color,
              opacity: impactGlow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }),
              shadowColor: color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.95,
              shadowRadius: 22,
            },
          ]}
        />
      )}

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
        {players.map((player) => {
          const isVisible = !visibleAt || visibleAt(player);
          if (!isVisible) return null;
          return <PlayerRowItem key={player.id} player={player} color={color} rolls={rolls?.filter((roll) => roll.player_id === player.id)} />;
        })}
      </ScrollView>
    </Animated.View>
  );
}

function CaptainCard({ player, side, winningRoll }: { player: Player; side: Side; winningRoll?: CaptainDuelRoll | null }) {
  const color = teamColor(side);
  return (
    <View style={[s.captainCard, { borderColor: alpha(color, 0.55) }]}>
      <LinearGradient colors={[alpha(color, 0.34), 'rgba(5,10,20,0.94)']} style={[StyleSheet.absoluteFill, { borderRadius: 16 }]} />
      <Avatar source={avatarFor(player.nickname)} size={46} ring={colors.gold} glow />
      <View style={s.captainInfo}>
        <Text style={[s.captainTeam, { color }]}>TAKIM {side} KAPTANI</Text>
        <Text numberOfLines={1} style={s.captainName}>{player.nickname}</Text>
        {winningRoll && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Text style={{ fontSize: 11 }}>🎲</Text>
            <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '800' }}>
              {winningRoll.total}
            </Text>
          </View>
        )}
      </View>
      <Ionicons name="ribbon" size={22} color={colors.gold} />
    </View>
  );
}

function GiantDiceDuelArena({
  duel,
  players,
  me,
  onRoll,
  busy,
}: {
  duel: CaptainDuelState;
  players: Player[];
  me: Player;
  onRoll: () => Promise<void>;
  busy: boolean;
}) {
  const isDuelDone = duel.active_side === 'done';
  const side = (isDuelDone ? 'B' : duel.active_side) as Side;
  const color = teamColor(side);
  const turnPlayer = players.find((p) => p.id === duel.turn_player_id);
  const isMyTurn = !isDuelDone && duel.turn_player_id === me.id;
  const isHost = me.is_host;
  const isTiebreaker = duel.round > 1;
  const lastTiebreak = useRef(duel.round);
  useEffect(() => {
    if (duel.round > lastTiebreak.current) soundFx.tiebreak();
    lastTiebreak.current = duel.round;
  }, [duel.round]);

  const currentRoundRolls = (duel.rolls || []).filter((r) => r.round === duel.round);
  const maxRollInRound = currentRoundRolls.length > 0 ? Math.max(...currentRoundRolls.map((r) => r.total)) : 0;

  const [isRolling, setIsRolling] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const prevRollKey = useRef<string | null>(null);

  const currentKey = duel.current_roll ? `${duel.current_roll.player_id}-${duel.current_roll.rolled_at}` : null;

  useEffect(() => {
    if (currentKey && currentKey !== prevRollKey.current) {
      prevRollKey.current = currentKey;
      setIsRolling(true);
      soundFx.diceRoll();
      haptic.light();

      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 180, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 180, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        setIsRolling(false);
        haptic.heavy();
        soundFx.diceStop();
        scaleAnim.setValue(1.15);
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
      }, 1400);

      return () => clearTimeout(timer);
    }
  }, [currentKey, scaleAnim, shakeAnim]);

  const lastRoll = duel.current_roll;
  const lastRoller = lastRoll ? players.find((p) => p.id === lastRoll.player_id) : null;
  const activeDisplaySide = isRolling && lastRoller?.team_side ? lastRoller.team_side : side;
  const activeColor = teamColor(activeDisplaySide);

  const shakeInterpolate = shakeAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-14deg', '0deg', '14deg'],
  });

  const handleRollPress = async () => {
    if (busy || isRolling) return;
    setIsRolling(true);
    soundFx.diceRoll();
    haptic.light();

    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 180, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -1, duration: 180, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    try {
      await onRoll();
    } catch {
      setIsRolling(false);
    }
  };

  return (
    <View style={[s.arenaCard, { borderColor: alpha(activeColor, 0.75) }]}>
      <LinearGradient
        colors={[alpha(activeColor, 0.35), 'rgba(5, 10, 20, 0.96)']}
        style={[StyleSheet.absoluteFill, { borderRadius: 24 }]}
      />

      {/* Arena Header */}
      <View style={s.arenaHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontSize: 18 }}>🎲</Text>
          <Text display style={[s.arenaTitle, { color: activeColor }]}>
            {isDuelDone ? 'DÜELLO TAMAMLANDI' : `TAKIM ${activeDisplaySide} KAPTANLIK DÜELLOSU`}
          </Text>
        </View>
        <View
          style={[
            s.roundBadge,
            { backgroundColor: isTiebreaker ? alpha(colors.gold, 0.28) : 'rgba(255,255,255,0.1)' },
          ]}
        >
          <Text style={[s.roundBadgeText, isTiebreaker && { color: colors.gold }]}>
            {isDuelDone ? '👑 KAPTANLAR BELLİ OLDU' : isTiebreaker ? `⚡ ${duel.round}. TUR: EŞİTLİK BOZMA` : `${duel.round}. TUR`}
          </Text>
        </View>
      </View>

      {/* Turn / Rolling Banner */}
      {isDuelDone && !isRolling ? (
        <View style={[s.turnBanner, { borderColor: colors.gold, backgroundColor: 'rgba(255, 181, 46, 0.2)' }]}>
          <Ionicons name="trophy" size={32} color={colors.gold} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.turnLabel, { color: colors.gold }]}>
              🎉 HER İKİ KAPTAN DA SEÇİLDİ!
            </Text>
            <Text style={s.turnSubtitle}>
              Kaptanlık düellosu başarıyla tamamlandı, oyun başlayabilir!
            </Text>
          </View>
          <Ionicons name="ribbon" size={26} color={colors.gold} />
        </View>
      ) : isRolling ? (
        <View style={[s.turnBanner, { borderColor: colors.gold, backgroundColor: 'rgba(255, 181, 46, 0.16)' }]}>
          {lastRoller && (
            <Avatar source={avatarFor(lastRoller.nickname)} size={40} ring={colors.gold} glow />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.turnLabel, { color: colors.gold }]}>
              🎲 {lastRoller?.nickname ?? 'Oyuncu'} ZARLARI ATIYOR…
            </Text>
            <Text style={s.turnSubtitle}>Zarlar yuvarlanıyor, tüm oda canlı izliyor!</Text>
          </View>
          <Pulse amount={1.2}>
            <Ionicons name="refresh-circle" size={24} color={colors.cyan} />
          </Pulse>
        </View>
      ) : (
        <View
          style={[
            s.turnBanner,
            {
              borderColor: isMyTurn ? colors.gold : alpha(color, 0.5),
              backgroundColor: isMyTurn ? 'rgba(255, 181, 46, 0.16)' : 'rgba(5, 12, 24, 0.85)',
            },
          ]}
        >
          {turnPlayer && (
            <Avatar
              source={avatarFor(turnPlayer.nickname)}
              size={40}
              ring={isMyTurn ? colors.gold : color}
              glow={isMyTurn}
            />
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.turnLabel, { color: isMyTurn ? colors.gold : colors.cyan }]}>
              {isMyTurn ? '👉 SENİN SIRAN!' : `SIRA: ${turnPlayer?.nickname ?? 'Oyuncu'}`}
            </Text>
            <Text style={s.turnSubtitle}>
              {isMyTurn
                ? 'Lider olmak için zarları at!'
                : `${turnPlayer?.nickname ?? 'Oyuncu'} butona basarak zarlarını atıyor…`}
            </Text>
          </View>
          {isMyTurn && (
            <Pulse amount={1.2}>
              <Ionicons name="sparkles" size={24} color={colors.gold} />
            </Pulse>
          )}
        </View>
      )}

      {/* GIANT DICE TABLE (Ekranın Büyük Kısmı) */}
      <View style={s.diceTable}>
        <Animated.View
          style={[
            s.diceRow,
            {
              transform: [{ rotate: shakeInterpolate }, { scale: scaleAnim }],
            },
          ]}
        >
          <DieFace value={lastRoll?.d1 ?? 6} rolling={isRolling} size={88} />
          <View style={{ width: 14 }} />
          <DieFace value={lastRoll?.d2 ?? 6} rolling={isRolling} size={88} />
        </Animated.View>

        {/* Big Score Bubble */}
        <View style={s.scoreRow}>
          {isRolling ? (
            <View style={s.rollingBadge}>
              <Ionicons name="refresh-circle" size={18} color={colors.cyan} />
              <Text style={s.rollingText}>Zarlar Dönüyor…</Text>
            </View>
          ) : lastRoll ? (
            <View style={s.totalBadge}>
              <Text style={s.lastRollerName}>{lastRoller?.nickname}: </Text>
              <Text style={s.totalNumber}>
                {lastRoll.d1} + {lastRoll.d2} = {lastRoll.total}
              </Text>
              {lastRoll.total === maxRollInRound && (
                <Ionicons name="star" size={16} color={colors.gold} style={{ marginLeft: 4 }} />
              )}
            </View>
          ) : (
            <View style={s.waitingBadge}>
              <Text style={s.waitingBadgeText}>Zar atmak için butona basın!</Text>
            </View>
          )}
        </View>
      </View>

      {/* Action Button: "ZARLARI AT 🎲🎲" */}
      <View style={s.actionRow}>
        {isDuelDone && !isRolling ? (
          <View style={{ alignItems: 'center', paddingVertical: 6, gap: 4 }}>
            <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 14 }}>
              👑 Kaptanlar Seçildi! Sonuçlar gösteriliyor…
            </Text>
          </View>
        ) : isMyTurn ? (
          <Pulse amount={1.03}>
            <Btn
              title="ZARLARI AT 🎲🎲"
              tone="gold"
              size="lg"
              loading={busy || isRolling}
              onPress={handleRollPress}
              style={s.rollBtn}
            />
          </Pulse>
        ) : isHost ? (
          <View style={{ gap: 6 }}>
            <View style={s.spectatorRow}>
              <Ionicons name="eye" size={16} color={colors.cyan} />
              <Text style={s.spectatorText}>
                {turnPlayer?.nickname} zarlarını atıyor… Canlı izleniyor
              </Text>
            </View>
            <Btn
              title={`${turnPlayer?.nickname ?? 'Oyuncu'} Yerine At (Kurucu)`}
              tone="ghost"
              size="md"
              loading={busy || isRolling}
              onPress={handleRollPress}
            />
          </View>
        ) : (
          <View style={s.spectatorRow}>
            <Ionicons name="eye" size={18} color={colors.cyan} />
            <Text style={s.spectatorText}>
              {turnPlayer?.nickname} zarlarını atıyor… Canlı izleniyor
            </Text>
          </View>
        )}
      </View>

      {/* Round Rolls Board (Mevcut Tur Skorları) */}
      {currentRoundRolls.length > 0 && (
        <View style={s.standingsBox}>
          <Text style={s.standingsTitle}>Bu Turun Zarları:</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.standingsScroll}
          >
            {currentRoundRolls.map((r) => {
              const p = players.find((pl) => pl.id === r.player_id);
              const isLead = r.total === maxRollInRound;
              return (
                <View key={r.player_id} style={[s.standingChip, isLead && s.standingChipLead]}>
                  <Avatar source={avatarFor(p?.nickname ?? '')} size={22} ring={isLead ? colors.gold : color} />
                  <Text numberOfLines={1} style={s.standingNick}>{p?.nickname}</Text>
                  <Text style={[s.standingScore, isLead && { color: colors.gold }]}>
                    🎲 {r.total}
                  </Text>
                  {isLead && <Ionicons name="star" size={11} color={colors.gold} />}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Tie notice */}
      {isTiebreaker && (
        <View style={s.tieNotice}>
          <Ionicons name="flash" size={14} color={colors.gold} />
          <Text style={s.tieNoticeText}>
            Önceki tur berabere bitti! En yüksek atanlar arasında tekrar zar atılıyor.
          </Text>
        </View>
      )}
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

  // 5. Aşama: Hedef takım kutusu için Elastik Çarpma & Neon Parlama animasyonları
  const impactA = useRef(new Animated.Value(1)).current;
  const glowA = useRef(new Animated.Value(0)).current;
  const impactB = useRef(new Animated.Value(1)).current;
  const glowB = useRef(new Animated.Value(0)).current;

  const handleImpact = (side: Side) => {
    haptic.heavy();
    soundFx.teamLanding();
    const impactVal = side === 'A' ? impactA : impactB;
    const glowVal = side === 'A' ? glowA : glowB;

    impactVal.setValue(1);
    glowVal.setValue(1);

    Animated.parallel([
      Animated.sequence([
        Animated.timing(impactVal, { toValue: 1.06, duration: 75, useNativeDriver: true }),
        Animated.spring(impactVal, { toValue: 1, friction: 3.5, tension: 90, useNativeDriver: true }),
      ]),
      Animated.timing(glowVal, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (timeline.phaseStartedAt === phaseStartedAt) return;
    setTimeline({ phaseStartedAt, startedAt: Date.now() });
  }, [phaseStartedAt, timeline.phaseStartedAt]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 80);
    return () => clearInterval(timer);
  }, []);

  const players = [...ctx.data.players].sort((a, b) => a.joined_at.localeCompare(b.joined_at) || a.id.localeCompare(b.id));
  const playersBySide = {
    A: players.filter((player) => player.team_side === 'A'),
    B: players.filter((player) => player.team_side === 'B'),
  };

  const activeIndex = Math.floor((elapsed - PLAYER_START_MS) / PLAYER_INTERVAL_MS);
  const activePlayer = activeIndex >= 0 && activeIndex < players.length && elapsed < PLAYER_START_MS + players.length * PLAYER_INTERVAL_MS
    ? players[activeIndex]
    : null;

  // Her oyuncu için hızlanma sesi yalnızca bir kez çalar.
  // Takım animasyonu ilerlerken veri yenilemeleri sesi yeniden tetiklemez.
  const lastLaunchKey = useRef<string | null>(null);
  useEffect(() => {
    if (!activePlayer) return;
    const key = `${phaseStartedAt}:${activePlayer.id}`;
    if (lastLaunchKey.current === key) return;
    lastLaunchKey.current = key;
    soundFx.teamLaunch();
  }, [activePlayer?.id, phaseStartedAt]);

  const captainDuel = ctx.data.room.captain_duel;
  const hasInteractiveDuel = !!captainDuel;

  const totalPlacementDuration = PLAYER_START_MS + players.length * PLAYER_INTERVAL_MS;
  const hasAnyRoll = !!(captainDuel?.rolls && captainDuel.rolls.length > 0);
  const isPlacingTeams = elapsed < totalPlacementDuration && !hasAnyRoll;

  // Kurucu "Zar Düellosuna Başla" butonuna bastı mı?
  const isDuelStarted = captainDuel?.started === true || hasAnyRoll;

  const [showCaptainsSummary, setShowCaptainsSummary] = useState(false);

  useEffect(() => {
    if (captainDuel?.active_side === 'done') {
      const lastRollTime = captainDuel.current_roll?.rolled_at
        ? new Date(captainDuel.current_roll.rolled_at).getTime()
        : 0;
      const isFreshRoll = Date.now() - lastRollTime < 5000;

      if (!isFreshRoll) {
        setShowCaptainsSummary(true);
      } else {
        const timer = setTimeout(() => {
          setShowCaptainsSummary(true);
        }, 3600);
        return () => clearTimeout(timer);
      }
    } else {
      setShowCaptainsSummary(false);
    }
  }, [captainDuel?.active_side, captainDuel?.current_roll?.rolled_at]);

  const isDuelActive = hasInteractiveDuel && isDuelStarted && !showCaptainsSummary;
  const captainsFinished = hasInteractiveDuel ? captainDuel.active_side === 'done' : elapsed >= 10000;

  // Oyuncunun takım kutusuna çarptığı tam an
  const visibleAt = (player: Player) => {
    const idx = players.findIndex((p) => p.id === player.id);
    return elapsed >= PLAYER_START_MS + idx * PLAYER_INTERVAL_MS + (STAGE_REVEAL_MS + STAGE_SHAKE_MS + STAGE_FLIGHT_MS);
  };

  const captains = (['A', 'B'] as const)
    .map((side) => playersBySide[side].find((player) => player.is_captain))
    .filter((player): player is Player => !!player);

  const handleRollDice = async () => {
    if (busy) return;
    setBusy(true);
    try {
      haptic.medium();
      soundFx.click();
      await api.rollCaptainDice(ctx.data.room.id);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleStartDuel = async () => {
    if (!ctx.me.is_host || busy) return;
    setBusy(true);
    try {
      haptic.medium();
      soundFx.click();
      await api.startCaptainDuel(ctx.data.room.id);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    if (!ctx.me.is_host || !captainsFinished || busy) return;
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
    if (!ctx.me.is_host || busy) return;
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
        {/* Header Row */}
        <View style={s.headerRow}>
          <View style={s.heading}>
            <Eyebrow live color={colors.mint} dot={colors.mint}>
              {isPlacingTeams
                ? 'Takım Dağılımı'
                : !isDuelStarted
                ? 'Takımlar Hazır'
                : isDuelActive
                ? 'Canlı Kaptanlık Düellosu'
                : 'Takımlar ve Liderler'}
            </Eyebrow>
            <Text display style={s.title}>
              {isPlacingTeams
                ? 'Taraflar Belli Oluyor'
                : !isDuelStarted
                ? 'Kadrolar Belirlendi! ⚔️'
                : isDuelActive
                ? 'Zarları At, Lider Ol! 🎲'
                : 'Takımlar ve Kaptanlar'}
            </Text>
            <Text style={s.subtitle}>
              {isPlacingTeams
                ? 'Oyuncular sırayla takımlarına yerleşiyor'
                : !isDuelStarted
                ? 'Takımlar oluşturuldu, kaptanlar zar düellosuyla seçilecek'
                : isDuelActive
                ? 'Oyuncular sırayla 2 zar atıyor, en yüksek atan kaptan seçiliyor'
                : 'Takım dağılımı ve kaptanlar tamamlandı'}
            </Text>
          </View>
          <RoomExitButton onExit={ctx.exitRoom} />
        </View>

        {/* 1. AŞAMA: TAKIM DAĞILIMI (Animasyon Aşaması) */}
        {isPlacingTeams ? (
          <View style={{ gap: 10 }}>
            <View style={s.spotlight}>
              {activePlayer ? (
                <PlayerSpotlight
                  key={activePlayer.id}
                  player={activePlayer}
                  onImpact={handleImpact}
                />
              ) : (
                <View style={s.waitingSpotlight}>
                  <Ionicons name="people" size={22} color={colors.cyan} />
                  <Text style={s.waitingText}>Takımlar belirleniyor…</Text>
                </View>
              )}
            </View>

            <View style={[s.teams, { height: Math.max(160, Math.min(250, height - 460)) }]}>
              <TeamColumn
                side="A"
                players={playersBySide.A}
                visibleAt={visibleAt}
                impactScale={impactA}
                impactGlow={glowA}
              />
              <TeamColumn
                side="B"
                players={playersBySide.B}
                visibleAt={visibleAt}
                impactScale={impactB}
                impactGlow={glowB}
              />
            </View>
          </View>
        ) : !isDuelStarted ? (
          /* 1.5. AŞAMA: TAKIMLAR OLUŞTURULDU - ZAR DÜELLOSU ÖNCESİ KADRO İNCELEME */
          <View style={{ gap: 10 }}>
            <View style={s.spotlight}>
              <View style={s.readySpotlight}>
                <LinearGradient
                  colors={[alpha(colors.cyan, 0.16), 'rgba(5, 10, 20, 0.94)']}
                  style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
                />
                <Ionicons name="shield-checkmark" size={28} color={colors.cyan} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text display style={s.readyTitle}>Takımlar Belirlendi! ⚔️</Text>
                  <Text style={s.readySubtitle}>
                    {ctx.me.is_host
                      ? 'Kaptanlık zar düellosunu başlatmak için aşağıdaki butona tıklayın'
                      : 'Kurucunun kaptanlık zar düellosunu başlatması bekleniyor…'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[s.teams, { height: Math.max(160, Math.min(260, height - 440)) }]}>
              <TeamColumn side="A" players={playersBySide.A} />
              <TeamColumn side="B" players={playersBySide.B} />
            </View>
          </View>
        ) : isDuelActive && captainDuel ? (
          /* 2. AŞAMA: BÜYÜK ZAR DÜELLOSU (Takımlar oturduktan ve kurucu başlattıktan sonra) */
          <Reveal key="giant-arena" style={{ width: '100%' }}>
            <GiantDiceDuelArena
              duel={captainDuel}
              players={players}
              me={ctx.me}
              onRoll={handleRollDice}
              busy={busy}
            />
          </Reveal>
        ) : (
          /* 3. AŞAMA: KAPTANLAR BELLİ OLDU (Oyun başlatmaya hazır) */
          <View style={{ gap: 10 }}>
            <View style={[s.teams, { height: Math.max(160, Math.min(260, height - 440)) }]}>
              <TeamColumn side="A" players={playersBySide.A} rolls={captainDuel?.rolls} />
              <TeamColumn side="B" players={playersBySide.B} rolls={captainDuel?.rolls} />
            </View>

            <View style={s.captainsSection}>
              <Reveal>
                <Pulse amount={1.025}>
                  <View style={s.captainsReveal}>
                    <View style={s.captainsTitleRow}>
                      <Ionicons name="ribbon" size={20} color={colors.gold} />
                      <Text display style={s.captainsTitle}>SEÇİLEN KAPTANLARINIZ</Text>
                      <Ionicons name="ribbon" size={20} color={colors.gold} />
                    </View>
                    <View style={s.captainGrid}>
                      {captains.map((player) => {
                        const side = player.team_side as Side;
                        const lastRoll = captainDuel?.rolls
                          ?.filter((r) => r.player_id === player.id)
                          ?.slice(-1)[0];
                        return (
                          <CaptainCard
                            key={player.id}
                            player={player}
                            side={side}
                            winningRoll={lastRoll}
                          />
                        );
                      })}
                    </View>
                  </View>
                </Pulse>
              </Reveal>
            </View>
          </View>
        )}

        {/* Alt Aksiyon / Bilgilendirme Bölümü */}
        <View style={s.actionSection}>
          {isPlacingTeams ? (
            <View style={s.hostWaiting}>
              <Ionicons name="sparkles" size={18} color={colors.gold} />
              <Text style={s.hostWaitingText}>
                Takım yerleşimi yapılıyor… Sırayla takımlar oluşturuluyor
              </Text>
            </View>
          ) : !isDuelStarted ? (
            ctx.me.is_host ? (
              <View style={s.hostActions}>
                <Btn
                  title="Takımları Yeniden Karıştır"
                  icon="shuffle"
                  tone="ghost"
                  size="md"
                  loading={busy}
                  onPress={shuffleTeams}
                />
                <Btn
                  title="Kaptanlık Zar Düellosuna Başla"
                  icon="dice"
                  tone="success"
                  size="lg"
                  loading={busy}
                  onPress={handleStartDuel}
                />
              </View>
            ) : (
              <View style={s.hostWaiting}>
                <Ionicons name="hourglass" size={18} color={colors.cyan} />
                <Text style={s.hostWaitingText}>
                  Takımlar oluşturuldu! Kurucunun zar düellosunu başlatması bekleniyor…
                </Text>
              </View>
            )
          ) : !captainsFinished ? (
            <View style={s.hostWaiting}>
              <Ionicons name="dice" size={18} color={colors.gold} />
              <Text style={s.hostWaitingText}>
                Tüm kaptanlar zar düellosuyla seçilince oyun başlayabilir
              </Text>
            </View>
          ) : ctx.me.is_host ? (
            <View style={s.hostActions}>
              <Btn
                title="Takımları Karıştır"
                icon="shuffle"
                tone="ghost"
                size="md"
                loading={busy}
                onPress={shuffleTeams}
              />
              <Btn
                title="Oyuna Başla"
                icon="rocket"
                tone="success"
                loading={busy}
                onPress={startGame}
              />
            </View>
          ) : (
            <View style={s.hostWaiting}>
              <Ionicons name="hourglass" size={18} color={colors.cyan} />
              <Text style={s.hostWaitingText}>Kurucunun oyunu başlatması bekleniyor…</Text>
            </View>
          )}
        </View>
      </View>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, justifyContent: 'flex-start', gap: 10, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  heading: { flex: 1, alignItems: 'center', gap: 2, paddingTop: 2 },
  title: { color: colors.text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: colors.muted, fontSize: 11.5, textAlign: 'center' },

  spotlight: { minHeight: 122, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  spotlightReveal: { width: '100%', maxWidth: 350, alignSelf: 'center' },
  spotlightCard: { minHeight: 108, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 20, borderWidth: 1.8, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  spotlightInfo: { flex: 1, gap: 3 },
  spotlightName: { color: colors.text, fontSize: 23, fontWeight: '900' },
  assignment: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  waitingSpotlight: { width: '100%', maxWidth: 350, alignSelf: 'center', height: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.glass },
  waitingText: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  readySpotlight: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: alpha(colors.cyan, 0.45),
    backgroundColor: colors.glassStrong,
    overflow: 'hidden',
    width: '100%',
    maxWidth: 350,
    alignSelf: 'center',
  },
  readyTitle: { color: colors.cyan, fontSize: 17, fontWeight: '900' },
  readySubtitle: { color: colors.textSoft, fontSize: 11.5, fontWeight: '600', lineHeight: 16 },

  /* Giant Arena Styles */
  arenaCard: {
    borderRadius: 24,
    borderWidth: 2,
    backgroundColor: colors.glassStrong,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  arenaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 8,
  },
  arenaTitle: { fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  roundBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  roundBadgeText: { color: colors.textSoft, fontSize: 10.5, fontWeight: '900' },

  turnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  turnLabel: { fontSize: 13, fontWeight: '900', letterSpacing: 0.4 },
  turnSubtitle: { color: colors.textSoft, fontSize: 11, fontWeight: '600' },

  diceTable: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  diceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rollingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 229, 255, 0.16)',
  },
  rollingText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  totalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 181, 46, 0.2)',
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.5),
  },
  lastRollerName: { color: colors.textSoft, fontSize: 13, fontWeight: '700' },
  totalNumber: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  waitingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  waitingBadgeText: { color: colors.muted, fontSize: 11, fontWeight: '700' },

  actionRow: {
    gap: 6,
  },
  rollBtn: {
    height: 56,
  },
  spectatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 6,
  },
  spectatorText: { color: colors.textSoft, fontSize: 12, fontWeight: '700', textAlign: 'center' },

  standingsBox: {
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    paddingTop: 8,
  },
  standingsTitle: { color: colors.muted, fontSize: 10.5, fontWeight: '800' },
  standingsScroll: { gap: 6 },
  standingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  standingChipLead: {
    backgroundColor: 'rgba(255, 181, 46, 0.16)',
    borderColor: alpha(colors.gold, 0.5),
  },
  standingNick: { color: colors.text, fontSize: 11, fontWeight: '700', maxWidth: 80 },
  standingScore: { color: colors.textSoft, fontSize: 11, fontWeight: '900' },

  tieNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  tieNoticeText: { color: colors.gold, fontSize: 11, fontWeight: '800', textAlign: 'center' },

  /* Team Panels */
  teams: { flexDirection: 'row', alignItems: 'stretch', gap: 8, minHeight: 0 },
  teamPanel: { flex: 1, overflow: 'hidden', padding: 10, gap: 8, borderWidth: 1, borderRadius: 20, backgroundColor: colors.glassStrong },
  teamHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mascot: { width: 36, height: 36, borderRadius: 18 },
  teamBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderRadius: 10 },
  teamDot: { width: 7, height: 7, borderRadius: 4 },
  teamTitle: { color: colors.text, fontSize: 16, fontWeight: '900' },
  teamSubtitle: { color: colors.textSoft, fontSize: 11, fontWeight: '700', marginTop: 2 },
  rosterScroll: { flex: 1, minHeight: 0 },
  roster: { gap: 6, paddingBottom: 2 },
  playerRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 7, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(5,10,20,0.82)' },
  playerName: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800' },

  /* Captains Section */
  captainsSection: { minHeight: 76, justifyContent: 'center' },
  captainsReveal: { gap: 8 },
  captainsTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  captainsTitle: { color: colors.gold, fontSize: 16, fontWeight: '900' },
  captainGrid: { flexDirection: 'row', gap: 8 },
  captainCard: { flex: 1, minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, backgroundColor: colors.glassStrong, overflow: 'hidden' },
  captainInfo: { flex: 1, gap: 2 },
  captainTeam: { color: colors.textSoft, fontSize: 10, fontWeight: '800' },
  captainName: { color: colors.text, fontSize: 14, fontWeight: '900' },

  actionSection: { flexGrow: 1, minHeight: 46, justifyContent: 'flex-end' },
  hostActions: { gap: 7 },
  hostWaiting: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  hostWaitingText: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'center' },
});

