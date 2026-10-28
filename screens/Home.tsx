import React, { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Float, GemIcon, IconBtn, IconName, Input, Muted, ProgressBar, Reveal, Screen,
  SectionLabel, TabBar, TabItem, Tap, Text, Title, useToast,
} from '../components/ui';
import { api, type OpenRoom } from '../lib/api';
import { supabase } from '../lib/supabase';
import { art, avatarFor, AVATAR_OPTIONS, type AvatarId } from '../lib/art';
import { getProfile, levelOf, Profile } from '../lib/profile';
import { soundFx } from '../lib/soundEffects';
import { alpha, colors, gradients } from '../lib/theme';
import type { GameMode } from '../lib/types';

export const GAME_TITLE = 'Ucube Atölyesi';

type Tab = 'play' | 'how' | 'profile';
const TABS: TabItem<Tab>[] = [
  { key: 'play', label: 'Oyna', icon: 'game-controller-outline', iconActive: 'game-controller' },
  { key: 'how', label: 'Nasıl Oynanır', icon: 'book-outline', iconActive: 'book' },
  { key: 'profile', label: 'Profil', icon: 'person-outline', iconActive: 'person' },
];

const STEPS: { icon: IconName; color: string; title: string; text: string }[] = [
  { icon: 'people', color: colors.cyan, title: 'Takımlara ayrılın', text: 'Oda kodunu paylaş. Oyun başlayınca herkes adil şekilde iki takıma bölünür; her takımın bir Kaptanı olur.' },
  { icon: 'help-circle', color: colors.yellow, title: 'Soruları çöz, parça kazan', text: 'Harf bulmacası ya da bilmece… İlk doğru cevaplayan takım yapı parçasını alır. Yanlış cevap parçayı rakibe verir!' },
  { icon: 'flash', color: colors.mint, title: 'Devre arası mini oyun', text: 'Refleks, hafıza veya denge oyununu kazanan takım bonus parça ve +2 puan alır.' },
  { icon: 'construct', color: colors.magenta, title: 'Yaratığını inşa et', text: 'Takımın Mimarı toplanan parçaları tuvale dizer. Diğerleri emoji ve sesli yönlendirmeyle destek olur.' },
  { icon: 'trophy', color: colors.gold, title: 'Gizli oylama', text: 'En çılgın yaratığa gizlice oy ver. Resmi şampiyon puanla, en komik tasarım oylarla belirlenir.' },
];

