import { translate, useLanguage } from '../lib/i18n';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Muted, Pulse, ProgressBar, Reveal, Screen, Tap, Text, Title, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { FriendFactsLobby } from '../components/FriendFactsLobby';
import { avatarFor } from '../lib/art';
import { alpha, colors, gradients } from '../lib/theme';
import type { Ctx } from '../lib/types';
import { GAME_TITLE } from './Home';

const MAX_PLAYERS = 12;
const MIN_SLOTS = 4;
const getGameStyles = () => [
  { id: 'anagram', name: translate("Harf Bulmacası"), description: translate("Kelimeleri çöz, parçaları kazan"), icon: 'text' },
  { id: 'riddle', name: translate("Bilmece"), description: translate("Takımca düşün, doğru cevabı bul"), icon: 'bulb' },
  { id: 'reflex', name: translate("Refleks"), description: translate("En hızlı tepkiyi ver"), icon: 'flash' },
  { id: 'math_guess', name: translate("Sayı Tahmini"), description: translate("Sayılarla yarış"), icon: 'calculator' },
  { id: 'social_guess', name: translate("Sosyal Tahmin"), description: translate("Arkadaşların hakkında tahmin et"), icon: 'people' },
  { id: 'survivor_memory', name: translate("Survivor Hafıza Parkuru"), description: translate("Yeşil fayansları ezberle; kaptan sırayla güvenli yolu bulsun"), icon: 'grid' },
  { id: 'line_connect', name: translate("Çizgi Birleştirme"), description: translate("Aynı renkleri kesişmeden birleştir, süre sonunda en hızlı oyuncu takımına puan kazandırır"), icon: 'git-merge' },
  // Şarkı Tamamlama şimdilik kapalı. İleride nakarat tamamlama olarak yeniden açılabilir.
  // { id: 'song_complete', name: 'Şarkı Tamamlama', description: 'Şarkı adının eksik kısmını bul', icon: 'musical-notes' },
  { id: 'tug_of_war', name: translate("🪢 Halat Çekme"), description: translate("Takım halinde refleksle halatı çek; süreyi kurucu belirler"), icon: 'fitness' },
  { id: 'pong', name: translate("Pong Düellosu (2v2)"), description: translate("Her takımdan iki oyuncu canlı maç yapar, diğerleri izler"), icon: 'game-controller' },
] as const;
const DEFAULT_GAMES = getGameStyles().map((game) => game.id);


