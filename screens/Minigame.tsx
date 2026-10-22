import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Hint } from '../components/Hint';
import { Scoreboard } from '../components/Scoreboard';
import {
  Avatar, Btn, Card, Chip, Eyebrow, IconName, Muted, ProgressBar, Pulse, Screen, SectionLabel, TimerBar, Title, Text, useToast,
} from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api, GameError } from '../lib/api';
import { avatarFor } from '../lib/art';
import { latestMinigame, secondsLeft } from '../lib/selectors';
import { alpha, colors, gradients, teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, MinigameEntry } from '../lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MinigameScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const now = useNow(100);
  const mg = latestMinigame(data.minigames);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  if (!mg) {
    return (
      <Screen>
        <Scoreboard ctx={ctx} />
        <View style={s.center}>
          <View style={s.bigIcon}><Ionicons name="happy" size={40} color={colors.magenta} /></View>
          <Title size={26}>Devre Arası!</Title>
          <Muted>Mini oyun hazırlanıyor…</Muted>
        </View>
      </Screen>
    );
  }

  const entries = data.entries.filter((e) => e.minigame_id === mg.id);
  const mine = entries.find((e) => e.player_id === me.id);
  const live = mg.status === 'live';
  const goAt = mg.starts_at ? Date.parse(mg.starts_at) : 0;
  const go = now >= goAt;
  const total = data.players.length;
  const left = secondsLeft(data.room.phase_ends_at, now);

  // mg.id'ye göre her devre arasında senkronize ve adil mini-oyun varyantı:
  const code = (mg.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const mod = code % 3;
  const variant: 'reflex' | 'memory' | 'balance' =
    mg.kind === 'social_guess' ? 'reflex' : mod === 0 ? 'reflex' : mod === 1 ? 'memory' : 'balance';

  const tap = async (target?: string, guess?: number) => {
    if (mine || busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 8; i++) {
        try {
          await api.minigameEntry(mg.id, target, guess);
          soundFx.correct();
          haptic.success();
          return;
        } catch (e) {
          if (!(e instanceof GameError) || e.code !== 'too_early') throw e;
          await sleep(120);
        }
      }
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reflexMs = mine?.reaction_ms;

  const mode: { icon: IconName; label: string; color: string } =
    mg.kind === 'social_guess' ? { icon: 'people', label: 'Grup içi itiraf', color: colors.violet }
    : mg.kind === 'math_guess' ? { icon: 'calculator', label: 'Hızlı Matematik & Tahmin', color: colors.cyan }
    : variant === 'memory' ? { icon: 'bulb', label: 'Hızlı eşleştirme', color: colors.cyan }
    : variant === 'balance' ? { icon: 'options', label: 'Hassas denge', color: colors.mint }
    : { icon: 'flash', label: 'Refleks basma', color: colors.yellow };

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Scoreboard ctx={ctx} />

        <View style={s.header}>
          <Eyebrow live icon={mode.icon} color={mode.color} dot={mode.color}>{mode.label}</Eyebrow>
          <Title size={30}>Devre Arası</Title>
        </View>

        <Hint id="minigame" text="Mini oyunu kazanan takım bonus parça alır!" />

        {live && (
          <TimerBar
            left={left}
            total={mg.kind === 'social_guess' ? 40 : 30}
            label="Kalan Süre"
            color={mode.color}
          />
        )}

        {mg.kind === 'math_guess' ? (
          <MathGuessGame
            ctx={ctx}
            entries={entries}
            prompt={mg.prompt ?? 'Sayıyı tahmin et'}
            targetNum={mg.target_num ?? null}
            live={live}
            mineGuess={mine?.guess_num ?? null}
            onSubmit={(guess) => tap(undefined, guess)}
            busy={busy}
          />
        ) : mg.kind === 'reflex' ? (
          variant === 'memory' ? (
            <MemoryGame
              seed={mg.id || ''}
              live={live}
              go={go}
              mineDone={!!mine}
              reactionMs={reflexMs ?? null}
              onComplete={() => tap()}
            />
          ) : variant === 'balance' ? (
            <BalanceGame
              live={live}
              go={go}
              mineDone={!!mine}
              reactionMs={reflexMs ?? null}
              onComplete={() => tap()}
            />
          ) : (
            <ReflexGame
              live={live}
              go={go}
              mineDone={!!mine}
              reactionMs={reflexMs ?? null}
              onTap={() => {
                soundFx.pop();
                haptic.medium();
                tap();
              }}
              onEarly={() => {
                soundFx.wrong();
                haptic.error();
                show('Çok erken! Bekle…', 'error');
              }}
            />
          )
        ) : (
          <SocialGuess
            ctx={ctx}
            prompt={mg.prompt ?? ''}
            live={live}
            entriesCount={entries.length}
            mineTarget={mine?.target_player_id ?? null}
            tap={tap}
            busy={busy}
          />
        )}

        {/* Katılım Durumu */}
        <View style={s.progressWrap}>
          <View style={s.progressHead}>
            <Eyebrow icon="people" color={colors.muted}>Tamamlayan</Eyebrow>
            <Text display style={s.statusText}>{entries.length} / {total}</Text>
          </View>
          <ProgressBar pct={total ? entries.length / total : 0} colors={gradients.success} height={8} />
        </View>

        {/* Sonuç Kartı */}
        {!live && (
          <Card accent={mg.winner_side ? teamColor(mg.winner_side) : colors.muted} style={s.winnerCard}>
            <View style={[s.bigIcon, { marginBottom: 0, backgroundColor: alpha(colors.gold, 0.14), borderColor: alpha(colors.gold, 0.5) }]}>
              <Ionicons name={mg.winner_side ? 'trophy' : 'hand-left'} size={38} color={colors.gold} />
            </View>
            <Title size={24} color={mg.winner_side ? teamColor(mg.winner_side) : colors.text}>
              {mg.winner_side ? `${teamName(mg.winner_side)} Kazandı!` : 'Berabere!'}
            </Title>
            <Muted>{mg.winner_side ? 'Bonus parça + 2 puan' : 'Bu sefer bonus yok.'}</Muted>
          </Card>
        )}
      </ScrollView>
      {toast}
    </Screen>
  );
}

