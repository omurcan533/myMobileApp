import { translate, useLanguage, format } from '../lib/i18n';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import {
  Avatar, Btn, Card, Chip, Eyebrow, IconBtn, Muted, Pulse, ProgressBar, Reveal, Screen, SwipeTabGroup, swipeTabIconScale, swipeTabTint, Tap, Text, Title, useToast,
} from '../components/ui';
import { api } from '../lib/api';
import { FriendFactsLobby } from '../components/FriendFactsLobby';
import { avatarFor } from '../lib/art';
import { alpha, colors, gradients } from '../lib/theme';
import type { Ctx } from '../lib/types';
import { GAME_TITLE, HOME_APPEARANCE_KEY, readHomeAppearance, type HomeAppearance } from './Home';

const MAX_PLAYERS = 12;
const MIN_SLOTS = 4;
const RAIL_WIDTH = 76;
const RAIL_GAP = 9;
const RAIL_TOP_MARGIN = 14;
const LOBBY_PANELS = [
  { key: 'invite', label: 'Davet', icon: 'ticket-outline' },
  { key: 'players', label: 'Oyuncular', icon: 'people-outline' },
  { key: 'games', label: 'Oyunlar', icon: 'game-controller-outline' },
  { key: 'settings', label: 'Ayarlar', icon: 'options-outline' },
] as const;
type LobbyPanel = typeof LOBBY_PANELS[number]['key'];
const getGameStyles = () => [
  { id: 'anagram', name: translate("Harf Bulmacası"), description: translate("Kelimeleri çöz, parçaları kazan"), icon: 'text' },
  { id: 'riddle', name: translate("Bilmece"), description: translate("Takımca düşün, doğru cevabı bul"), icon: 'bulb' },
  { id: 'memory', name: translate("Hızlı eşleştirme"), description: translate("Gösterilen sırayı hatırla ve aynı sırayla dokun"), icon: 'albums' },
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
  const [languageBusy, setLanguageBusy] = useState(false);
  const factsEnabled = room.friend_facts_enabled === true;
  const [factsReviewed, setFactsReviewed] = useState(false);
  const [savingGames, setSavingGames] = useState(false);
  const { toast, show } = useToast();
  const [appearance, setAppearance] = useState<HomeAppearance | null>(null);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const appearanceWrite = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const simple = appearance === 'simple';

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(HOME_APPEARANCE_KEY).catch(() => null).then(value => {
      if (mounted) setAppearance(readHomeAppearance(value));
    });
    return () => { mounted = false; };
  }, []);

  const changeAppearance = async () => {
    if (appearanceWrite.current || appearance === null) return;
    appearanceWrite.current = true;
    const next = simple ? 'normal' : 'simple';
    setSavingAppearance(true);
    try {
      await AsyncStorage.setItem(HOME_APPEARANCE_KEY, next);
      if (next === 'simple') {
        setPanel('games');
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      setAppearance(next);
    } catch {
      show(translate("Görünüm tercihi kaydedilemedi."), 'error');
    } finally {
      appearanceWrite.current = false;
      setSavingAppearance(false);
    }
  };


  const selectedGames = room.selected_games ?? DEFAULT_GAMES;
  const [editedGames, setDraftGames] = useState<string[]>(() => [...selectedGames]);
  const [editingGames, setEditingGames] = useState(false);
  const gamesLocked = room.selected_games_locked === true;
  const [panel, setPanel] = useState<LobbyPanel>('games');
  const canEditGames = room.mode === 'custom' && me.is_host && (!gamesLocked || editingGames) && !savingGames && !busy;

  // Locked selections come straight from the server; edits remain local until saved.
  const draftGames = gamesLocked && !editingGames && !savingGames ? selectedGames : editedGames;

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
    Share.share({ message: format("{0}'ne gel! Oda kodu: {1}", translate(GAME_TITLE), room.code) }).catch(() => undefined);

  const empties = Math.max(0, Math.min(MAX_PLAYERS, Math.max(MIN_SLOTS, players.length + 1)) - players.length);
  const canStart = players.length >= 2;

  if (appearance === null) return <Screen>{null}</Screen>;

  const languageSettings = (
    <View style={{ gap: 8 }}>
      <Text style={{color:colors.text,fontWeight:'700'}}>{translate('Oyun dili')}</Text>
      <Muted>{translate('Odadaki herkes aynı soruları bu dilde görür.')}</Muted>
      <View style={{flexDirection:'row',gap:8}}>
        {(['tr','en'] as const).map(language => <Btn key={language}
          title={language === 'tr' ? 'Türkçe' : 'English'}
          tone={(room.game_language ?? 'tr') === language ? 'primary' : 'ghost'}
          disabled={!me.is_host || languageBusy || busy} loading={languageBusy && room.game_language !== language}
          onPress={async()=>{setLanguageBusy(true);try{await api.setRoomGameLanguage(room.id,language);show(translate('Oyun dili kaydedildi.'),'success');}catch(error){show((error as Error).message,'error');}finally{setLanguageBusy(false);}}} />)}
      </View>
    </View>
  );

  const codeCard = (
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
  );

  const playersPanel = (
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
        {!simple && languageSettings}
        <ProgressBar pct={players.length / MAX_PLAYERS} colors={gradients.primary} height={8} />

        <View style={[s.grid, simple && s.compactGrid]}>
          {players.map((p) => {
            const isMe = p.id === me.id;
            return (
              <View key={p.id} style={[s.player, simple && s.compactPlayer, isMe && s.playerMe]}>
                {p.is_host && (
                  <View style={s.crown}>
                    <Ionicons name="star" size={12} color="#3A2100" />
                  </View>
                )}
                <Avatar source={avatarFor(p.nickname, p.avatar_id)} size={simple ? 32 : 58} ring={isMe ? colors.cyan : colors.borderLight} glow={isMe} />
                <Text numberOfLines={1} style={[s.pName, isMe && { color: colors.cyan }]}>{p.nickname}</Text>
                <Text style={s.pRole}>{p.is_host ? translate("KURUCU") : (p as any).is_bot ? '🤖 BOT' : isMe ? translate("SEN") : translate("OYUNCU")}</Text>
                {me.is_host && !isMe && !p.is_host && !p.is_bot && (simple ? (
                  <IconBtn
                    icon="person-remove-outline"
                    accessibilityLabel={translate("Çıkar") + ' ' + p.nickname}
                    disabled={!!kickingId || busy}
                    onPress={() => confirmKick(p.id, p.nickname)}
                  />
                ) : (
                  <Btn title={translate("Çıkar")} icon="person-remove-outline" size="sm" tone="ghost" disabled={!!kickingId || busy} loading={kickingId === p.id} onPress={() => confirmKick(p.id, p.nickname)} />
                ))}
              </View>
            );
          })}
          {!simple && Array.from({ length: empties }).map((_, i) => (
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
  );
  const gamesPanel = (
    room.mode === 'custom' ? <Reveal delay={80}>
      <Card style={{ gap: 12 }}>
        <Title size={20}>{translate("Oynamak istediğin oyunları seç")}</Title>
        <Muted>{me.is_host ? translate("Kurucu olarak oyun türlerini seçebilirsin. Seçimlerin tüm oyunculara yansır.") : translate("Oyun kurucusunun seçtiği türler aşağıda görünüyor.")}</Muted>
        {me.is_host && (
          <View style={[s.gameActions, simple && s.compactGameActions]}>
            <Btn title={translate("Tümünü Seç")} icon="checkmark-done" size="sm" tone="success" disabled={!canEditGames || DEFAULT_GAMES.every((gameId) => draftGames.includes(gameId))} onPress={selectAllGames} style={{ flex: 1 }} />
            <Btn title={translate("Tümünü Kaldır")} icon="close-circle-outline" size="sm" tone="ghost" disabled={!canEditGames || draftGames.length === 0} onPress={clearAllGames} style={{ flex: 1 }} />
          </View>
        )}
        <View style={s.gameGrid}>
          {GAME_STYLES.map((game) => {
            const enabled = (canEditGames ? draftGames : selectedGames).includes(game.id);
            return (
              <Tap key={game.id} onPress={() => { if (canEditGames) toggleGame(game.id); }} style={[s.gameStyleRow, simple && s.compactGame, enabled && s.gameStyleSelected, !canEditGames && s.gameStyleDisabled]}>
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
    </Reveal> : <Card style={{gap:8}}><Title size={20}>{translate("🎲 Rastgele Oyunlar")}</Title><Muted>{translate("Bu modda oyunlar oda açılırken otomatik seçildi. Her yeni odada farklı bir karışım oluşur.")}</Muted><View style={s.gameGrid}>{GAME_STYLES.filter(g=>selectedGames.includes(g.id)).map(g=><View key={g.id} style={[s.gameStyleRow,simple && s.compactGame,s.gameStyleSelected]}><Ionicons name={g.icon} size={18} color={colors.cyan}/><Text style={s.gameStyleTitle}>{g.name}</Text></View>)}</View></Card>
  );
  const settingsPanel = (
    <>
      {simple && <Card>{languageSettings}</Card>}
      {me.is_host && <Card style={{gap:12}}><Title size={20}>{translate("🤖 Test Botları")}</Title><Muted>{translate("İkinci cihaz olmadan lobi, takım dağılımı ve sosyal oylamaları test et. Botlar gerçek oyuncu değildir; refleks veya Pong gibi canlı kontrolleri otomatik oynamazlar.")}</Muted><Text style={{color:colors.text,fontWeight:'700'}}>{translate('Bot sayısı:')} {draftBotCount??botCount} · {translate('Toplam oyuncu:')} {players.length}</Text><View style={{flexDirection:'row',gap:10}}><Btn title="−" tone="ghost" disabled={botBusy||(draftBotCount??botCount)===0} onPress={()=>setDraftBotCount(Math.max(0,(draftBotCount??botCount)-1))}/><Btn title="+" tone="ghost" disabled={botBusy||(draftBotCount??botCount)>=Math.min(11,12-players.length+botCount)} onPress={()=>setDraftBotCount(Math.min(11,(draftBotCount??botCount)+1))}/><View style={{flex:1}}><Btn title={translate("Botları Uygula")} tone="success" loading={botBusy} disabled={botBusy||(draftBotCount??botCount)===botCount} onPress={async()=>{setBotBusy(true);try{await api.setTestBots(room.id,draftBotCount??botCount);setDraftBotCount(null);setFactsReviewed(false);show(translate("Test botları güncellendi."),'success');}catch(e){show((e as Error).message,'error');}finally{setBotBusy(false);}}}/></View></View></Card>}

        <Reveal delay={130}>
          <Card style={{ gap: 10 }}>
            <Title size={19}>{translate("🧠 Beni Ne Kadar Tanıyorsun?")}</Title>
            <Muted>{factsEnabled ? translate("Etkin. Herkes kişisel soruları cevaplar; cevaplar okunduktan sonra hafıza soruları oyunlarda kullanılabilir.") : translate("İsteğe bağlıdır. Kapalıyken kişisel sorular gösterilmez ve doldurmak gerekmez.")}</Muted>
            {me.is_host && <Btn title={factsEnabled ? translate("Kişisel Soruları Kapat") : translate("Kişisel Soruları Etkinleştir")} icon={factsEnabled ? 'toggle' : 'toggle-outline'} tone={factsEnabled ? 'success' : 'ghost'} loading={factsToggleBusy} disabled={factsToggleBusy || busy} onPress={toggleFriendFacts} />}
            {!me.is_host && <Muted>{factsEnabled ? translate("Oda kurucusu bu özelliği etkinleştirdi.") : translate("Bu özellik oda kurucusu tarafından etkinleştirilmedi.")}</Muted>}
          </Card>
        </Reveal>
    </>
  );
  const personalQuestions = (
    <>
      {factsEnabled && <FriendFactsLobby roomId={room.id} players={players} onReady={setFactsReady} />}

        {factsEnabled && factsReady && me.is_host && <Btn title={factsReviewed ? translate("Cevaplar İncelendi ✓") : translate("Herkes Cevapları Okudu, Devam Et")} icon="book" tone="success" onPress={() => setFactsReviewed(true)} disabled={factsReviewed} />}
    </>
  );
  const startAction = (
    me.is_host ? (
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
      )
  );
  const exitActions = (
    <>
      {me.is_host && <><Btn title={translate("Odayı Kapat")} tone="danger" icon="close-circle" disabled={busy} onPress={() => setCloseConfirm(true)} /><Muted>{translate("Tek kişilik bekleme odaları 10 dakika sonra otomatik kapanır.")}</Muted></>}
          <Btn title={translate("Odadan Ayrıl")} tone="ghost" icon="exit-outline" size="md" onPress={leave} />
    </>
  );

  return (
    <Screen>
      {!simple && (
        <Pressable
          testID="lobby-simple-view"
          accessibilityRole="button"
          disabled={savingAppearance}
          onPress={() => { void changeAppearance(); }}
          style={({ pressed }) => [
            s.normalViewLink,
            s.simpleViewLink,
            (pressed || savingAppearance) && s.normalViewLinkPressed,
          ]}
        >
          <Text style={s.normalViewLabel}>{translate("Basit görünüme geç")}</Text>
        </Pressable>
      )}
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {simple ? <>
          <View style={s.simpleHeader}>
            <View style={s.simpleHeaderTitle}>
              <Eyebrow color={colors.mint}>{translate(GAME_TITLE)}</Eyebrow>
              <Title size={32}>{translate("Bekleme odası")}</Title>
            </View>
            <View style={s.countBadge}>
              <Text display style={s.countText}>{players.length}</Text>
              <Text style={s.countMax}>/{MAX_PLAYERS}</Text>
            </View>
          </View>
          <CompactLobbyPanel
            panel={panel}
            onChange={setPanel}
            onNormalPress={() => { void changeAppearance(); }}
            savingAppearance={savingAppearance}
            footer={startAction}
          >
            {panel === 'invite' && <>
              <Text display style={s.compactCode}>{room.code}</Text>
              <Btn title={translate("Arkadaşlarına Gönder")} tone="ghost" icon="share-social" size="md" onPress={share} />
            </>}
            {panel === 'players' && playersPanel}
            {panel === 'games' && gamesPanel}
            {panel === 'settings' && settingsPanel}
          </CompactLobbyPanel>
          {personalQuestions}
          <View style={s.lobbyExitActions} testID="lobby-exit-actions">
            {exitActions}
          </View>
        </> : <>
          {playersPanel}
          {gamesPanel}
          {codeCard}
          {settingsPanel}
          {personalQuestions}
          <Reveal delay={180} style={{ gap: 12 }}>
            {startAction}
            {exitActions}
          </Reveal>
        </>}
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
          <Title size={22}>{translate("Odayı kapat?")}</Title><Muted>{translate("Odadaki herkes ana ekrana döner. Bu oda koduyla tekrar katılınamaz.")}</Muted>
          <Btn title={translate("Vazgeç")} tone="ghost" disabled={busy} onPress={() => setCloseConfirm(false)} />
          <Btn title={translate("Odayı Kapat")} tone="danger" loading={busy} onPress={async () => { if (busy) return; setBusy(true); try { await api.closeRoom(room.id); ctx.onLeave(); } catch (error) { show((error as Error).message, 'error'); } finally { setBusy(false); } }} />
        </View></View>
      </Modal>
      {toast}
    </Screen>
  );
}

function CompactLobbyPanel({ panel, onChange, onNormalPress, savingAppearance, footer, children }: {
  panel: LobbyPanel;
  onChange: (panel: LobbyPanel) => void;
  onNormalPress: () => void;
  savingAppearance: boolean;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const [{ width, height }, setSize] = useState({ width: 0, height: 0 });
  const [railHeight, setRailHeight] = useState(228);
  const [bodyTop, setBodyTop] = useState(98);
  const left = width - RAIL_WIDTH - RAIL_GAP;
  const railTop = bodyTop + RAIL_TOP_MARGIN;
  const railBottom = railTop + railHeight;
  const upperShoulder = railTop - RAIL_GAP;
  const lowerShoulder = railBottom + RAIL_GAP;
  const path = width > RAIL_WIDTH + 60 && upperShoulder >= 34 && height - lowerShoulder >= 38
    ? [
      'M 20 1', `H ${width - 20} Q ${width - 1} 1 ${width - 1} 20`,
      `V ${upperShoulder - 15} Q ${width - 1} ${upperShoulder} ${width - 17} ${upperShoulder}`,
      `H ${left + 15} Q ${left} ${upperShoulder} ${left} ${upperShoulder + 15}`,
      `V ${lowerShoulder - 15} Q ${left} ${lowerShoulder} ${left + 15} ${lowerShoulder}`,
      `H ${width - 17} Q ${width - 1} ${lowerShoulder} ${width - 1} ${lowerShoulder + 15}`,
      `V ${height - 20} Q ${width - 1} ${height - 1} ${width - 20} ${height - 1}`,
      `H 20 Q 1 ${height - 1} 1 ${height - 20} V 20 Q 1 1 20 1 Z`,
    ].join(' ')
    : null;

  return (
    <View
      testID="compact-lobby-panel"
      onLayout={({ nativeEvent: { layout } }) => setSize(previous =>
        previous.width === layout.width && previous.height === layout.height
          ? previous : { width: layout.width, height: layout.height }
      )}
    >
      {path && <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={width} height={height} accessible={false}>
          <Defs>
            <SvgGradient id="lobbyPanelFill" x1="0%" y1="0%" x2="90%" y2="100%">
              <Stop offset="0%" stopColor="#30465D" />
              <Stop offset="48%" stopColor="#23344E" />
              <Stop offset="100%" stopColor="#17243B" />
            </SvgGradient>
          </Defs>
          <Path d={path} fill="url(#lobbyPanelFill)" stroke="#536984" strokeWidth={1.4} />
        </Svg>
      </View>}
      <View style={s.compactHeading}>
        <View style={s.compactHeadingRow}>
          <View style={s.compactHeadingTitle}>
            <Title size={23}>{panel === 'invite' ? translate("Katılım kodu") : translate(LOBBY_PANELS.find(item => item.key === panel)!.label)}</Title>
          </View>
          <Pressable
            testID="lobby-normal-view"
            accessibilityRole="button"
            disabled={savingAppearance}
            onPress={onNormalPress}
            style={({ pressed }) => [s.normalViewLink, (pressed || savingAppearance) && s.normalViewLinkPressed]}
          >
            <Text style={s.normalViewLabel}>{translate("Normal görünüme geç")}</Text>
          </Pressable>
        </View>
        {panel === 'invite' && <Muted>{translate("Arkadaşların bu kodla odaya katılabilir.")}</Muted>}
      </View>
      <View style={s.compactBody} onLayout={({ nativeEvent }) => setBodyTop(nativeEvent.layout.y)}>
        <View style={[s.compactContent, panel !== 'invite' && s.expandedCompactContent]}>
          <ScrollView
            key={panel}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={s.compactDetails}
            contentContainerStyle={s.compactDetailsContent}
          >
            {children}
          </ScrollView>
        </View>
        <View style={s.compactRailWrap} onLayout={({ nativeEvent }) => setRailHeight(nativeEvent.layout.height)}>
          <SwipeTabGroup axis="vertical" testID="lobby-right-menu" style={s.compactRail} onSwipe={index => {
            const item = LOBBY_PANELS[index];
            if (item) onChange(item.key);
          }}>
            {(recordLayout, preview) => LOBBY_PANELS.map(({ key, label, icon }, index) => {
              const selected = panel === key;
              const ink = preview
                ? swipeTabTint(colors.textSoft, colors.mint, preview.position, index)
                : selected ? colors.mint : colors.textSoft;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  aria-selected={selected}
                  onPress={() => onChange(key)}
                  onLayout={event => recordLayout(index, event)}
                  style={s.compactRailButton}
                >
                  {({ pressed }) => <>
                    {selected && <View pointerEvents="none" style={s.compactRailSelected} />}
                    <Ionicons name={icon} size={18} color={ink} style={{ transform: [{ scale: swipeTabIconScale(preview?.position ?? (pressed ? index : null), index) }] }} />
                    <Text style={[s.compactRailLabel, { color: ink }]}>{translate(label)}</Text>
                  </>}
                </Pressable>
              );
            })}
          </SwipeTabGroup>
        </View>
      </View>
      <View style={s.compactFooter}>
        {footer}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  kickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.76)', justifyContent: 'center', padding: 22 },
  kickDialog: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 20, padding: 20, gap: 12 },
  scroll: { gap: 16, paddingBottom: 30, paddingTop: 6 },
  lobbyExitActions: { gap: 12 },
  simpleHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 8 },
  simpleHeaderTitle: { flex: 1, gap: 5 },
  compactHeading: { paddingHorizontal: 15, paddingTop: 16, paddingBottom: 14, minHeight: 98, gap: 5 },
  compactHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  compactHeadingTitle: { flex: 1, minWidth: 0 },
  normalViewLink: { minHeight: 44, maxWidth: '48%', justifyContent: 'center' },
  simpleViewLink: { alignSelf: 'flex-end' },
  normalViewLinkPressed: { opacity: 0.65 },
  normalViewLabel: { color: colors.mint, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  compactBody: { flexDirection: 'row', alignItems: 'flex-start', gap: RAIL_GAP },
  compactContent: { flex: 1, minWidth: 0, minHeight: 228, paddingHorizontal: 12, paddingBottom: 8 },
  expandedCompactContent: { minHeight: 330 },
  compactDetails: { maxHeight: 322 },
  compactFooter: { minHeight: 78, paddingHorizontal: 14, paddingTop: 20, paddingBottom: 13, alignItems: 'flex-end', justifyContent: 'flex-end' },
  compactDetailsContent: { gap: 10, paddingVertical: 2 },
  compactRailWrap: { width: RAIL_WIDTH, flexShrink: 0, marginTop: RAIL_TOP_MARGIN },
  compactRail: { padding: 4, borderWidth: 1, borderColor: '#526884', borderRadius: 23, backgroundColor: '#22344F' },
  compactRailButton: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 5, gap: 4 },
  compactRailSelected: { ...StyleSheet.absoluteFill, borderRadius: 17, backgroundColor: '#39576C' },
  compactRailLabel: { fontSize: 11, fontWeight: '700', textAlign: 'center' },
  compactCode: { fontSize: 43, letterSpacing: 5, color: colors.mint, fontWeight: '900' },
  compactPlayer: { width: '48%', paddingVertical: 8 },
  compactGrid: { gap: 0, rowGap: 7, justifyContent: 'space-between' },
  compactGame: { width: '100%', minHeight: 44 },
  compactGameActions: { flexDirection: 'column' },
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