export function LobbyScreen({ ctx }: { ctx: Ctx }) {
  useLanguage();
  const { data, me, exitRoom } = ctx;
  const GAME_STYLES = getGameStyles();
  const { room, players } = data;
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [kickingId, setKickingId] = useState<string | null>(null);
  const [kickTarget, setKickTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [botBusy,setBotBusy]=useState(false);
  const botCount=players.filter(p=>(p as any).is_bot).length;
  const [draftBotCount,setDraftBotCount]=useState<number|null>(null);
  const [factsReady, setFactsReady] = useState(false);
  const [factsToggleBusy, setFactsToggleBusy] = useState(false);
  const factsEnabled = room.friend_facts_enabled === true;
  const [factsReviewed, setFactsReviewed] = useState(false);
  const [savingGames, setSavingGames] = useState(false);
  const { toast, show } = useToast();

  const selectedGames = room.selected_games ?? DEFAULT_GAMES;
  const [draftGames, setDraftGames] = useState<string[]>(() => [...selectedGames]);
  const [editingGames, setEditingGames] = useState(false);
  const gamesLocked = room.selected_games_locked === true;
  const canEditGames = room.mode === 'custom' && me.is_host && (!gamesLocked || editingGames) && !savingGames && !busy;

  // Synchronize with the server only outside editing mode. Taps never send requests.
  useEffect(() => {
    if (gamesLocked && !editingGames && !savingGames) setDraftGames([...selectedGames]);
  }, [room.selected_games, gamesLocked, editingGames, savingGames]);

  const toggleGame = (gameId: string) => {
    if (room.mode !== 'custom' || !me.is_host || gamesLocked && !editingGames || savingGames || busy) return;
    setDraftGames((current) => current.includes(gameId)
      ? current.filter((id) => id !== gameId)
      : [...current, gameId]);
  };

  const selectAllGames = () => { if (canEditGames) setDraftGames([...DEFAULT_GAMES]); };
  const clearAllGames = () => { if (canEditGames) setDraftGames([]); };

  const lockGames = async () => {
    if (room.mode !== 'custom' || !me.is_host || savingGames || busy) return;
    if (draftGames.length === 0) {
      show(translate("En az bir bulmaca türü seçmelisin."), 'error');
      return;
    }
    setSavingGames(true);
    try {
      await api.setRoomGames(room.id, draftGames);
      setEditingGames(false);
      show(translate("Oyun seçimleri kaydedildi ve kilitlendi."), 'success');
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
    if (factsEnabled && (!factsReady || !factsReviewed)) { show(translate("Önce herkes kişisel sorularını tamamlamalı ve cevapları okumalı."), 'error'); return; }
    if (room.mode === 'custom' && !gamesLocked) {
      show(translate("Önce oyun seçimlerini yapıp kilitlemelisin."), 'error');
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

  const toggleFriendFacts = async () => {
    if (!me.is_host || factsToggleBusy || busy) return;
    setFactsToggleBusy(true);
    try {
      await api.setFriendFactsEnabled(room.id, !factsEnabled);
      setFactsReady(false);
      setFactsReviewed(false);
      show(!factsEnabled ? translate("Beni Ne Kadar Tanıyorsun? etkinleştirildi.") : translate("Kişisel sorular kapatıldı; doldurmak gerekmiyor."), 'success');
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setFactsToggleBusy(false);
    }
  };

  const confirmKick = (playerId: string, nickname: string) => {
    if (!me.is_host || room.phase !== 'lobby' || kickingId) return;
    setKickTarget({ id: playerId, nickname });
  };

  const executeKick = async () => {
    if (!kickTarget || !me.is_host || room.phase !== 'lobby' || kickingId) return;
    const { id, nickname } = kickTarget;
    setKickingId(id);
    try {
      await api.kickRoomPlayer(room.id, id);
      setFactsReviewed(false);
      setKickTarget(null);
      show(`${nickname} ${translate('odadan çıkarıldı.')}`, 'success');
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setKickingId(null);
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
    Share.share({ message: `${GAME_TITLE}${translate("'ne gel! Oda kodu:")} ${room.code}` }).catch(() => undefined);

  const empties = Math.max(0, Math.min(MAX_PLAYERS, Math.max(MIN_SLOTS, players.length + 1)) - players.length);
  const canStart = players.length >= 2;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= OYUNCULAR ================= */}
        <Reveal delay={100}>
          <Card style={{ gap: 14 }}>
            <View style={s.playersHead}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Title size={20}>{translate("Oyuncular")}</Title>
                <Muted style={{ marginTop: 2 }}>{translate("Kurucu takımları belirleyince herkes sonucu görecek")}</Muted>
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
                    <Text style={s.pRole}>{p.is_host ? translate("KURUCU") : (p as any).is_bot ? '🤖 BOT' : isMe ? translate("SEN") : translate("OYUNCU")}</Text>
                    {me.is_host && !isMe && !p.is_host && !(p as any).is_bot && <Btn title={translate("Çıkar")} icon="person-remove-outline" size="sm" tone="ghost" disabled={!!kickingId || busy} loading={kickingId === p.id} onPress={() => confirmKick(p.id, p.nickname)} />}
                  </View>
                );
              })}
              {Array.from({ length: empties }).map((_, i) => (
                <View key={`e${i}`} style={[s.player, s.playerEmpty]}>
                  <View style={s.emptyAvatar}>
                    <Ionicons name="person-add" size={20} color={colors.subtle} />
                  </View>
                  <Text style={[s.pName, { color: colors.subtle }]}>{translate("Bekleniyor…")}</Text>
                  <Text style={s.pRole}> </Text>
                </View>
              ))}
            </View>
          </Card>
        </Reveal>

        {/* ================= ODA KODU KARTI ================= */}
        <Reveal>
          <View style={s.codeCard}>
            <LinearGradient colors={['#12305C', '#0A1830', '#1B1040']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <Eyebrow live color={colors.mint} dot={colors.mint}>{translate("Bekleme odası")}</Eyebrow>
            <Text style={s.codeLabel}>{translate("KATILIM KODU")}</Text>
            <Pulse amount={1.025}>
              <Text display style={s.code}>{room.code}</Text>
            </Pulse>
            <View style={s.chipsRow}>
              <Chip icon={room.mode === 'quick' ? 'flash' : 'construct'} label={room.mode === 'quick' ? translate("Hızlı mod") : room.mode === 'standard' ? translate("Standart mod") : room.mode === 'long' ? translate("Epik mod") : translate("Özel mod")} color={room.mode === 'quick' ? colors.yellow : colors.violet} />
              <Chip icon="people" label={translate("2 Takım")} color={colors.cyan} />
            </View>
            <Btn title={translate("Arkadaşlarına Gönder")} tone="ghost" icon="share-social" size="md" onPress={share} style={{ marginTop: 14, alignSelf: 'stretch' }} />
          </View>
        </Reveal>

        {/* ================= OYUN SEÇİMİ ================= */}
        {room.mode === 'custom' ? <Reveal delay={80}>
          <Card style={{ gap: 12 }}>
            <Title size={20}>{translate("Oynamak istediğin oyunları seç")}</Title>
            <Muted>{me.is_host ? translate("Kurucu olarak oyun türlerini seçebilirsin. Seçimlerin tüm oyunculara yansır.") : translate("Oyun kurucusunun seçtiği türler aşağıda görünüyor.")}</Muted>
            {me.is_host && (
              <View style={s.gameActions}>
                <Btn title={translate("Tümünü Seç")} icon="checkmark-done" size="sm" tone="success" disabled={!canEditGames || draftGames.length === GAME_STYLES.length} onPress={selectAllGames} style={{ flex: 1 }} />
                <Btn title={translate("Tümünü Kaldır")} icon="close-circle-outline" size="sm" tone="ghost" disabled={!canEditGames || draftGames.length === 0} onPress={clearAllGames} style={{ flex: 1 }} />
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
                <Btn title={translate("Yeniden Belirle")} icon="create-outline" tone="ghost" disabled={savingGames || busy} onPress={reopenGames} />
              ) : (
                <Btn title={translate("Seçimleri Yap ve Kilitle")} icon="lock-closed" tone="success" loading={savingGames} disabled={busy || draftGames.length === 0} onPress={lockGames} />
              )
            ) : null}
            <Muted>{savingGames ? translate("Seçimler kaydediliyor…") : gamesLocked && !editingGames ? translate("Seçimler kilitlendi. Değiştirmek için Yeniden Belirle butonunu kullan.") : me.is_host ? translate("Seçimlerini tamamla ve tek seferde kaydet. Yalnızca Pong seçerek doğrudan Pong maçı test edebilirsin. En az bir oyun seç.") : translate("Seçimleri yalnızca oda kurucusu değiştirebilir.")}</Muted>
          </Card>
        </Reveal> : <Card style={{gap:8}}><Title size={20}>{translate("🎲 Rastgele Oyunlar")}</Title><Muted>{translate("Bu modda oyunlar oda açılırken otomatik seçildi. Her yeni odada farklı bir karışım oluşur.")}</Muted><View style={s.gameGrid}>{GAME_STYLES.filter(g=>selectedGames.includes(g.id)).map(g=><View key={g.id} style={[s.gameStyleRow,s.gameStyleSelected]}><Ionicons name={g.icon} size={18} color={colors.cyan}/><Text style={s.gameStyleTitle}>{g.name}</Text></View>)}</View></Card>}

        {me.is_host && <Card style={{gap:12}}><Title size={20}>{translate("🤖 Test Botları")}</Title><Muted>{translate("İkinci cihaz olmadan lobi, takım dağılımı ve sosyal oylamaları test et. Botlar gerçek oyuncu değildir; refleks veya Pong gibi canlı kontrolleri otomatik oynamazlar.")}</Muted><Text style={{color:colors.text,fontWeight:'700'}}>{translate('Bot sayısı:')} {draftBotCount??botCount} · {translate('Toplam oyuncu:')} {players.length}</Text><View style={{flexDirection:'row',gap:10}}><Btn title="−" tone="ghost" disabled={botBusy||(draftBotCount??botCount)===0} onPress={()=>setDraftBotCount(Math.max(0,(draftBotCount??botCount)-1))}/><Btn title="+" tone="ghost" disabled={botBusy||(draftBotCount??botCount)>=Math.min(11,12-players.length+botCount)} onPress={()=>setDraftBotCount(Math.min(11,(draftBotCount??botCount)+1))}/><View style={{flex:1}}><Btn title={translate("Botları Uygula")} tone="success" loading={botBusy} disabled={botBusy||(draftBotCount??botCount)===botCount} onPress={async()=>{setBotBusy(true);try{await api.setTestBots(room.id,draftBotCount??botCount);setDraftBotCount(null);setFactsReviewed(false);show(translate("Test botları güncellendi."),'success');}catch(e){show((e as Error).message,'error');}finally{setBotBusy(false);}}}/></View></View></Card>}

        <Reveal delay={130}>
          <Card style={{ gap: 10 }}>
            <Title size={19}>{translate("🧠 Beni Ne Kadar Tanıyorsun?")}</Title>
            <Muted>{factsEnabled ? translate("Etkin. Herkes kişisel soruları cevaplar; cevaplar okunduktan sonra hafıza soruları oyunlarda kullanılabilir.") : translate("İsteğe bağlıdır. Kapalıyken kişisel sorular gösterilmez ve doldurmak gerekmez.")}</Muted>
            {me.is_host && <Btn title={factsEnabled ? translate("Kişisel Soruları Kapat") : translate("Kişisel Soruları Etkinleştir")} icon={factsEnabled ? 'toggle' : 'toggle-outline'} tone={factsEnabled ? 'success' : 'ghost'} loading={factsToggleBusy} disabled={factsToggleBusy || busy} onPress={toggleFriendFacts} />}
            {!me.is_host && <Muted>{factsEnabled ? translate("Oda kurucusu bu özelliği etkinleştirdi.") : translate("Bu özellik oda kurucusu tarafından etkinleştirilmedi.")}</Muted>}
          </Card>
        </Reveal>

        {factsEnabled && <FriendFactsLobby roomId={room.id} players={players} onReady={setFactsReady} />}

        {factsEnabled && factsReady && me.is_host && <Btn title={factsReviewed ? translate("Cevaplar İncelendi ✓") : translate("Herkes Cevapları Okudu, Devam Et")} icon="book" tone="success" onPress={() => setFactsReviewed(true)} disabled={factsReviewed} />}

        {/* ================= BAŞLAT / AYRIL ================= */}
        <Reveal delay={180} style={{ gap: 12 }}>
          {me.is_host ? (
            <Btn
              title={canStart ? translate("Takımları Belirle") : translate("En az 2 kişi gerekli")}
              icon={canStart ? 'people' : 'hourglass'}
              disabled={!canStart || savingGames || (room.mode === 'custom' && !gamesLocked) || (factsEnabled && (!factsReady || !factsReviewed))}
              loading={busy}
              tone="success"
              onPress={assignTeams}
            />
          ) : (
            <Card style={s.waiting}>
              <Ionicons name="hourglass" size={22} color={colors.cyan} />
              <Muted style={{ flex: 1 }}>{translate("Kurucunun takımları belirlemesi bekleniyor…")}</Muted>
            </Card>
          )}
          {me.is_host && <><Btn title="Odayı Kapat" tone="danger" icon="close-circle" disabled={busy} onPress={() => setCloseConfirm(true)} /><Muted>Tek kişilik bekleme odaları 10 dakika sonra otomatik kapanır.</Muted></>}
          <Btn title={translate("Odadan Ayrıl")} tone="ghost" icon="exit-outline" size="md" onPress={leave} />
        </Reveal>
      </ScrollView>
      <Modal visible={!!kickTarget} transparent animationType="fade" onRequestClose={() => { if (!kickingId) setKickTarget(null); }}>
        <View style={s.kickOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!kickingId) setKickTarget(null); }} />
          <View style={s.kickDialog}>
            <Title size={22}>{translate("Oyuncuyu Çıkar")}</Title>
            <Muted>{kickTarget?.nickname}: {translate('adlı oyuncuyu odadan çıkarmak istediğinize emin misiniz?')}</Muted>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              <View style={{ flex: 1 }}><Btn title={translate("Vazgeç")} tone="ghost" disabled={!!kickingId} onPress={() => setKickTarget(null)} /></View>
              <View style={{ flex: 1 }}><Btn title={translate("Odadan Çıkar")} icon="person-remove-outline" tone="danger" loading={!!kickingId} disabled={!!kickingId} onPress={executeKick} /></View>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={closeConfirm} transparent animationType="fade" onRequestClose={() => { if (!busy) setCloseConfirm(false); }}>
        <View style={s.kickOverlay}><View style={s.kickDialog}>
          <Title size={22}>Odayı kapat?</Title><Muted>Odadaki herkes ana ekrana döner. Bu oda koduyla tekrar katılınamaz.</Muted>
          <Btn title="Vazgeç" tone="ghost" disabled={busy} onPress={() => setCloseConfirm(false)} />
          <Btn title="Odayı Kapat" tone="danger" loading={busy} onPress={async () => { if (busy) return; setBusy(true); try { await api.closeRoom(room.id); ctx.onLeave(); } catch (error) { show((error as Error).message, 'error'); } finally { setBusy(false); } }} />
        </View></View>
      </Modal>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  kickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'center', padding: 22 },
  kickDialog: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 20, padding: 20, gap: 12 },
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