// =================================================================
// 1. REFLEKS OYUNU
// =================================================================
function ReflexGame({
  live, go, mineDone, reactionMs, onTap, onEarly,
}: {
  live: boolean; go: boolean; mineDone: boolean; reactionMs: number | null;
  onTap: () => void; onEarly: () => void;
}) {
  const idle = !live || mineDone;
  const tint = idle ? colors.cyan : go ? colors.mint : colors.red;
  const grad: readonly [string, string] = idle ? ['#1A2D4E', '#0E1A30'] : go ? gradients.success : gradients.danger;
  return (
    <View style={s.reflexWrap}>
      <Text style={[s.gameInstruction, { color: go && !idle ? colors.mint : colors.textSoft }]}>
        {idle ? (mineDone ? 'Tepki süren kaydedildi' : 'Oyun bitti') : go ? 'ŞİMDİ DOKUN!' : 'Ekran yeşil olunca dokun, erken dokunma!'}
      </Text>
      <Pulse active={live && go && !mineDone} amount={1.05}>
        <View style={s.ringOuter}>
          <View style={[s.ringMid, { borderColor: alpha(tint, 0.18), backgroundColor: alpha(tint, 0.05) }]}>
            <Pressable
              onPress={() => (go ? onTap() : onEarly())}
              disabled={!live || mineDone}
              style={({ pressed }) => [
                s.reflexBtn,
                { shadowColor: tint, transform: [{ scale: pressed ? 0.95 : 1 }] },
              ]}
            >
              <LinearGradient colors={grad} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.reflexFill}>
                <View style={s.reflexSheen} />
                {idle ? (
                  <>
                    <Ionicons name={mineDone ? 'speedometer' : 'flag'} size={34} color={colors.textSoft} />
                    <Text display style={s.reflexMs}>{mineDone ? `${reactionMs} ms` : 'Bitti'}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name={go ? 'hand-left' : 'hourglass'} size={36} color={go ? '#05281A' : '#fff'} />
                    <Text display style={[s.reflexText, go && { color: '#05281A' }]}>{go ? 'BAS!' : 'BEKLE'}</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Pulse>
    </View>
  );
}

// =================================================================
// 2. HAFIZA & SIRALAMA (SIMON SAYS)
// =================================================================
const MEMORY_PIECES = [
  { id: 0, emoji: '🦄', name: 'Boynuz' },
  { id: 1, emoji: '👁️', name: 'Göz' },
  { id: 2, emoji: '🛞', name: 'Teker' },
  { id: 3, emoji: '🧦', name: 'Çorap' },
  { id: 4, emoji: '🦷', name: 'Diş' },
  { id: 5, emoji: '🪽', name: 'Kanat' },
];

// mg.id'den deterministik karıştırma: her turda farklı, iki takımda aynı sıra (4 parça)
function seededSequence(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = MEMORY_PIECES.map((p) => p.id);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, 4);
}

