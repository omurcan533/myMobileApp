import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Hint } from '../components/Hint';
import { Scoreboard } from '../components/Scoreboard';
import { Btn, Card, Muted, Pulse, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api, GameError } from '../lib/api';
import { latestMinigame, secondsLeft } from '../lib/selectors';
import { colors, radius, teamColor, teamName } from '../lib/theme';
import type { Ctx } from '../lib/types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MinigameScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const now = useNow(100);
  const mg = latestMinigame(data.minigames);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  if (!mg) return <Screen><Scoreboard ctx={ctx} /><View style={s.center}><Title>Devre arası! 🎪</Title></View></Screen>;

  const entries = data.entries.filter((e) => e.minigame_id === mg.id);
  const mine = entries.find((e) => e.player_id === me.id);
  const live = mg.status === 'live';
  const goAt = mg.starts_at ? Date.parse(mg.starts_at) : 0;
  const go = now >= goAt;
  const total = data.players.length;
  const left = secondsLeft(data.room.phase_ends_at, now);

  // Refleks: sunucu saati tahmini ±0.5 sn sapabilir; "çok erken" gelirse kısa aralıklarla tekrar dene.
  const tap = async (target?: string) => {
    if (mine || busy) return;
    setBusy(true);
    try {
      for (let i = 0; i < 8; i++) {
        try {
          await api.minigameEntry(mg.id, target);
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

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
        <Scoreboard ctx={ctx} />
        <Title>🎪 Devre Arası</Title>
        <Hint id="minigame" text="Mini oyunu kazanan takım bonus parça alır!" />

        {live && <TimerBar left={left} total={mg.kind === 'reflex' ? 8 : 20} color={colors.teamB} />}

        {mg.kind === 'reflex' ? (
          <View style={s.reflexWrap}>
            <Muted>{go ? 'Şimdi dokun!' : 'Ekran yeşil olunca dokun, erken dokunma!'}</Muted>
            <Pulse active={live && go && !mine}>
              <Pressable
                onPress={() => (go ? tap() : show('Çok erken! Bekle… ✋'))}
                disabled={!live || !!mine}
                style={[s.reflexBtn, { backgroundColor: !live || mine ? colors.surface2 : go ? colors.green : colors.red }]}
              >
                <Text style={s.reflexText}>
                  {!live ? '🏁' : mine ? `${reflexMs} ms` : go ? 'BAS!' : 'BEKLE'}
                </Text>
              </Pressable>
            </Pulse>
            <Muted>{entries.length}/{total} kişi dokundu</Muted>
          </View>
        ) : (
          <SocialGuess ctx={ctx} mgId={mg.id} prompt={mg.prompt ?? ''} live={live} entriesCount={entries.length} mineTarget={mine?.target_player_id ?? null} tap={tap} busy={busy} />
        )}

        {!live && (
          <Card style={[{ alignItems: 'center', gap: 6, borderWidth: 2 }, { borderColor: mg.winner_side ? teamColor(mg.winner_side) : colors.surface2 }]}>
            <Text style={{ fontSize: 44 }}>{mg.winner_side ? '🏆' : '🤝'}</Text>
            <Title size={22}>{mg.winner_side ? `${teamName(mg.winner_side)} kazandı!` : 'Berabere!'}</Title>
            <Muted>{mg.winner_side ? 'Bonus parça + 2 puan' : 'Bu sefer bonus yok.'}</Muted>
          </Card>
        )}
      </ScrollView>
      {toast}
    </Screen>
  );
}

function SocialGuess({ ctx, prompt, live, entriesCount, mineTarget, tap, busy }: {
  ctx: Ctx; mgId: string; prompt: string; live: boolean; entriesCount: number;
  mineTarget: string | null; tap: (target?: string) => void; busy: boolean;
}) {
  const { data, me } = ctx;
  const mgEntries = data.entries.filter((e) => e.minigame_id === data.minigames[data.minigames.length - 1]?.id);
  const counts = data.players.map((p) => ({ p, n: mgEntries.filter((e) => e.target_player_id === p.id).length }));
  const totalVotes = Math.max(1, mgEntries.length);

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ alignItems: 'center', gap: 6 }}>
        <Muted>GRUP İÇİ İTİRAF</Muted>
        <Text style={s.prompt}>{prompt}</Text>
      </Card>

      {live ? (
        <View style={{ gap: 8 }}>
          {data.players.map((p) => (
            <Btn
              key={p.id}
              title={`${p.nickname}${p.id === me.id ? ' (sen)' : ''}${mineTarget === p.id ? '  ✓' : ''}`}
              tone={mineTarget === p.id ? 'success' : 'ghost'}
              disabled={!!mineTarget || busy}
              onPress={() => tap(p.id)}
            />
          ))}
          <Muted style={{ textAlign: 'center' }}>{entriesCount}/{data.players.length} kişi seçti</Muted>
        </View>
      ) : (
        <Card style={{ gap: 10 }}>
          <Title size={18}>Sonuçlar 💥</Title>
          {counts.sort((a, b) => b.n - a.n).map(({ p, n }) => (
            <View key={p.id} style={{ gap: 4 }}>
              <View style={s.rowBetween}>
                <Text style={s.resName}>{p.nickname}</Text>
                <Text style={s.resPct}>{Math.round((n / totalVotes) * 100)}%</Text>
              </View>
              <View style={s.barBg}><View style={[s.barFill, { width: `${(n / totalVotes) * 100}%`, backgroundColor: teamColor(p.team_side) }]} /></View>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  reflexWrap: { alignItems: 'center', gap: 16, paddingVertical: 16 },
  reflexBtn: { width: 240, height: 240, borderRadius: 120, alignItems: 'center', justifyContent: 'center' },
  reflexText: { color: '#fff', fontSize: 38, fontWeight: '900' },
  prompt: { color: colors.text, fontSize: 22, fontWeight: '900', textAlign: 'center', lineHeight: 30 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between' },
  resName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  resPct: { color: colors.yellow, fontWeight: '900', fontSize: 15 },
  barBg: { height: 12, borderRadius: 6, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 6 },
});

void radius;
