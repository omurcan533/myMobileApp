import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Hint } from '../components/Hint';
import { Scoreboard } from '../components/Scoreboard';
import { Btn, Card, Muted, Pulse, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { currentRound, effNow, secondsLeft } from '../lib/selectors';
import { colors, radius, teamColor, teamName, tierLabel } from '../lib/theme';
import type { Ctx, Tier } from '../lib/types';

export function QuestionScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog } = ctx;
  const { room } = data;
  const now = effNow(room, useNow());
  const round = useMemo(() => currentRound(data.rounds), [data.rounds]);
  const [text, setText] = useState('');
  const [final, setFinal] = useState('');
  const [confirmAnswer, setConfirmAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  // Yeni tur açılınca girdileri temizle
  useEffect(() => {
    setText('');
    setFinal('');
    setConfirmAnswer(null);
  }, [round?.id]);

  const myTeam = data.teams.find((t) => t.side === me.team_side);
  const prize = round ? catalog[round.piece_id] : undefined;

  if (!round) {
    return (
      <Screen>
        <Scoreboard ctx={ctx} />
        <View style={s.center}><Title>Hazır mısın? 🎬</Title><Muted>İlk soru geliyor…</Muted></View>
      </Screen>
    );
  }

  const isOpen = round.status === 'open';
  const left = secondsLeft(round.closes_at, now);
  const total = round.opens_at && round.closes_at ? (Date.parse(round.closes_at) - Date.parse(round.opens_at)) / 1000 : 1;
  const lockedLeft = me.locked_until ? Math.max(0, (Date.parse(me.locked_until) - now) / 1000) : 0;
  const suggestions = data.answers.filter((a) => a.round_id === round.id && a.side === me.team_side && !a.is_final);
  const showHint = isOpen && round.hints.length > 0 && left < total / 2;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { show((e as Error).message); } finally { setBusy(false); }
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    run(async () => {
      const r = await api.submitAnswer(round.id, body);
      setText('');
      if (r.correct === false) show('❌ Yanlış! 3 saniye bekle.');
      else if (r.suggested) show('Öneri takımına gönderildi 💬');
    });
  };

  const sendFinal = (body: string) => {
    const b = body.trim();
    if (!b) return;
    setConfirmAnswer(b);
  };

  const joker = () => run(async () => { await api.playJoker(room.id); show('🃏 Joker! Bonus parça kazandın.'); });
  const pause = () => run(async () => { await api.togglePause(room.id); });

  const iWon = round.winner_side === me.team_side;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          <Scoreboard ctx={ctx} />

          <View style={s.roleRow}>
            <Text style={[s.role, { color: teamColor(me.team_side) }]}>
              {teamName(me.team_side)} {me.is_captain ? '• 🎖️ Kaptan' : ''}{me.is_architect ? '• 🏗️ Mimar' : ''}
            </Text>
            <Text style={s.tier}>{tierLabel[round.tier as Tier]} · Tur {round.idx + 1}</Text>
          </View>

          {isOpen && <TimerBar left={left} total={total} />}

          <Card style={{ gap: 12, alignItems: 'center' }}>
            <Muted>{round.kind === 'anagram' ? 'Harfleri düzenle:' : 'Bilmeceyi çöz:'}  Ödül {prize?.emoji ?? '❔'} {prize?.name_tr ?? ''}</Muted>
            <Text style={round.kind === 'anagram' ? s.anagram : s.riddle}>
              {round.kind === 'anagram' ? round.prompt.split('').join(' ') : round.prompt}
            </Text>
            {showHint && <Text style={s.hintText}>İpucu: {round.hints[0]}</Text>}
          </Card>

          {round.kind === 'riddle' && isOpen && <Hint id="riddle" text="Takım arkadaşların tahmin yazar, Kaptan onaylayıp gönderir." />}
          {me.is_captain && isOpen && myTeam && myTeam.jokers_left > 0 && <Hint id="joker" text="Joker: soruyu çözmeden direkt bonus parça kazandırır. Dikkatli kullan!" />}
          {me.is_captain && round.kind === 'riddle' && isOpen && <Hint id="captain_final" text="Yanlış cevabı gönderirsen parça rakibe gider!" />}

          {isOpen ? (
            round.kind === 'anagram' ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={text} onChangeText={setText} onSubmitEditing={submit}
                  placeholder="Cevabın…" placeholderTextColor={colors.muted}
                  autoCapitalize="none" autoCorrect={false} maxLength={80} editable={lockedLeft <= 0}
                  style={s.input}
                />
                <Btn title={lockedLeft > 0 ? `⏳ ${Math.ceil(lockedLeft)} sn bekle` : 'Gönder'} disabled={lockedLeft > 0 || !text.trim()} loading={busy} onPress={submit} />
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {suggestions.length > 0 && (
                  <Card style={{ gap: 8 }}>
                    <Muted>Takımın tahminleri</Muted>
                    <View style={s.chips}>
                      {suggestions.map((a) => {
                        const who = data.players.find((p) => p.id === a.player_id)?.nickname ?? '?';
                        return (
                          <Pressable key={a.id} disabled={!me.is_captain} onPress={() => sendFinal(a.body)} style={s.chip}>
                            <Text style={s.chipText}>{a.body}</Text>
                            <Text style={s.chipWho}>{who}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {me.is_captain && <Muted>Bir çipe dokun → takım adına gönder.</Muted>}
                  </Card>
                )}
                <TextInput
                  value={me.is_captain ? final : text} onChangeText={me.is_captain ? setFinal : setText}
                  placeholder={me.is_captain ? 'Nihai cevap (Kaptan)…' : 'Tahminini yaz…'} placeholderTextColor={colors.muted}
                  autoCapitalize="none" autoCorrect={false} maxLength={80} style={s.input}
                />
                {me.is_captain ? (
                  <Btn title="Takım Adına Gönder" tone="custom" color={teamColor(me.team_side)} disabled={!final.trim()} loading={busy} onPress={() => sendFinal(final)} />
                ) : (
                  <Btn title="Takıma Öner 💬" disabled={!text.trim()} loading={busy} onPress={submit} />
                )}
              </View>
            )
          ) : (
            <Pulse>
              <Card style={[s.result, { borderColor: round.winner_side ? teamColor(round.winner_side) : colors.surface2 }]}>
                <Text style={s.resEmoji}>{round.winner_side ? (iWon ? '🎉' : '😬') : '⏰'}</Text>
                <Text style={s.resTitle}>
                  {round.winner_side ? (iWon ? 'Parça bizim!' : `${teamName(round.winner_side)} parçayı aldı`) : 'Kimse bilemedi'}
                </Text>
                <Muted>Cevap: <Text style={{ color: colors.yellow }}>{round.revealed_answer}</Text></Muted>
                {round.winner_side && <Text style={{ fontSize: 40 }}>{prize?.emoji}</Text>}
              </Card>
            </Pulse>
          )}

          {me.is_captain && (
            <View style={s.captain}>
              <Btn title={`🃏 Joker (${myTeam?.jokers_left ?? 0})`} tone="ghost" disabled={!isOpen || !myTeam || myTeam.jokers_left <= 0} onPress={joker} style={{ flex: 1 }} />
              <Btn title="⏸ Mola" tone="ghost" onPress={pause} style={{ flex: 1 }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {room.paused && (
        <View style={s.paused}>
          <Text style={{ fontSize: 56 }}>⏸️</Text>
          <Title>Oyun duraklatıldı</Title>
          <Muted>Kaptanlar devam ettirebilir.</Muted>
          {me.is_captain && <Btn title="▶ Devam" tone="success" onPress={pause} style={{ marginTop: 16, alignSelf: 'stretch' }} />}
        </View>
      )}

      {confirmAnswer && (
        <Modal transparent animationType="fade" visible={!!confirmAnswer} onRequestClose={() => setConfirmAnswer(null)}>
          <View style={s.confirmBackdrop}>
            <Card style={s.confirmCard}>
              <Text style={{ fontSize: 34, textAlign: 'center' }}>⚠️</Text>
              <Title size={20}>Takım Adına Gönderilsin mi?</Title>
              <Text style={s.confirmBody}>"{confirmAnswer}"</Text>
              <Muted style={{ textAlign: 'center', lineHeight: 20 }}>
                Dikkat: Cevap yanlışsa bu yapı parçası doğrudan rakip takıma devredilir!
              </Muted>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignSelf: 'stretch' }}>
                <Btn
                  title="Vazgeç"
                  tone="ghost"
                  style={{ flex: 1 }}
                  onPress={() => setConfirmAnswer(null)}
                />
                <Btn
                  title="Evet, Gönder 🚀"
                  tone="danger"
                  loading={busy}
                  style={{ flex: 1 }}
                  onPress={() => {
                    const ans = confirmAnswer;
                    setConfirmAnswer(null);
                    run(async () => {
                      await api.submitFinal(round.id, ans);
                      setFinal('');
                    });
                  }}
                />
              </View>
            </Card>
          </View>
        </Modal>
      )}

      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  roleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  role: { fontWeight: '900', fontSize: 13 },
  tier: { color: colors.muted, fontWeight: '800', fontSize: 13 },
  anagram: { color: colors.yellow, fontSize: 40, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  riddle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 30 },
  hintText: { color: colors.teamB, fontWeight: '700', fontSize: 14 },
  input: { backgroundColor: colors.surface, color: colors.text, borderRadius: radius.sm, padding: 14, fontSize: 18, fontWeight: '700', borderWidth: 1, borderColor: colors.surface2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.purple },
  chipText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  chipWho: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  result: { alignItems: 'center', gap: 6, borderWidth: 2 },
  resEmoji: { fontSize: 48 },
  resTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  captain: { flexDirection: 'row', gap: 10 },
  paused: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0A0A1FF2', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  confirmBackdrop: { flex: 1, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 420, gap: 10, alignItems: 'center', padding: 22 },
  confirmBody: { color: colors.yellow, fontSize: 22, fontWeight: '900', textAlign: 'center', marginVertical: 4 },
});