export function HomeScreen({ onEnter, avatarId, onAvatarChange }: { onEnter: (roomId: string) => void; avatarId: AvatarId; onAvatarChange: (id: AvatarId) => void }) {
  const [tab, setTab] = useState<Tab>('play');
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [mode, setMode] = useState<GameMode>('standard');
  const [modeIndex, setModeIndex] = useState(1);
  const { width: windowWidth } = useWindowDimensions();
  const [modeCarouselWidth, setModeCarouselWidth] = useState(0);
  const modeSlideWidth = modeCarouselWidth || Math.max(220, windowWidth - 72);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [profile, setProfile] = useState<Profile>({ games: 0, wins: 0, lastRoom: null });
  const [sound, setSound] = useState(soundFx.isEnabled());
  const { toast, show } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const modeCarouselRef = useRef<ScrollView>(null);

  useEffect(() => {
    AsyncStorage.getItem('nickname').then((v) => v && setNick(v));
    getProfile().then(setProfile);
  }, []);

  // Açık odaları ilk yüklemede al ve oda/oyuncu değişikliklerini gerçek zamanlı izle.
  useEffect(() => {
    let active = true;
    const refreshRooms = async () => {
      try {
        const rooms = await api.openRooms();
        if (active) setOpenRooms(rooms);
      } catch (error) {
        console.warn('Açık odalar yüklenemedi:', error);
      } finally {
        if (active) setRoomsLoading(false);
      }
    };
    void refreshRooms();
    const channel = supabase
      .channel('public-open-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => { void refreshRooms(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { void refreshRooms(); })
      .subscribe();
    // Public room metadata is also refreshed for visitors who are not room members.
    const refreshInterval = setInterval(() => { void refreshRooms(); }, 5000);
    return () => {
      active = false;
      clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, []);

  // İlk açılışta standart mod ikinci kartta görünmeli; carousel konumunu
  // seçili mod ve pagination noktasıyla eşleştir.
  useEffect(() => {
    if (modeCarouselWidth <= 0) return;
    modeCarouselRef.current?.scrollTo({ x: modeCarouselWidth, animated: false });
    setModeIndex(1);
    setMode('standard');
  }, [modeCarouselWidth]);

  const lvl = levelOf(profile);
  const displayName = nick.trim() || 'Yeni Oyuncu';

  const run = async (kind: 'create' | 'join', selectedRoomCode?: string) => {
    const name = nick.trim();
    if (!name) { show('Önce bir takma ad yaz', 'error'); setTab('play'); return; }
    const joinCode = (selectedRoomCode ?? code).trim();
    if (kind === 'join' && joinCode.length < 4) return show('Oda kodunu yaz.', 'error');
    setBusy(kind);
    try {
      await AsyncStorage.setItem('nickname', name);
      const res = kind === 'create' ? await api.createRoom(name, mode) : await api.joinRoom(joinCode, name);
      onEnter(res.room_id);
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggleSound = (v: boolean) => {
    soundFx.setEnabled(v);
    setSound(v);
    AsyncStorage.setItem('soundEnabled', String(v)).catch(console.warn);
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ================= ÜST BAR ================= */}
        <View style={s.topBar}>
          <Avatar source={avatarFor(displayName, avatarId)} size={52} ring={colors.cyan} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={s.nameRow}>
              <Text numberOfLines={1} display style={s.topName}>{displayName}</Text>
              <Chip label={`LVL ${lvl.level}`} color={colors.gold} size="sm" icon="flash" />
            </View>
            <ProgressBar pct={lvl.progress} colors={gradients.gold} height={8} />
          </View>
          <IconBtn
            icon={sound ? 'volume-high' : 'volume-mute'}
            onPress={() => toggleSound(!sound)}
            active={sound}
          />
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {tab === 'play' && (
            <>
              {/* ================= HERO ================= */}
              <Reveal>
                <View style={s.hero}>
                  <LinearGradient colors={['#0F2A52', '#0A1830', '#160F38']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
                  <Float amount={6} duration={2600} style={s.heroImgWrap}>
                    <Image source={art.fox} style={s.heroImg} resizeMode="cover" />
                  </Float>
                  <LinearGradient
                    colors={['#0A1830', '#0A1830', 'rgba(10,24,48,0)']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={s.heroFade}
                    pointerEvents="none"
                  />
                  <View style={s.heroText}>
                    <Eyebrow live color={colors.mint} dot={colors.mint}>Çok oyunculu arena</Eyebrow>
                    <Title size={31} style={{ marginTop: 8 }}>{GAME_TITLE}</Title>
                    <Muted style={{ marginTop: 6, maxWidth: 190 }}>
                      İki takım, aynı bulmacalar. Parçaları kap, en absürt yaratığı inşa et!
                    </Muted>
                    <View style={s.heroChips}>
                      <Chip icon="people" label="2 Takım" color={colors.cyan} size="sm" />
                      <Chip icon="time" label="5-20 dk" color={colors.magenta} size="sm" />
                    </View>
                  </View>
                </View>
              </Reveal>

              {/* ================= TAKMA AD ================= */}
              <Reveal delay={80}>
                <Card style={{ gap: 12 }}>
                  <Eyebrow icon="person-circle" color={colors.muted}>Oyuncu adın</Eyebrow>
                  <Input
                    icon="happy"
                    value={nick}
                    onChangeText={setNick}
                    onBlur={() => {
                      if (Platform.OS !== 'web') return;
                      setTimeout(() => {
                        if (typeof document !== 'undefined' && document.activeElement === document.body) {
                          scrollRef.current?.scrollTo({ y: 0, animated: false });
                        }
                      }, 420);
                    }}
                    placeholder="örn. Çorap Avcısı"
                    maxLength={20}
                  />
                </Card>
              </Reveal>

              {/* ================= ODA KUR ================= */}
              <Reveal delay={160}>
                <Card accent={colors.mint} style={{ gap: 14 }}>
                  <View style={s.cardHead}>
                    <View style={[s.cardIcon, { backgroundColor: alpha(colors.mint, 0.14), borderColor: alpha(colors.mint, 0.4) }]}>
                      <Ionicons name="add-circle" size={22} color={colors.mint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={20}>Yeni Oda Kur</Title>
                      <Muted>Hızlı, Standart ve Epik modlarda oyunlar rastgele seçilir. Özel modda oyunları sen belirlersin.</Muted>
                    </View>
                  </View>
                  <View style={{ position: 'relative', width: '100%' }}>
                  <ScrollView
                    ref={modeCarouselRef}
                    horizontal
                    nestedScrollEnabled
                    pagingEnabled
                    scrollEventThrottle={16}
                    showsHorizontalScrollIndicator={false}
                    style={{ width: '100%' }}
                    onLayout={(event) => setModeCarouselWidth(event.nativeEvent.layout.width)}
                    onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                      const pageWidth = event.nativeEvent.layoutMeasurement.width || modeSlideWidth;
                      const nextIndex = Math.max(0, Math.min(3, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
                      setModeIndex((current) => current === nextIndex ? current : nextIndex);
                      const modes: GameMode[] = ['quick', 'standard', 'long', 'custom'];
                      setMode((current) => current === modes[nextIndex] ? current : modes[nextIndex]);
                    }}
                    onMomentumScrollEnd={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
                      const pageWidth = event.nativeEvent.layoutMeasurement.width || modeSlideWidth;
                      const nextIndex = Math.max(0, Math.min(3, Math.round(event.nativeEvent.contentOffset.x / pageWidth)));
                      setModeIndex(nextIndex);
                      const modes: GameMode[] = ['quick', 'standard', 'long', 'custom'];
                      setMode(modes[nextIndex]);
                    }}
                  >
                    {([
                      ['quick', 'flash', 'Hızlı', '8 Soru • ~5 dk', colors.yellow],
                      ['standard', 'trophy', 'Standart', '14 Soru • ~10 dk', colors.cyan],
                      ['long', 'flame', 'Epik', '20 Soru • ~18 dk', colors.violet],
                      ['custom', 'options', 'Özel', 'Oyunları sen seç', colors.mint],
                    ] as const).map(([m, icon, label, sub, c], index) => {
                      const on = mode === m;
                      return (
                        <View key={m} style={{ width: modeSlideWidth, paddingHorizontal: 2 }}>
                          <Tap
                            color={alpha(c, 0.32)}
                            accent={c}
                            scaleTo={0.98}
                            onPress={() => { soundFx.click(); setMode(m); setModeIndex(index); }}
                            style={[
                              s.modeSlide,
                              on && { borderColor: c, backgroundColor: alpha(c, 0.14), shadowColor: c, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
                            ]}
                          >
                            <View style={[s.modeIcon, { width: 54, height: 54, borderRadius: 27, backgroundColor: alpha(c, on ? 0.22 : 0.1) }]}>
                              <Ionicons name={icon} size={28} color={on ? c : colors.muted} />
                            </View>
                            <Text display style={[s.modeLabel, { fontSize: 20 }, on && { color: colors.text }]}>{label}</Text>
                            <Text style={[s.modeSub, { fontSize: 12 }, on && { color: c }]}>{sub}</Text>
                            {on && (
                              <View style={[s.modeCheck, { backgroundColor: c }]}>
                                <Ionicons name="checkmark" size={12} color="#0A1020" />
                              </View>
                            )}
                            <Text style={{ color: colors.subtle, fontSize: 11, marginTop: 8 }}>Yana kaydırarak modları keşfet</Text>
                          </Tap>
                        </View>
                      );
                    })}
                  </ScrollView>
                  {modeIndex > 0 && (
                    <Tap
                      onPress={() => {
                        const nextIndex = modeIndex - 1;
                        const modes: GameMode[] = ['quick', 'standard', 'long', 'custom'];
                        setModeIndex(nextIndex);
                        setMode(modes[nextIndex]);
                        modeCarouselRef.current?.scrollTo({ x: nextIndex * modeSlideWidth, animated: true });
                      }}
                      style={{ position: 'absolute', left: 12, top: '50%', marginTop: -15, width: 26, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,16,32,0.34)', alignItems: 'center', justifyContent: 'center', zIndex: 5, opacity: 0.72 }}
                    >
                      <Ionicons name="chevron-back" size={18} color="rgba(255,255,255,0.78)" />
                    </Tap>
                  )}
                  {modeIndex < 3 && (
                    <Tap
                      onPress={() => {
                        const nextIndex = modeIndex + 1;
                        const modes: GameMode[] = ['quick', 'standard', 'long', 'custom'];
                        setModeIndex(nextIndex);
                        setMode(modes[nextIndex]);
                        modeCarouselRef.current?.scrollTo({ x: nextIndex * modeSlideWidth, animated: true });
                      }}
                      style={{ position: 'absolute', right: 12, top: '50%', marginTop: -15, width: 26, height: 30, borderRadius: 15, backgroundColor: 'rgba(10,16,32,0.34)', alignItems: 'center', justifyContent: 'center', zIndex: 5, opacity: 0.72 }}
                    >
                      <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.78)" />
                    </Tap>
                  )}
                  </View>
                  <View style={s.modeDots}>
                    {(['quick', 'standard', 'long', 'custom'] as GameMode[]).map((m, i) => (
                      <Tap
                        key={m}
                        onPress={() => {
                          const modes: GameMode[] = ['quick', 'standard', 'long', 'custom'];
                          setMode(modes[i]);
                          setModeIndex(i);
                          // Kartı noktalardan seçmek için carousel konumunu aynı indekse kaydır.
                          modeCarouselRef.current?.scrollTo({ x: i * modeSlideWidth, animated: true });
                        }}
                        style={[s.modeDot, modeIndex === i && s.modeDotActive]}
                      >
                        <View style={[s.modeDotInner, modeIndex === i && s.modeDotInnerActive]} />
                      </Tap>
                    ))}
                  </View>
                  <Btn title="Oda Kur" tone="success" icon="rocket" loading={busy === 'create'} onPress={() => run('create')} />
                </Card>
              </Reveal>

              {/* ================= ODAYA KATIL ================= */}
              <Reveal delay={240}>
                <Card accent={colors.cyan} style={{ gap: 14 }}>
                  <View style={s.cardHead}>
                    <View style={[s.cardIcon, { backgroundColor: alpha(colors.cyan, 0.14), borderColor: alpha(colors.cyan, 0.4) }]}>
                      <Ionicons name="enter" size={22} color={colors.cyan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={20}>Odaya Katıl</Title>
                      <Muted>Arkadaşının paylaştığı kodu gir.</Muted>
                    </View>
                  </View>
                  <Input
                    center
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    placeholder="ODA KODU"
                    autoCapitalize="characters"
                    maxLength={5}
                    style={s.codeInput}
                  />
                  <Btn title="Odaya Giriş Yap" tone="primary" icon="log-in" loading={busy === 'join'} onPress={() => run('join')} />
                </Card>
              </Reveal>

              {/* ================= AÇIK ODALAR ================= */}
              <Reveal delay={280}>
                <Card accent={colors.mint} style={{ gap: 14 }}>
                  <View style={s.cardHead}>
                    <View style={[s.cardIcon, { backgroundColor: alpha(colors.mint, 0.14), borderColor: alpha(colors.mint, 0.4) }]}>
                      <Ionicons name="earth" size={22} color={colors.mint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={20}>Açık Odalar</Title>
                      <Muted>Herkese açık bekleyen ve devam eden oyunlar.</Muted>
                    </View>
                    <View style={{ minWidth: 28, height: 28, borderRadius: 14, backgroundColor: alpha(colors.mint, 0.14), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
                      <Text style={{ color: colors.mint, fontWeight: '700', fontSize: 12 }}>{openRooms.length}</Text>
                    </View>
                  </View>
                  {roomsLoading ? (
                    <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Muted>Açık odalar yükleniyor…</Muted>
                    </View>
                  ) : openRooms.length === 0 ? (
                    <View style={{ paddingVertical: 12, alignItems: 'center', gap: 5 }}>
                      <Ionicons name="game-controller-outline" size={28} color={colors.muted} />
                      <Text style={{ color: colors.textSoft, fontWeight: '600' }}>Şimdilik açık oda yok</Text>
                      <Muted>Bir oda kurduğunda burada görünecek.</Muted>
                    </View>
                  ) : openRooms.map((room) => {
                    const waiting = room.phase === 'lobby';
                    const full = room.player_count >= 12;
                    const modeLabel: Record<string, string> = { quick: 'Hızlı', standard: 'Standart', long: 'Epik', custom: 'Özel' };
                    return (
                      <View key={room.code} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inset, padding: 12, gap: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: alpha(waiting ? colors.mint : colors.violet, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={waiting ? 'people' : 'game-controller'} size={20} color={waiting ? colors.mint : colors.violet} />
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text display style={{ fontSize: 15, color: colors.text, fontWeight: '700' }}>{room.host_nickname}'ın Odası</Text>
                            <Muted>{modeLabel[room.mode] ?? room.mode} mod · {room.player_count}/12 oyuncu</Muted>
                          </View>
                          <Chip label={waiting ? 'Bekliyor' : 'Devam ediyor'} color={waiting ? colors.mint : colors.violet} size="sm" />
                        </View>
                        <Btn
                          title={waiting && !full ? 'Katıl' : full && waiting ? 'Oda dolu' : 'Oyun başladı'}
                          icon={waiting && !full ? 'log-in' : undefined}
                          tone={waiting && !full ? 'success' : 'ghost'}
                          size="md"
                          disabled={!waiting || full || busy === 'join'}
                          loading={busy === 'join' && code === room.code}
                          onPress={() => { setCode(room.code); void run('join', room.code); }}
                        />
                      </View>
                    );
                  })}
                </Card>
              </Reveal>
            </>
          )}

          {tab === 'how' && (
            <>
              <Reveal>
                <View style={{ gap: 4 }}>
                  <Eyebrow color={colors.cyan} dot={colors.cyan}>Oyun rehberi</Eyebrow>
                  <Title size={28}>Nasıl Oynanır?</Title>
                  <Muted>5 adımda ucube yaratık inşa et, rakibi yen.</Muted>
                </View>
              </Reveal>
              {STEPS.map((st, i) => (
                <Reveal key={st.title} delay={80 + i * 70}>
                  <Card accent={st.color} style={s.step}>
                    <LinearGradient
                      colors={[alpha(st.color, 0.9), alpha(st.color, 0.45)]}
                      style={s.stepIcon}
                    >
                      <Ionicons name={st.icon} size={24} color="#0A1020" />
                    </LinearGradient>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.stepNo, { color: st.color }]}>ADIM {i + 1}</Text>
                      <Text display style={s.stepTitle}>{st.title}</Text>
                      <Muted>{st.text}</Muted>
                    </View>
                  </Card>
                </Reveal>
              ))}
              <Btn title="Hemen Oyna" icon="game-controller" tone="gold" onPress={() => setTab('play')} />
            </>
          )}

          {tab === 'profile' && (
            <>
              <Reveal>
                <View style={s.profileHero}>
                  <LinearGradient colors={['#12305C', '#0A1830', '#1B1040']} style={StyleSheet.absoluteFill} />
                  <Float amount={5}>
                    <Avatar source={avatarFor(displayName, avatarId)} size={104} ring={colors.gold} />
                  </Float>
                  <Title size={26} style={{ marginTop: 14 }}>{displayName}</Title>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Chip label={`Seviye ${lvl.level}`} icon="flash" color={colors.gold} />
                    <Chip label={`${lvl.xp} XP`} icon="sparkles" color={colors.cyan} />
                  </View>
                  <View style={{ alignSelf: 'stretch', marginTop: 18, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={s.xpLabel}>Sonraki seviye</Text>
                      <Text style={s.xpLabel}>{Math.round(lvl.progress * 100)}%</Text>
                    </View>
                    <ProgressBar pct={lvl.progress} colors={gradients.gold} height={12} />
                  </View>
                </View>
              </Reveal>

              <Reveal delay={90}>
                <View style={s.stats}>
                  <StatTile icon="game-controller" color={colors.cyan} value={profile.games} label="Oynanan" />
                  <StatTile icon="trophy" color={colors.gold} value={profile.wins} label="Galibiyet" />
                  <StatTile
                    icon="stats-chart"
                    color={colors.mint}
                    value={profile.games ? `%${Math.round((profile.wins / profile.games) * 100)}` : '—'}
                    label="Kazanma"
                  />
                </View>
              </Reveal>

              <Reveal delay={170}>
                <Card style={{ gap: 14 }}>
                  <SectionLabel>Hesap</SectionLabel>
                  <Muted>Avatarını değiştir</Muted>
                  <View style={s.avatarPicker}>
                    {AVATAR_OPTIONS.map((option) => (
                      <Tap key={option.id} onPress={() => onAvatarChange(option.id)} style={[s.avatarChoice, avatarId === option.id && s.avatarChoiceSelected]}>
                        <Avatar source={option.source} size={48} ring={avatarId === option.id ? colors.cyan : colors.borderLight} />
                        <Text style={s.avatarChoiceLabel}>{option.label}</Text>
                        {avatarId === option.id && <Ionicons name="checkmark-circle" size={16} color={colors.cyan} />}
                      </Tap>
                    ))}
                  </View>
                  <Input
                    icon="happy"
                    value={nick}
                    onChangeText={setNick}
                    onBlur={() => { const n = nick.trim(); if (n) AsyncStorage.setItem('nickname', n); }}
                    placeholder="Takma adın"
                    maxLength={20}
                  />
                  <View style={s.settingRow}>
                    <View style={[s.cardIcon, { backgroundColor: alpha(colors.violet, 0.14), borderColor: alpha(colors.violet, 0.4) }]}>
                      <Ionicons name="musical-notes" size={20} color={colors.violet} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.settingTitle}>Ses efektleri</Text>
                      <Muted>Oyun içi sesler ve geri bildirim</Muted>
                    </View>
                    <Switch
                      value={sound}
                      onValueChange={toggleSound}
                      trackColor={{ false: colors.surface2, true: alpha(colors.cyan, 0.55) }}
                      thumbColor={sound ? colors.cyan : colors.muted}
                    />
                  </View>
                </Card>
              </Reveal>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <TabBar items={TABS} active={tab} onChange={(k) => { setTab(k); if (k === 'profile') getProfile().then(setProfile); }} />
      {toast}
    </Screen>
  );
}

function StatTile({ icon, color, value, label }: { icon: IconName; color: string; value: number | string; label: string }) {
  return (
    <Card accent={color} style={s.stat}>
      <Ionicons name={icon} size={20} color={color} />
      <Text display style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  avatarPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  avatarChoice: { alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 7, minWidth: 66 },
  avatarChoiceSelected: { borderColor: colors.cyan, backgroundColor: alpha(colors.cyan, 0.12) },
  avatarChoiceLabel: { color: colors.text, fontSize: 11, fontWeight: '700' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topName: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  scroll: { gap: 16, paddingBottom: 130, paddingTop: 4 },

  hero: {
    height: 212,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.3),
    shadowColor: colors.cyan,
    shadowOpacity: 0.3,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  heroImgWrap: { position: 'absolute', right: -24, bottom: -16, width: 250, height: 250 },
  heroImg: { width: '100%', height: '100%' },
  heroFade: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '68%' },
  heroText: { flex: 1, padding: 20, justifyContent: 'center' },
  heroChips: { flexDirection: 'row', gap: 6, marginTop: 12 },

  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardIcon: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  modeSlide: { minHeight: 164, paddingVertical: 18, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.inset, alignItems: 'center', justifyContent: 'center', gap: 6 },
  modeDots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9, paddingTop: 1 },
  modeDot: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  modeDotActive: { backgroundColor: 'rgba(255,255,255,0.16)' },
  modeDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
  modeDotInnerActive: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FFFFFF' },
  mode: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.inset,
    alignItems: 'center',
    gap: 3,
  },
  modeIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  modeLabel: { color: colors.muted, fontWeight: '800', fontSize: 15 },
  modeSub: { color: colors.subtle, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  modeCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },

  codeInput: { fontFamily: 'Outfit_900Black', fontSize: 26, letterSpacing: 10, paddingVertical: 12 },

  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  stepNo: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  stepTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },

  profileHero: {
    alignItems: 'center',
    padding: 22,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: alpha(colors.gold, 0.35),
  },
  xpLabel: { color: colors.muted, fontSize: 11.5, fontWeight: '600' },
  stats: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 16, paddingHorizontal: 8 },
  statValue: { color: colors.text, fontSize: 26, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 2 },
  settingTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
});
