import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Hint } from '../components/Hint';
import { Scoreboard } from '../components/Scoreboard';
import { Btn, Card, Muted, Pulse, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api, GameError } from '../lib/api';
import { latestMinigame, secondsLeft } from '../lib/selectors';
import { colors, teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx } from '../lib/types';

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
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🎪</Text>
          <Title size={24}>Devre Arası!</Title>
          <Muted style={{ marginTop: 6 }}>Mini oyun hazırlanıyor…</Muted>
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
  const variant: 'reflex' | 'memory' | 'balance' = useMemo(() => {
    if (mg.kind === 'social_guess') return 'reflex'; // fallback
    const code = (mg.id || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const mod = code % 3;
    return mod === 0 ? 'reflex' : mod === 1 ? 'memory' : 'balance';
  }, [mg.id, mg.kind]);

  const tap = async (target?: string) => {
    if (mine || busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 8; i++) {
        try {
          await api.minigameEntry(mg.id, target);
          soundFx.correct();
          haptic.success();
          return;
        } catch (e) {
          if (!(e instanceof GameError) || e.code !== 'too_early') throw e;
          await sleep(120);
        }
      }
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reflexMs = mine?.reaction_ms;

  const modeBadge =
    mg.kind === 'social_guess' ? '👥 GRUP İÇİ İTİRAF'
    : variant === 'memory' ? '🧠 HIZLI EŞLEŞTİRME (SIMON SAYS)'
    : variant === 'balance' ? '⚖️ HASSAS DENGE / ÇEKMECE'
    : '⚡ REFLEKS BASMA';

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Scoreboard ctx={ctx} />

        <View style={s.header}>
          <View style={s.badge}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText}>{modeBadge}</Text>
          </View>
          <Title size={28}>🎪 Devre Arası</Title>
        </View>

        <Hint id="minigame" text="Mini oyunu kazanan takım bonus parça alır!" />

        {live && (
          <TimerBar
            left={left}
            total={mg.kind === 'social_guess' ? 40 : variant === 'memory' ? 60 : 30}
            label="Kalan Süre"
            color="#0EA5E9"
          />
        )}

        {mg.kind === 'reflex' ? (
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
                show('Çok erken! Bekle… ✋');
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
        <View style={s.centerPill}>
          <Text style={s.statusText}>{entries.length} / {total} oyuncu tamamladı</Text>
        </View>

        {/* Sonuç Kartı */}
        {!live && (
          <View style={s.winnerCard}>
            <Text style={{ fontSize: 44 }}>{mg.winner_side ? '🏆' : '🤝'}</Text>
            <Title size={22}>
              {mg.winner_side ? `${teamName(mg.winner_side)} Kazandı!` : 'Berabere!'}
            </Title>
            <Muted>{mg.winner_side ? 'Bonus parça + 2 puan' : 'Bu sefer bonus yok.'}</Muted>
          </View>
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
  return (
    <View style={s.reflexWrap}>
      <Muted style={{ textAlign: 'center' }}>
        {go ? '⚡ ŞİMDİ DOKUN!' : 'Ekran yeşil olunca dokun, erken dokunma!'}
      </Muted>
      <Pulse active={live && go && !mineDone}>
        <Pressable
          onPress={() => (go ? onTap() : onEarly())}
          disabled={!live || mineDone}
          style={[
            s.reflexBtn,
            {
              backgroundColor: !live || mineDone ? '#161D2B' : go ? '#10B981' : '#F43F5E',
              borderColor: !live || mineDone ? '#242F46' : go ? '#34D399' : '#FB7185',
            },
          ]}
        >
          <Text style={s.reflexText}>
            {!live ? '🏁' : mineDone ? `${reactionMs} ms` : go ? 'BAS!' : 'BEKLE'}
          </Text>
        </Pressable>
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

// mg.id'den deterministik karıştırma: her turda farklı, iki takımda aynı sıra
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
  return arr;
}

function MemoryGame({
  seed, live, go, mineDone, reactionMs, onComplete,
}: {
  seed: string; live: boolean; go: boolean; mineDone: boolean; reactionMs: number | null;
  onComplete: () => void;
}) {
  const sequence = useMemo(() => seededSequence(seed), [seed]); // 6 adımlı rastgele sıralama
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [showingStep, setShowingStep] = useState<number | null>(null);
  const [showing, setShowing] = useState(true);
  const [playerIdx, setPlayerIdx] = useState(0);
  const [errorFlash, setErrorFlash] = useState(false);
  const startTime = useRef(0);

  useEffect(() => {
    if (!live || !go || mineDone) return;
    setShowing(true);
    setPlayerIdx(0);
    setShowingStep(null);
    setErrorFlash(false);

    const stepDuration = 1000; // Her adım için 1 saniye (çok daha sakin & akılda kalıcı)
    const activeDuration = 750; // 750ms boyunca parlak yanar
    const startDelay = 800; // Başlamadan önce 0.8s hazırlık

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
    }, startDelay + sequence.length * stepDuration + 200);
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
        // Tüm 6 parça başarıyla tamamlandı!
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

  return (
    <View style={s.gameContainer}>
      <Text style={[s.gameInstruction, errorFlash && { color: '#EF4444' }]}>
        {showing
          ? `👀 Sıralamayı Aklında Tut! (${showingStep ?? 1}/${sequence.length})`
          : mineDone
          ? '👏 Harika! Başarıyla Tamamlandı!'
          : errorFlash
          ? '❌ Hatalı! Baştan Başla...'
          : `🎯 Sıra Sende! Dokun: (${playerIdx}/${sequence.length})`}
      </Text>

      <View style={s.memoryGrid}>
        {MEMORY_PIECES.map((item) => {
          const isHighlighted = activeStep === item.id;
          return (
            <Pressable
              key={item.id}
              disabled={showing || mineDone || !live}
              onPress={() => handleTap(item.id)}
              style={({ pressed }) => [
                s.memoryCard,
                isHighlighted && s.memoryCardActive,
                pressed && { transform: [{ scale: 0.95 }] },
              ]}
            >
              {isHighlighted && showingStep && (
                <View style={s.stepBadge}>
                  <Text style={s.stepBadgeText}>{showingStep}</Text>
                </View>
              )}
              <Text style={{ fontSize: 42 }}>{item.emoji}</Text>
              <Text style={[s.memoryName, isHighlighted && { color: '#10B981', fontWeight: '900' }]}>
                {item.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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

  return (
    <View style={s.gameContainer}>
      <Text style={s.gameInstruction}>
        {mineDone ? '🎯 Denge Başarıyla Korundu!' : 'Göstergeyi yeşil bölgede tut!'}
      </Text>

      {/* Denge İlerleme Sayacı */}
      <View style={s.balanceScoreTrack}>
        <View style={[s.balanceScoreFill, { width: `${score}%` }]} />
      </View>

      {/* Denge Tahtası */}
      <View style={s.balanceTrack}>
        {/* Güvenli Yeşil Bölge (35% - 65%) */}
        <View style={s.safeZone} />
        {/* Gösterge Noktası */}
        <View
          style={[
            s.balancePointer,
            { left: `${pos}%` },
            isBalanced ? s.pointerSafe : s.pointerDanger,
          ]}
        />
      </View>

      {/* Dokunma Butonları */}
      <View style={s.nudgeRow}>
        <Pressable
          disabled={mineDone || !live}
          onPress={() => nudge(-1)}
          style={({ pressed }) => [s.nudgeBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.nudgeText}>◀ SOLA</Text>
        </Pressable>
        <Pressable
          disabled={mineDone || !live}
          onPress={() => nudge(1)}
          style={({ pressed }) => [s.nudgeBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={s.nudgeText}>SAĞA ▶</Text>
        </Pressable>
      </View>
    </View>
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
      <View style={s.promptCard}>
        <View style={s.socialBadge}>
          <Text style={s.socialBadgeText}>🗳️ GRUP OYLAMASI</Text>
        </View>
        <Text style={s.prompt}>{prompt}</Text>
        <Muted style={{ fontSize: 13, textAlign: 'center' }}>
          Kendin dahil takımdaki herkese oy verebilirsin.
        </Muted>
      </View>

      {live ? (
        <View style={{ gap: 10 }}>
          {data.players.map((p) => {
            const isSelected = mineTarget === p.id;
            const isMe = p.id === me.id;
            const tColor = teamColor(p.team_side);
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
                <View style={[s.avatarCircle, { borderColor: tColor }]}>
                  <Text style={[s.avatarText, { color: tColor }]}>
                    {p.nickname.slice(0, 2).toLocaleUpperCase('tr-TR')}
                  </Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.playerNickText}>
                    {p.nickname} {isMe ? '(Sen)' : ''}
                  </Text>
                  <Text style={[s.playerTeamText, { color: tColor }]}>
                    {p.team_side === 'A' ? 'Takım A' : 'Takım B'}
                  </Text>
                </View>
                <View style={[s.voteRadio, isSelected && s.voteRadioSelected]}>
                  {isSelected && <Text style={{ color: '#000000', fontSize: 12, fontWeight: '900' }}>✓</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Card style={{ gap: 12 }}>
          <Title size={18}>Oylama Sonuçları 💥</Title>
          {counts.sort((a, b) => b.n - a.n).map(({ p, n }) => {
            const pct = Math.round((n / totalVotes) * 100);
            const tColor = teamColor(p.team_side);
            return (
              <View key={p.id} style={{ gap: 6 }}>
                <View style={s.rowBetween}>
                  <Text style={s.resName}>{p.nickname} ({n} oy)</Text>
                  <Text style={[s.resPct, { color: tColor }]}>{pct}%</Text>
                </View>
                <View style={s.barBg}>
                  <View style={[s.barFill, { width: `${pct}%`, backgroundColor: tColor }]} />
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingTop: 4, marginBottom: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: '#161D2C',
    borderWidth: 1,
    borderColor: '#242F46',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#0EA5E9' },
  badgeText: { color: '#8E9BAE', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },

  // Refleks
  reflexWrap: { alignItems: 'center', gap: 18, paddingVertical: 18 },
  reflexBtn: {
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  reflexText: { color: '#FFFFFF', fontSize: 36, fontWeight: '900', letterSpacing: 1 },

  // Genel Oyun Konteyneri
  gameContainer: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 22,
    alignItems: 'center',
    gap: 16,
  },
  gameInstruction: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },

  // Hafıza Grid
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
  memoryCard: {
    width: '30%',
    backgroundColor: '#161D2B',
    borderWidth: 1,
    borderColor: '#242F46',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  memoryCardActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.28)',
    borderColor: '#10B981',
    borderWidth: 2,
    transform: [{ scale: 1.05 }],
  },
  memoryName: { color: '#8E9BAE', fontSize: 13, fontWeight: '700' },
  stepBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#000000', fontSize: 12, fontWeight: '900' },

  // Denge
  balanceScoreTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    backgroundColor: '#161D2B',
    overflow: 'hidden',
  },
  balanceScoreFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  balanceTrack: {
    width: '100%',
    height: 48,
    backgroundColor: '#090C14',
    borderWidth: 1,
    borderColor: '#1E283A',
    borderRadius: 14,
    position: 'relative',
    justifyContent: 'center',
  },
  safeZone: {
    position: 'absolute',
    left: '35%',
    width: '30%',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  balancePointer: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -11,
  },
  pointerSafe: { backgroundColor: '#10B981' },
  pointerDanger: { backgroundColor: '#F43F5E' },
  nudgeRow: { flexDirection: 'row', gap: 14, width: '100%', marginTop: 8 },
  nudgeBtn: {
    flex: 1,
    backgroundColor: '#161D2C',
    borderWidth: 1,
    borderColor: '#242F46',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  nudgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },

  // Ortak Elemanlar
  centerPill: {
    backgroundColor: '#101521',
    borderWidth: 1,
    borderColor: '#1C2436',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    alignSelf: 'center',
    marginTop: 4,
  },
  statusText: { color: '#8E9BAE', fontSize: 12, fontWeight: '700' },
  winnerCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 24,
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  socialBadge: {
    backgroundColor: '#1E1B4B',
    borderColor: '#4338CA',
    borderWidth: 1,
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  socialBadgeText: { color: '#A5B4FC', fontSize: 11, fontWeight: '800' },
  playerVoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#101521',
    borderWidth: 1,
    borderColor: '#1C2436',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  playerVoteCardSelected: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    backgroundColor: '#090C14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 13, fontWeight: '900' },
  playerNickText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  playerTeamText: { fontSize: 11, fontWeight: '700' },
  voteRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#242F46',
    backgroundColor: '#090C14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteRadioSelected: {
    borderColor: '#10B981',
    backgroundColor: '#10B981',
  },
  promptCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  promptLabel: { color: '#8E9BAE', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  prompt: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', textAlign: 'center', lineHeight: 28 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resName: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  resPct: { fontWeight: '900', fontSize: 14 },
  barBg: { height: 6, borderRadius: 3, backgroundColor: '#161D2B', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
});
