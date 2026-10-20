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
import { teamColor, teamName, tierLabel } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
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

  useEffect(() => {
    setText('');
    setFinal('');
    setConfirmAnswer(null);
  }, [round?.id]);

  const myTeam = data.teams.find((t) => t.side === me.team_side);
  const prize = round ? catalog[round.piece_id] : undefined;
  const tColor = teamColor(me.team_side);

  if (!round) {
    return (
      <Screen>
        <Scoreboard ctx={ctx} />
        <View style={s.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🎬</Text>
          <Title size={24}>Hazır mısın?</Title>
          <Muted style={{ marginTop: 6 }}>İlk soru birazdan geliyor…</Muted>
        </View>
      </Screen>
    );
  }

  const isOpen = round.status === 'open';
  const left = secondsLeft(round.closes_at, now);
  const total = round.opens_at && round.closes_at ? (Date.parse(round.closes_at) - Date.parse(round.opens_at)) / 1000 : 1;
  const lockedLeft = me.locked_until ? Math.max(0, (Date.parse(me.locked_until) - now) / 1000) : 0;
  const suggestions = data.answers.filter((a) => a.round_id === round.id && a.side === me.team_side && !a.is_final);
  const showHint = isOpen && round.hints.length > 0 && left < total / 2;

  // ---- Harf kredisi: cevap maskesi + satın alınan harfler ----
  const credits = myTeam?.credits ?? 0;
  const myReveals = data.reveals.filter((r) => r.round_id === round.id && r.side === me.team_side);
  const maskChars = round.answer_mask ? Array.from(round.answer_mask) : [];
  const slots = maskChars.map((ch, i) => {
    if (ch !== '_') return { ch, known: true, bought: false, sep: !/[a-z0-9çğıöşüâîû]/i.test(ch) };
    const r = myReveals.find((x) => x.pos === i + 1);
    return { ch: r ? r.letter : '', known: !!r, bought: !!r, sep: false };
  });
  const hiddenLeft = slots.filter((x) => !x.known && !x.sep).length;
  const canBuy = isOpen && !room.paused && credits > 0 && hiddenLeft > 1;

  const buyLetter = () =>
    run(async () => {
      await api.buyLetter(round.id);
      soundFx.pop();
      haptic.light();
    });

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
      if (r.correct === false) {
        soundFx.wrong();
        haptic.error();
        show('❌ Yanlış! 3 saniye bekle.');
      } else if (r.suggested) {
        soundFx.click();
        haptic.light();
        show('Öneri takımına iletildi 💬');
      } else if (r.correct === true) {
        soundFx.correct();
        haptic.success();
      }
    });
  };

  const sendFinal = (body: string) => {
    const b = body.trim();
    if (!b) return;
    setConfirmAnswer(b);
  };

  const joker = () =>
    run(async () => {
      await api.playJoker(room.id);
      soundFx.cheer();
      haptic.medium();
      show('🃏 Joker! Bonus parça kazandın.');
    });
  const pause = () => run(async () => { await api.togglePause(room.id); });

  const iWon = round.winner_side === me.team_side;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Scoreboard ctx={ctx} />

          {/* ================= ROZET & TUR BİLGİSİ ================= */}
          <View style={s.metaRow}>
            <View style={[s.roleChip, { backgroundColor: `${tColor}16`, borderColor: `${tColor}38` }]}>
              <View style={[s.roleDot, { backgroundColor: tColor }]} />
              <Text style={[s.roleText, { color: tColor }]}>
                {teamName(me.team_side)}
                {me.is_captain ? ' • Kaptan 🎖️' : ''}
                {me.is_architect ? ' • Mimar 🏗️' : ''}
              </Text>
            </View>

            <View style={s.creditHeaderBadge}>
              <Text style={s.creditHeaderBadgeText}>🪙 {credits} Kredi</Text>
            </View>

            <View style={s.tierChip}>
              <Text style={s.tierText}>
                {tierLabel[round.tier as Tier]} · Tur {round.idx + 1}
              </Text>
            </View>
          </View>

          {isOpen && <TimerBar left={left} total={total} label="Soru Süresi" />}

          {/* ================= SORU KARTI ================= */}
          <View style={s.questionCard}>
            <View style={s.questionHeader}>
              <View style={s.kindTag}>
                <Text style={s.kindTagText}>
                  {round.kind === 'anagram' ? '🔤 HARFLERİ DÜZENLE' : '🧩 BİLMECEYİ ÇÖZ'}
                </Text>
              </View>
              {prize && (
                <View style={s.prizeTag}>
                  <Text style={s.prizeEmoji}>{prize.emoji}</Text>
                  <Text style={s.prizeName}>{prize.name_tr}</Text>
                </View>
              )}
            </View>

            <Text style={round.kind === 'anagram' ? s.anagram : s.riddle}>
              {round.kind === 'anagram'
                ? round.prompt.toLocaleUpperCase('tr-TR').split('').join(' ')
                : round.prompt}
            </Text>

            {isOpen && slots.length > 0 && (
              <View style={s.slotsWrap}>
                <View style={s.slotsRow}>
                  {slots.map((sl, i) =>
                    sl.sep ? (
                      <Text key={i} style={s.sepChar}>{sl.ch === ' ' ? '' : sl.ch}</Text>
                    ) : (
                      <View
                        key={i}
                        style={[s.slot, sl.known && s.slotKnown, sl.bought && s.slotBought]}
                      >
                        <Text style={[s.slotText, sl.bought && { color: '#38BDF8' }]}>
                          {sl.known ? sl.ch.toLocaleUpperCase('tr-TR') : ''}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              </View>
            )}

            {isOpen && (
              <View style={s.creditRow}>
                <View style={s.creditChip}>
                  <Text style={s.creditText}>🪙 Kalan Kredi: {credits}</Text>
                </View>
                {slots.length > 0 && (
                  <Pressable
                    disabled={!canBuy || busy}
                    onPress={buyLetter}
                    style={({ pressed }) => [
                      s.buyBtn,
                      !canBuy && { opacity: 0.4 },
                      pressed && { transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <Text style={s.buyText}>🔍 Harf Al (1 kredi)</Text>
                  </Pressable>
                )}
              </View>
            )}

            {showHint && (
              <View style={s.hintBox}>
                <Text style={s.hintText}>💡 İpucu: {round.hints[0]}</Text>
              </View>
            )}
          </View>

          {round.kind === 'riddle' && isOpen && (
            <Hint id="riddle" text="Takım arkadaşların tahmin yazar, Kaptan onaylayıp gönderir." />
          )}
          {me.is_captain && isOpen && myTeam && myTeam.jokers_left > 0 && (
            <Hint id="joker" text="Joker: soruyu çözmeden direkt bonus parça kazandırır. Dikkatli kullan!" />
          )}

          {/* ================= CEVAP GİRİŞİ ================= */}
          {isOpen ? (
            round.kind === 'anagram' ? (
              <View style={{ gap: 12 }}>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={submit}
                  placeholder="Cevabın…"
                  placeholderTextColor="#5A6679"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={80}
                  editable={lockedLeft <= 0}
                  style={s.input}
                />
                <Btn
                  title={lockedLeft > 0 ? `⏳ ${Math.ceil(lockedLeft)} sn bekle` : 'Cevabı Gönder'}
                  disabled={lockedLeft > 0 || !text.trim()}
                  loading={busy}
                  onPress={submit}
                />
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {suggestions.length > 0 && (
                  <Card style={{ gap: 10 }}>
                    <Text style={s.sectionLabel}>TAKIM TAHMİNLERİ</Text>
                    <View style={s.chips}>
                      {suggestions.map((a) => {
                        const who = data.players.find((p) => p.id === a.player_id)?.nickname ?? '?';
                        return (
                          <Pressable
                            key={a.id}
                            disabled={!me.is_captain}
                            onPress={() => sendFinal(a.body)}
                            style={s.chip}
                          >
                            <Text style={s.chipText}>{a.body}</Text>
                            <Text style={s.chipWho}>{who}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {me.is_captain && (
                      <Muted style={{ fontSize: 12 }}>Bir tahmine dokun → takım adına gönder.</Muted>
                    )}
                  </Card>
                )}

                <TextInput
                  value={me.is_captain ? final : text}
                  onChangeText={me.is_captain ? setFinal : setText}
                  placeholder={me.is_captain ? 'Nihai cevap (Kaptan)…' : 'Tahminini yaz…'}
                  placeholderTextColor="#5A6679"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={80}
                  style={s.input}
                />
                {me.is_captain ? (
                  <Btn
                    title="Takım Adına Onayla & Gönder"
                    tone="primary"
                    disabled={!final.trim()}
                    loading={busy}
                    onPress={() => sendFinal(final)}
                  />
                ) : (
                  <Btn
                    title="Takıma Öner 💬"
                    tone="ghost"
                    disabled={!text.trim()}
                    loading={busy}
                    onPress={submit}
                  />
                )}
              </View>
            )
          ) : (
            <Pulse>
              <View style={s.resultCard}>
                <Text style={s.resEmoji}>{round.winner_side ? (iWon ? '🎉' : '😬') : '⏰'}</Text>
                <Text style={s.resTitle}>
                  {round.winner_side
                    ? iWon
                      ? 'Parça Bizim!'
                      : `${teamName(round.winner_side)} parçayı aldı`
                    : 'Kimse bilemedi'}
                </Text>
                <View style={s.revealedPill}>
                  <Text style={s.revealedLabel}>Doğru Cevap:</Text>
                  <Text style={s.revealedText}>{round.revealed_answer}</Text>
                </View>
                {round.winner_side && <Text style={{ fontSize: 44, marginTop: 4 }}>{prize?.emoji}</Text>}
              </View>
            </Pulse>
          )}

          {/* ================= KAPTAN AKSİYONLARI ================= */}
          {me.is_captain && (
            <View style={s.captainRow}>
              <Btn
                title={`🃏 Joker (${myTeam?.jokers_left ?? 0})`}
                tone="ghost"
                disabled={!isOpen || !myTeam || myTeam.jokers_left <= 0}
                onPress={joker}
                style={{ flex: 1 }}
              />
              <Btn title="⏸ Mola" tone="ghost" onPress={pause} style={{ flex: 1 }} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ================= OYUN DURAKLATILDI MODAL ================= */}
      {room.paused && (
        <View style={s.paused}>
          <Text style={{ fontSize: 56 }}>⏸️</Text>
          <Title size={24}>Oyun Duraklatıldı</Title>
          <Muted>Kaptanlar dilediğinde devam ettirebilir.</Muted>
          {me.is_captain && (
            <Btn title="▶ Devam Et" tone="success" onPress={pause} style={{ marginTop: 16, alignSelf: 'stretch' }} />
          )}
        </View>
      )}

      {/* ================= KAPTAN ONAY MODAL (MİDAS STİLİ) ================= */}
      {confirmAnswer && (
        <Modal transparent animationType="fade" visible={!!confirmAnswer} onRequestClose={() => setConfirmAnswer(null)}>
          <View style={s.confirmBackdrop}>
            <View style={s.confirmCard}>
              <View style={s.warnCircle}>
                <Text style={{ fontSize: 28 }}>⚠️</Text>
              </View>
              <Title size={20}>Takım Adına Gönderilsin mi?</Title>
              <View style={s.answerPreviewBox}>
                <Text style={s.confirmBody}>"{confirmAnswer}"</Text>
              </View>
              <Muted style={{ textAlign: 'center', lineHeight: 20 }}>
                Dikkat: Cevap yanlışsa bu yapı parçası doğrudan rakip takıma devredilir!
              </Muted>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignSelf: 'stretch' }}>
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
            </View>
          </View>
        </Modal>
      )}

      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 14, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
    borderWidth: 1,
  },
  roleDot: { width: 6, height: 6, borderRadius: 3 },
  roleText: { fontSize: 12, fontWeight: '800' },
  creditHeaderBadge: {
    backgroundColor: '#1E1B10',
    borderWidth: 1,
    borderColor: '#423315',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  creditHeaderBadgeText: { color: '#F59E0B', fontWeight: '900', fontSize: 12 },
  tierChip: {
    backgroundColor: '#161D2C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  tierText: { color: '#8E9BAE', fontWeight: '800', fontSize: 12 },

  questionCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 20,
    gap: 14,
    alignItems: 'center',
  },
  questionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  kindTag: {
    backgroundColor: '#161D2C',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  kindTagText: { color: '#8E9BAE', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  prizeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1B1710',
    borderWidth: 1,
    borderColor: '#3D2F15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  prizeEmoji: { fontSize: 14 },
  prizeName: { color: '#F59E0B', fontSize: 11, fontWeight: '800' },
  anagram: {
    color: '#F59E0B',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    marginVertical: 4,
  },
  riddle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 28,
  },
  hintBox: {
    backgroundColor: '#0F1626',
    borderWidth: 1,
    borderColor: '#1E2D4A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  hintText: { color: '#38BDF8', fontWeight: '700', fontSize: 13 },

  slotsWrap: { width: '100%', alignItems: 'center' },
  slotsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  slot: {
    width: 30,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#090C14',
    borderWidth: 1,
    borderColor: '#242F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotKnown: { backgroundColor: '#161D2C' },
  slotBought: { borderColor: '#1E2D4A', backgroundColor: '#0F1626' },
  slotText: { color: '#F59E0B', fontSize: 17, fontWeight: '900' },
  sepChar: { color: '#8E9BAE', fontSize: 18, fontWeight: '800', alignSelf: 'center', minWidth: 8, textAlign: 'center' },
  creditRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 10 },
  creditChip: {
    backgroundColor: '#161D2C',
    borderWidth: 1,
    borderColor: '#242F46',
    borderRadius: 100,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  creditText: { color: '#F59E0B', fontWeight: '800', fontSize: 12 },
  buyBtn: {
    backgroundColor: '#0F1626',
    borderWidth: 1,
    borderColor: '#1E2D4A',
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buyText: { color: '#38BDF8', fontWeight: '800', fontSize: 12 },

  input: {
    backgroundColor: '#090C14',
    color: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#1E283A',
  },
  sectionLabel: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#090C14',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#242F46',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  chipWho: { color: '#8E9BAE', fontSize: 11, fontWeight: '600' },

  resultCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  resEmoji: { fontSize: 48 },
  resTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  revealedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#161D2C',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  revealedLabel: { color: '#8E9BAE', fontSize: 13, fontWeight: '600' },
  revealedText: { color: '#F59E0B', fontSize: 15, fontWeight: '900' },

  captainRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  paused: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8, 11, 18, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  confirmCard: {
    backgroundColor: '#0D111A',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#1E283A',
    width: '100%',
    maxWidth: 420,
    gap: 12,
    alignItems: 'center',
    padding: 24,
  },
  warnCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#261D10',
    borderWidth: 1,
    borderColor: '#4A3515',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerPreviewBox: {
    backgroundColor: '#121824',
    borderWidth: 1,
    borderColor: '#1F293D',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginVertical: 4,
  },
  confirmBody: { color: '#F59E0B', fontSize: 20, fontWeight: '900', textAlign: 'center' },
});