function MemoryGame({
  seed, live, go, mineDone, reactionMs, onComplete,
}: {
  seed: string; live: boolean; go: boolean; mineDone: boolean; reactionMs: number | null;
  onComplete: () => void;
}) {
  const sequence = useMemo(() => seededSequence(seed), [seed]); // 4 adımlı sıralama
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [showingStep, setShowingStep] = useState<number | null>(null);
  const [showing, setShowing] = useState(!mineDone);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);
  const startTime = useRef(0);
  const demonstratedRef = useRef(false);

  useEffect(() => {
    if (!live || !go || mineDone) return;
    if (demonstratedRef.current) return;
    demonstratedRef.current = true;

    setShowing(true);
    setPlayerIdx(0);
    setShowingStep(null);
    setErrorFlash(false);

    const stepDuration = 650; // 650ms adım aralığı (akıcı & hızlı)
    const activeDuration = 480; // 480ms yanar
    const startDelay = 500; // Başlamadan önce 0.5s hazırlık

    const timers: ReturnType<typeof setTimeout>[] = [];

    sequence.forEach((val, step) => {
      // Kartı yak & ses ver
      const tOn = setTimeout(() => {
        setActiveStep(val);
        setShowingStep(step + 1);
        soundFx.pop();
        haptic.light();
      }, startDelay + step * stepDuration);
      timers.push(tOn);

      // Kartı söndür
      const tOff = setTimeout(() => {
        setActiveStep(null);
      }, startDelay + step * stepDuration + activeDuration);
      timers.push(tOff);
    });

    const doneTimer = setTimeout(() => {
      setShowing(false);
      setShowingStep(null);
      startTime.current = Date.now();
      soundFx.whistle();
    }, startDelay + sequence.length * stepDuration + 150);
    timers.push(doneTimer);

    return () => timers.forEach(clearTimeout);
  }, [live, go, mineDone, sequence]);

  const handleTap = (id: number) => {
    if (showing || mineDone || !live) return;

    if (id === sequence[playerIdx]) {
      // Doğru parça
      soundFx.click();
      haptic.light();
      const next = playerIdx + 1;
      setPlayerIdx(next);

      if (next === sequence.length) {
        // Tüm parçalar başarıyla tamamlandı!
        soundFx.correct();
        haptic.success();
        onComplete();
      }
    } else {
      // Hatalı dokunuş
      soundFx.wrong();
      haptic.error();
      setErrorFlash(true);
      setTimeout(() => setErrorFlash(false), 800);
      setPlayerIdx(0); // Baştan başla
    }
  };

  const status: { icon: IconName; text: string; color: string } = showing
    ? { icon: 'eye', text: `Sıralamayı aklında tut (${showingStep ?? 1}/${sequence.length})`, color: colors.cyan }
    : mineDone
    ? { icon: 'checkmark-circle', text: 'Harika! Başarıyla tamamlandı', color: colors.mint }
    : errorFlash
    ? { icon: 'close-circle', text: 'Hatalı! Baştan başla…', color: colors.red }
    : { icon: 'finger-print', text: `Sıra sende! Dokun (${playerIdx}/${sequence.length})`, color: colors.yellow };

  const isClickable = !showing && !mineDone && live;

  return (
    <Card style={s.gameContainer}>
      <View style={[s.statusBanner, { backgroundColor: alpha(status.color, 0.12), borderColor: alpha(status.color, 0.4) }]}>
        <Ionicons name={status.icon} size={18} color={status.color} />
        <Text style={[s.statusBannerText, { color: status.color }]}>{status.text}</Text>
      </View>

      <View style={s.memoryGrid}>
        {MEMORY_PIECES.map((item) => {
          const isHighlighted = activeStep === item.id;
          return (
            <Pressable
              key={item.id}
              disabled={!isClickable}
              onPress={() => handleTap(item.id)}
              style={({ pressed }) => [
                s.memoryCard,
                isHighlighted && s.memoryCardActive,
                isClickable && { borderColor: alpha(colors.cyan, 0.45) },
                pressed && { transform: [{ scale: 0.94 }] },
              ]}
            >
              {isHighlighted && showingStep && (
                <View style={s.stepBadge}>
                  <Text display style={s.stepBadgeText}>{showingStep}</Text>
                </View>
              )}
              <Text style={{ fontSize: 40 }}>{item.emoji}</Text>
              <Text style={[s.memoryName, isHighlighted && { color: colors.mint }]}>{item.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {mineDone && reactionMs != null && <Chip icon="speedometer" label={`${reactionMs} ms`} color={colors.mint} />}
    </Card>
  );
}

// =================================================================
// 3. DENGE / ÇEKMECE OYUNU
// =================================================================
function BalanceGame({
  live, go, mineDone, reactionMs, onComplete,
}: {
  live: boolean; go: boolean; mineDone: boolean; reactionMs: number | null;
  onComplete: () => void;
}) {
  const [pos, setPos] = useState(50); // 0 ile 100 arası
  const [score, setScore] = useState(0); // 0 ile 100 (tam dolunca kazanır)
  const isDoneRef = useRef(false);

  useEffect(() => {
    if (!live || !go || mineDone) return;
    isDoneRef.current = false;

    const interval = setInterval(() => {
      setPos((prev) => {
        // Rastgele rüzgar / kayma kuvveti
        const drift = (Math.random() - 0.5) * 8;
        const next = Math.max(5, Math.min(95, prev + drift));

        // Hedef yeşil alan: 35 ile 65 arası
        if (next >= 35 && next <= 65) {
          setScore((s) => {
            const n = s + 4;
            if (n >= 100 && !isDoneRef.current) {
              isDoneRef.current = true;
              soundFx.correct();
              haptic.success();
              onComplete();
            }
            return Math.min(100, n);
          });
        }
        return next;
      });
    }, 80);

    return () => clearInterval(interval);
  }, [live, go, mineDone]);

  const nudge = (dir: -1 | 1) => {
    if (mineDone || !live) return;
    soundFx.pop();
    haptic.light();
    setPos((prev) => Math.max(5, Math.min(95, prev + dir * 14)));
  };

  const isBalanced = pos >= 35 && pos <= 65;
  const pointerColor = isBalanced ? colors.mint : colors.red;

  return (
    <Card style={s.gameContainer}>
      <Text style={s.gameInstruction}>
        {mineDone ? 'Denge başarıyla korundu!' : 'Göstergeyi yeşil bölgede tut!'}
      </Text>

      {/* Denge İlerleme Sayacı */}
      <View style={{ width: '100%', gap: 6 }}>
        <View style={s.progressHead}>
          <Eyebrow color={colors.muted}>Denge ilerlemesi</Eyebrow>
          <Text display style={s.statusText}>%{score}</Text>
        </View>
        <ProgressBar pct={score / 100} colors={gradients.success} height={10} duration={120} />
      </View>

      {/* Denge Tahtası */}
      <View style={s.balanceTrack}>
        <View style={s.safeZone} />
        <View
          style={[
            s.balancePointer,
            { left: `${pos}%`, backgroundColor: pointerColor, shadowColor: pointerColor },
          ]}
        />
      </View>

      {/* Dokunma Butonları */}
      <View style={s.nudgeRow}>
        <Btn title="Sola" icon="chevron-back" tone="ghost" size="md" disabled={mineDone || !live} onPress={() => nudge(-1)} style={{ flex: 1 }} />
        <Btn title="Sağa" icon="chevron-forward" tone="ghost" size="md" disabled={mineDone || !live} onPress={() => nudge(1)} style={{ flex: 1 }} />
      </View>
      {mineDone && reactionMs != null && <Chip icon="speedometer" label={`${reactionMs} ms`} color={colors.mint} />}
    </Card>
  );
}

// =================================================================
// 4. GRUP İÇİ İTİRAF
// =================================================================
function SocialGuess({
  ctx, prompt, live, entriesCount, mineTarget, tap, busy,
}: {
  ctx: Ctx; prompt: string; live: boolean; entriesCount: number;
  mineTarget: string | null; tap: (target?: string) => void; busy: boolean;
}) {
  const { data, me } = ctx;
  const mgEntries = data.entries.filter((e) => e.minigame_id === data.minigames[data.minigames.length - 1]?.id);
  const counts = data.players.map((p) => ({ p, n: mgEntries.filter((e) => e.target_player_id === p.id).length }));
  const totalVotes = Math.max(1, mgEntries.length);

  const onSelect = (targetId: string) => {
    soundFx.vote();
    haptic.medium();
    tap(targetId);
  };

  return (
    <View style={{ gap: 14 }}>
      <Card accent={colors.violet} style={s.promptCard}>
        <Chip icon="chatbubbles" label="Grup oylaması" color={colors.violet} />
        <Text display style={s.prompt}>{prompt}</Text>
        <Muted style={{ textAlign: 'center' }}>
          Kendin dahil herkese oy verebilirsin.
        </Muted>
      </Card>

      {live ? (
        <View style={{ gap: 10 }}>
          {data.players.map((p) => {
            const isSelected = mineTarget === p.id;
            const isMe = p.id === me.id;
            const tColor = teamColor(p.team_side);
            const pVotes = counts.find((c) => c.p.id === p.id)?.n ?? 0;
            const pHasVoted = mgEntries.some((e) => e.player_id === p.id);
            return (
              <Pressable
                key={p.id}
                disabled={!!mineTarget || busy}
                onPress={() => onSelect(p.id)}
                style={({ pressed }) => [
                  s.playerVoteCard,
                  isSelected && s.playerVoteCardSelected,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <Avatar source={avatarFor(p.nickname)} size={46} ring={tColor} glow={isSelected} />
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.playerNickText}>
                      {p.nickname}{isMe ? ' (Sen)' : ''}
                    </Text>
                    {pHasVoted && (
                      <Chip label="Oy Verdi" color={colors.mint} size="sm" icon="checkmark-circle" />
                    )}
                  </View>
                  <Text style={[s.playerTeamText, { color: tColor }]}>
                    {teamName(p.team_side)}
                  </Text>
                </View>
                {mineTarget && (
                  <View style={{ alignItems: 'flex-end', marginRight: 8 }}>
                    <Text display style={{ color: pVotes > 0 ? colors.cyan : colors.muted, fontSize: 13, fontWeight: '700' }}>
                      {pVotes} oy
                    </Text>
                  </View>
                )}
                <View style={[s.voteRadio, isSelected && s.voteRadioSelected]}>
                  {isSelected && <Ionicons name="checkmark" size={14} color="#05281A" />}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card style={{ gap: 14 }}>
          <Title size={20}>Oylama Sonuçları</Title>
          {counts.sort((a, b) => b.n - a.n).map(({ p, n }) => {
            const pct = Math.round((n / totalVotes) * 100);
            const tColor = teamColor(p.team_side);
            return (
              <View key={p.id} style={{ gap: 6 }}>
                <View style={s.rowBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Avatar source={avatarFor(p.nickname)} size={30} ring={tColor} glow={false} />
                    <Text style={s.resName}>{p.nickname} <Text style={{ color: colors.muted }}>({n} oy)</Text></Text>
                  </View>
                  <Text display style={[s.resPct, { color: tColor }]}>{pct}%</Text>
                </View>
                <ProgressBar pct={pct / 100} colors={[alpha(tColor, 0.85), tColor]} height={8} />
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

// =================================================================
// 5. HIZLI MATEMATİK & TAHMİN OYUNU
// =================================================================
function MathGuessGame({
  ctx, entries, prompt, targetNum, live, mineGuess, onSubmit, busy,
}: {
  ctx: Ctx; entries: MinigameEntry[]; prompt: string; targetNum: number | null; live: boolean;
  mineGuess: number | null; onSubmit: (val: number) => void; busy: boolean;
}) {
  const { data, me } = ctx;
  const [val, setVal] = useState('');

  const pressDigit = (d: string) => {
    if (val.length >= 6) return;
    soundFx.click();
    haptic.light();
    setVal((prev) => (prev === '0' ? d : prev + d));
  };
  const backspace = () => {
    soundFx.click();
    haptic.light();
    setVal((prev) => prev.slice(0, -1));
  };
  const clear = () => {
    soundFx.click();
    haptic.light();
    setVal('');
  };

  const handleSend = () => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    onSubmit(num);
  };

  const done = mineGuess !== null;

  // Tüm oyuncuların tahminleri
  const playerGuesses = data.players.map((p) => {
    const entry = entries.find((e) => e.player_id === p.id);
    const guess = entry?.guess_num ?? null;
    const isMe = p.id === me.id;
    const diff = guess !== null && targetNum !== null ? Math.abs(guess - targetNum) : null;
    return { player: p, guess, isMe, diff };
  });

  const validDiffs = playerGuesses.filter((g) => g.diff !== null).map((g) => g.diff!);
  const bestDiff = validDiffs.length > 0 ? Math.min(...validDiffs) : null;

  return (
    <View style={{ gap: 16 }}>
      {/* Soru Kartı */}
      <Card accent={colors.cyan} style={s.promptCard}>
        <View style={[s.bigIcon, { width: 56, height: 56, borderRadius: 28, marginBottom: 0, backgroundColor: alpha(colors.cyan, 0.14), borderColor: alpha(colors.cyan, 0.4) }]}>
          <Ionicons name="calculator" size={28} color={colors.cyan} />
        </View>
        <Text display style={s.prompt}>{prompt}</Text>
        <Muted>Doğru yanıta en yakın tahmini yapan takım bonus kazanır!</Muted>
      </Card>

      {/* Kullanıcı Durumu */}
      {done ? (
        <Card accent={colors.mint} style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: alpha(colors.mint, 0.16), alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={28} color={colors.mint} />
          </View>
          <Eyebrow color={colors.mint}>Tahminin Alındı</Eyebrow>
          <Text display style={{ fontSize: 36, color: colors.text, fontWeight: '900' }}>
            {mineGuess}
          </Text>
          <Muted>
            {live ? 'Diğer oyuncuların tahminleri bekleniyor…' : (targetNum !== null ? `Gerçek Cevap: ${targetNum} (Fark: ${Math.abs(mineGuess - targetNum)})` : 'Tur tamamlandı')}
          </Muted>
        </Card>
      ) : live ? (
        <Card style={{ gap: 14 }}>
          {/* Giriş Ekranı */}
          <View style={s.mathDisplay}>
            <Text display style={s.mathDisplayText}>
              {val || <Text style={{ color: colors.muted }}>Tahminini gir…</Text>}
            </Text>
          </View>

          {/* Sayısal Tuş Takımı */}
          <View style={s.numPadGrid}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
              <Pressable
                key={k}
                onPress={() => (k === 'C' ? clear() : k === '⌫' ? backspace() : pressDigit(k))}
                style={({ pressed }) => [
                  s.numPadKey,
                  (k === 'C' || k === '⌫') && s.numPadActionKey,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
                ]}
              >
                <Text display style={[s.numPadKeyText, (k === 'C' || k === '⌫') && { color: colors.cyan }]}>
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>

          <Btn
            title="Tahmini Gönder"
            icon="send"
            tone="success"
            disabled={!val}
            loading={busy}
            onPress={handleSend}
          />
        </Card>
      ) : (
        <Card accent={colors.gold} style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="time" size={28} color={colors.gold} />
          <Title size={20}>Süre Doldu</Title>
          {targetNum !== null && (
            <Text display style={{ fontSize: 28, color: colors.gold, fontWeight: '900' }}>
              Doğru Cevap: {targetNum}
            </Text>
          )}
        </Card>
      )}

      {/* Diğer Tahminler & Oyuncu Durumu */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <SectionLabel>Tüm Tahminler</SectionLabel>
          <Text style={{ fontSize: 12, color: colors.muted, fontWeight: '700' }}>
            {playerGuesses.filter((g) => g.guess !== null).length} / {data.players.length} Cevap
          </Text>
        </View>

        <View style={{ gap: 8 }}>
          {playerGuesses.map(({ player: p, guess, isMe, diff }) => {
            const tColor = teamColor(p.team_side);
            const isWinner = !live && targetNum !== null && diff !== null && diff === bestDiff;
            return (
              <View
                key={p.id}
                style={[
                  s.guessRow,
                  isWinner && { borderColor: colors.gold, backgroundColor: alpha(colors.gold, 0.12) },
                ]}
              >
                <Avatar source={avatarFor(p.nickname)} size={36} ring={tColor} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                    {p.nickname} {isMe ? '(Sen)' : ''}
                  </Text>
                  <Text style={{ color: tColor, fontSize: 11, fontWeight: '600' }}>
                    {teamName(p.team_side)}
                  </Text>
                </View>

                {guess !== null ? (
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={[s.guessBadge, { backgroundColor: alpha(tColor, 0.18), borderColor: alpha(tColor, 0.5) }]}>
                      <Text display style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                        {guess}
                      </Text>
                    </View>
                    {!live && targetNum !== null && diff !== null && (
                      <Text style={{ color: isWinner ? colors.gold : colors.muted, fontSize: 11, fontWeight: '700' }}>
                        {isWinner ? `🏆 En Yakın (Fark: ${diff})` : `Fark: ${diff}`}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Chip label="Düşünüyor..." color={colors.muted} size="sm" icon="time-outline" />
                )}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 14, paddingBottom: 36, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { gap: 4, marginTop: 2 },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: alpha(colors.magenta, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.magenta, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },

  // Refleks
  reflexWrap: { alignItems: 'center', gap: 20, paddingVertical: 10 },
  ringOuter: { padding: 10 },
  ringMid: { width: 270, height: 270, borderRadius: 135, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  reflexBtn: {
    width: 218,
    height: 218,
    borderRadius: 109,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  reflexFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  reflexSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.18)' },
  reflexText: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  reflexMs: { color: colors.text, fontSize: 32, fontWeight: '900' },

  // Genel oyun konteyneri
  gameContainer: { alignItems: 'center', gap: 16, padding: 20 },
  gameInstruction: { color: colors.textSoft, fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 12 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    borderWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  statusBannerText: { fontSize: 13, fontWeight: '700' },

  // Hafıza grid
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
  memoryCard: {
    width: '30%',
    backgroundColor: colors.inset,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  memoryCardActive: {
    backgroundColor: alpha(colors.mint, 0.2),
    borderColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    transform: [{ scale: 1.06 }],
  },
  memoryName: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  stepBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepBadgeText: { color: '#05281A', fontSize: 13, fontWeight: '900' },

  // Denge
  balanceTrack: {
    width: '100%',
    height: 54,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 27,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  safeZone: {
    position: 'absolute',
    left: '35%',
    width: '30%',
    top: 0,
    bottom: 0,
    backgroundColor: alpha(colors.mint, 0.16),
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: alpha(colors.mint, 0.5),
  },
  balancePointer: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    borderWidth: 3,
    borderColor: '#fff',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  nudgeRow: { flexDirection: 'row', gap: 12, width: '100%' },

  // Ortak elemanlar
  progressWrap: { gap: 8, marginTop: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { color: colors.textSoft, fontSize: 16, fontWeight: '800' },
  winnerCard: { alignItems: 'center', gap: 10, paddingVertical: 24, marginTop: 4 },
  playerVoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 14,
  },
  playerVoteCardSelected: {
    borderColor: alpha(colors.mint, 0.7),
    backgroundColor: alpha(colors.mint, 0.1),
  },
  playerNickText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  playerTeamText: { fontSize: 11, fontWeight: '700' },
  voteRadio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderLight,
    backgroundColor: colors.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteRadioSelected: { borderColor: colors.mint, backgroundColor: colors.mint },
  promptCard: { alignItems: 'center', gap: 12 },
  prompt: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 30 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  resPct: { fontWeight: '900', fontSize: 16 },

  // Matematik ve sayı tahmini
  mathDisplay: {
    backgroundColor: colors.inset,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  mathDisplayText: { fontSize: 28, fontWeight: '900', color: colors.cyan },
  numPadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  numPadKey: {
    width: '30%',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numPadActionKey: {
    backgroundColor: alpha(colors.cyan, 0.12),
    borderColor: alpha(colors.cyan, 0.35),
  },
  numPadKeyText: { fontSize: 22, fontWeight: '800', color: colors.text },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: alpha(colors.surface2, 0.45),
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guessBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
});
