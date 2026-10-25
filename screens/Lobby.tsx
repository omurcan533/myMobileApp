import React, { useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Muted, Pulse, ProgressBar, Reveal, Screen, Tap, Text, Title, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { avatarFor } from '../lib/art';
import { alpha, colors, gradients } from '../lib/theme';
import type { Ctx } from '../lib/types';
import { GAME_TITLE } from './Home';

const MAX_PLAYERS = 12;
const MIN_SLOTS = 4;
const GAME_STYLES = [
  { id: 'anagram', name: 'Harf Bulmacası', description: 'Kelimeleri çöz, parçaları kazan', icon: 'text' },
  { id: 'riddle', name: 'Bilmece', description: 'Takımca düşün, doğru cevabı bul', icon: 'bulb' },
  { id: 'reflex', name: 'Refleks', description: 'En hızlı tepkiyi ver', icon: 'flash' },
  { id: 'math_guess', name: 'Sayı Tahmini', description: 'Sayılarla yarış', icon: 'calculator' },
  { id: 'social_guess', name: 'Sosyal Tahmin', description: 'Arkadaşların hakkında tahmin et', icon: 'people' },
  { id: 'survivor_memory', name: 'Survivor Hafıza Parkuru', description: 'Yeşil fayansları ezberle; kaptan sırayla güvenli yolu bulsun', icon: 'grid' },
  { id: 'line_connect', name: 'Çizgi Birleştirme', description: 'Aynı renkleri kesişmeden birleştir, ilk bitiren takım kazanır', icon: 'git-merge' },
  { id: 'pong', name: 'Pong Düellosu (2v2)', description: 'Her takımdan iki oyuncu canlı maç yapar, diğerleri izler', icon: 'game-controller' },
] as const;
const DEFAULT_GAMES = GAME_STYLES.map((game) => game.id);


export function LobbyScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, exitRoom } = ctx;
  const { room, players } = data;
  const [busy, setBusy] = useState(false);
  const [savingGames, setSavingGames] = useState(false);
  const { toast, show } = useToast();

  const selectedGames = room.selected_games ?? DEFAULT_GAMES;
  const [draftGames, setDraftGames] = useState<string[]>(() => [...selectedGames]);
  const [editingGames, setEditingGames] = useState(false);
  const gamesLocked = room.selected_games_locked === true;
  const canEditGames = me.is_host && (!gamesLocked || editingGames) && !savingGames && !busy;

  // Synchronize with the server only outside editing mode. Taps never send requests.
  useEffect(() => {
    if (gamesLocked && !editingGames && !savingGames) setDraftGames([...selectedGames]);
  }, [room.selected_games, gamesLocked, editingGames, savingGames]);

  const toggleGame = (gameId: string) => {
    if (!me.is_host || gamesLocked && !editingGames || savingGames || busy) return;
    setDraftGames((current) => current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : [...current, gameId]);
  };

  const selectAllGames = () => { if (canEditGames) setDraftGames([...DEFAULT_GAMES]); };
  const clearAllGames = () => { if (canEditGames) setDraftGames([]); };

  const lockGames = async () => {
    if (!me.is_host || savingGames || busy) return;
    if (draftGames.length === 0) {
      show('En az bir bulmaca türü seçmelisin.', 'error');
      return;
    }
    setSavingGames(true);
    try {
      await api.setRoomGames(room.id, draftGames);
      setEditingGames(false);
      show('Oyun seçimleri kaydedildi ve kilitlendi.', 'success');
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setSavingGames(false);
    }
  };

  const reopenGames = async () => {
    if (!me.is_host || savingGames || busy) return;
    setSavingGames(true);
    try {
      await api.unlockRoomGames(room.id);
      setDraftGames([...selectedGames]);
      setEditingGames(true);
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setSavingGames(false);
    }
  };

  const assignTeams = async () => {
    if (!gamesLocked) {
      show('Önce oyun seçimlerini yapıp kilitlemelisin.', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.assignTeams(room.id);
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    try {
      await exitRoom();
    } catch (e) {
      show((e as Error).message, 'error');
    }
  };

  const share = () =>
    Share.share({ message: `${GAME_TITLE}'ne gel! Oda kodu: ${room.code}` }).catch(() => undefined);

  const empties = Math.max(0, Math.min(MAX_PLAYERS, Math.max(MIN_SLOTS, players.length + 1)) - players.length);
  const canStart = players.length >= 2;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= ODA KODU KARTI ================= */}
        <Reveal>
          <View style={s.codeCard}>
            <LinearGradient colors={['#12305C', '#0A1830', '#1B1040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Eyebrow live color={colors.mint} dot={colors.mint}>Bekleme odası</Eyebrow>
            <Text style={s.codeLabel}>KATILIM KODU</Text>
            <Pulse amount={1.025}>
              <Text display style={s.code}>{room.code}</Text>
            </Pulse>
            <View style={s.chipsRow}>
              <Chip icon={room.mode === 'quick' ? 'flash' : 'construct'} label={room.mode === 'quick' ? 'Hızlı mod' : 'Uzun mod'} color={room.mode === 'quick' ? colors.yellow : colors.violet} />
              <Chip icon="people" label="2 Takım" color={colors.cyan} />
            </View>
            <Btn title="Arkadaşlarına Gönder" tone="ghost" icon="share-social" size="md" onPress={share} style={{ marginTop: 14, alignSelf: 'stretch' }} />
          </View>
        </Reveal>

        {/* ================= OYUN SEÇİMİ ================= */}
        <Reveal delay={80}>
          <Card style={{ gap: 12 }}>
            <Title size={20}>Oynamak istediğin oyunları seç</Title>
            <Muted>{me.is_host ? 'Kurucu olarak oyun türlerini seçebilirsin. Seçimlerin tüm oyunculara yansır.' : 'Oyun kurucusunun seçtiği türler aşağıda görünüyor.'}</Muted>
            {me.is_host && (
              <View style={s.gameActions}>
                <Btn title="Tümünü Seç" icon="checkmark-done" size="sm" tone="success" disabled={!canEditGames || draftGames.length === GAME_STYLES.length} onPress={selectAllGames} style={{ flex: 1 }} />
                <Btn title="Tümünü Kaldır" icon="close-circle-outline" size="sm" tone="ghost" disabled={!canEditGames || draftGames.length === 0} onPress={clearAllGames} style={{ flex: 1 }} />
              </View>
            )}
            <View style={s.gameGrid}>
              {GAME_STYLES.map((game) => {
                const enabled = (canEditGames ? draftGames : selectedGames).includes(game.id);
                return (
                  <Tap key={game.id} onPress={() => { if (canEditGames) toggleGame(game.id); }} style={[s.gameStyleRow, enabled && s.gameStyleSelected, !canEditGames && s.gameStyleDisabled]}>
                    <Ionicons name={game.icon} size={18} color={enabled ? colors.cyan : colors.muted} />
                    <Text style={s.gameStyleTitle} numberOfLines={2}>{game.name}</Text>
                    <Ionicons name={enabled ? 'checkbox' : 'square-outline'} size={20} color={enabled ? colors.mint : colors.muted} />
                  </Tap>
                );
              })}
            </View>
            {me.is_host ? (
              gamesLocked && !editingGames ? (
                <Btn title="Yeniden Belirle" icon="create-outline" tone="ghost" disabled={savingGames || busy} onPress={reopenGames} />
              ) : (
                <Btn title="Seçimleri Yap ve Kilitle" icon="lock-closed" tone="success" loading={savingGames} disabled={busy || draftGames.length === 0} onPress={lockGames} />
              )
            ) : null}
            <Muted>{savingGames ? 'Seçimler kaydediliyor…' : gamesLocked && !editingGames ? 'Seçimler kilitlendi. Değiştirmek için Yeniden Belirle butonunu kullan.' : me.is_host ? 'Seçimlerini tamamla ve tek seferde kaydet. Yalnızca Pong seçerek doğrudan Pong maçı test edebilirsin. En az bir oyun seç.' : 'Seçimleri yalnızca oda kurucusu değiştirebilir.'}</Muted>
          </Card>
        </Reveal>

        {/* ================= OYUNCULAR ================= */}
        <Reveal delay={100}>
          <Card style={{ gap: 14 }}>
            <View style={s.playersHead}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Title size={20}>Oyuncular</Title>
                <Muted style={{ marginTop: 2 }}>Kurucu takımları belirleyince herkes sonucu görecek</Muted>
              </View>
              <View style={s.countBadge}>
                <Text display style={s.countText}>{players.length}</Text>
                <Text style={s.countMax}>/{MAX_PLAYERS}</Text>
              </View>
            </View>
            <ProgressBar pct={players.length / MAX_PLAYERS} colors={gradients.primary} height={8} />

            <View style={s.grid}>
              {players.map((p) => {
                const isMe = p.id === me.id;
                return (
                  <View key={p.id} style={[s.player, isMe && s.playerMe]}>
                    {p.is_host && (
                      <View style={s.crown}>
                        <Ionicons name="star" size={12} color="#3A2100" />
                      </View>
                    )}
                    <Avatar source={avatarFor(p.nickname, p.avatar_id)} size={58} ring={isMe ? colors.cyan : colors.borderLight} glow={isMe} />
                    <Text numberOfLines={1} style={[s.pName, isMe && { color: colors.cyan }]}>{p.nickname}</Text>
                    <Text style={s.pRole}>{p.is_host ? 'KURUCU' : isMe ? 'SEN' : 'OYUNCU'}</Text>
                  </View>
                );
              })}
              {Array.from({ length: empties }).map((_, i) => (
                <View key={`e${i}`} style={[s.player, s.playerEmpty]}>
                  <View style={s.emptyAvatar}>
                    <Ionicons name="person-add" size={20} color={colors.subtle} />
                  </View>
                  <Text style={[s.pName, { color: colors.subtle }]}>Bekleniyor…</Text>
                  <Text style={s.pRole}> </Text>
                </View>
              ))}
            </View>
          </Card>
        </Reveal>

        {/* ================= BAŞLAT / AYRIL ================= */}
        <Reveal delay={180} style={{ gap: 12 }}>
          {me.is_host ? (
            <Btn
              title={canStart ? 'Takımları Belirle' : 'En az 2 kişi gerekli'}
              icon={canStart ? 'people' : 'hourglass'}
              disabled={!canStart || savingGames || !gamesLocked}
              loading={busy}
              tone="success"
              onPress={assignTeams}
            />
          ) : (
            <Card style={s.waiting}>
              <Ionicons name="hourglass" size={22} color={colors.cyan} />
              <Muted style={{ flex: 1 }}>Kurucunun takımları belirlemesi bekleniyor…</Muted>
            </Card>
          )}
          <Btn title="Odadan Ayrıl" tone="ghost" icon="exit-outline" size="md" onPress={leave} />
        </Reveal>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 30, paddingTop: 6 },
  gameActions: { flexDirection: 'row', gap: 8 },
  gameGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  gameStyleRow: { width: '48.5%', minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 13 },
  gameStyleSelected: { borderColor: colors.cyan, backgroundColor: alpha(colors.cyan, 0.08) },
  gameStyleDisabled: { opacity: 0.65 },
  gameStyleTitle: { color: colors.text, fontWeight: '700', fontSize: 12, flex: 1 },
  codeCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.35),
    padding: 22,
    alignItems: 'center',
    gap: 4,
    overflow: 'hidden',
    shadowColor: colors.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  codeLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 2, marginTop: 10 },
  code: {
    color: colors.yellow,
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 10,
    marginVertical: 2,
    textShadowColor: alpha(colors.gold, 0.7),
    textShadowRadius: 18,
    paddingLeft: 10,
  },
  chipsRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  playersHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    backgroundColor: alpha(colors.cyan, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.38),
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    flexShrink: 0,
  },
  countText: { color: colors.cyan, fontSize: 22, fontWeight: '900' },
  countMax: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  player: {
    width: '31.5%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerMe: { borderColor: alpha(colors.cyan, 0.55), backgroundColor: alpha(colors.cyan, 0.08) },
  playerEmpty: { borderStyle: 'dashed', borderColor: colors.borderLight, backgroundColor: 'transparent', opacity: 0.8 },
  emptyAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderLight,
  },
  crown: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  pName: { color: colors.text, fontWeight: '700', fontSize: 12.5, maxWidth: '100%' },
  pRole: { color: colors.subtle, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
});
