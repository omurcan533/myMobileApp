import React, { useEffect, useEffectEvent, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Pressable, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, View, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Avatar, Btn, Card, Chip, Eyebrow, Float, IconBtn, IconName, Input, Muted, ProgressBar, Reveal, Screen,
  SectionLabel, SwipeTabGroup, swipeTabIconScale, swipeTabTint, TabBar, TabItem, Tap, Text, Title, useToast,
} from '../components/ui';
import { api, type OpenRoom } from '../lib/api';
import { coalescedTask } from '../lib/coalescedTask';
import { NicknameStep, validNickname } from '../components/NicknameStep';
import { SafetyProfile } from '../components/SafetyProfile';
import { PrivacyInfo } from '../components/PrivacyInfo';
import type { DeletionResult } from '../lib/accountDeletion';
import { supabase } from '../lib/supabase';
import { art, avatarFor, AVATAR_OPTIONS, type AvatarId } from '../lib/art';
import { getProfile, levelOf, Profile } from '../lib/profile';
import { soundFx } from '../lib/soundEffects';
import { alpha, colors, gradients } from '../lib/theme';
import type { GameMode } from '../lib/types';
import { t, useLanguage, saveLanguage, translate, format } from '../lib/i18n';

export const GAME_TITLE = 'Ucube Atölyesi';

type Tab = 'play' | 'how' | 'profile';
export type HomeAppearance = 'normal' | 'simple';
type RoomAction = 'create' | 'join' | 'rooms';

export const HOME_APPEARANCE_KEY = 'homeAppearance';
export const readHomeAppearance = (value: string | null): HomeAppearance => value === 'normal' ? 'normal' : 'simple';
const ROOM_ACTIONS = [
  { key: 'create', label: 'roomTitle', icon: 'add-circle-outline', tint: '#A2EFD4' },
  { key: 'join', label: 'joinRoom', icon: 'log-in-outline', tint: '#AFE4FF' },
  { key: 'rooms', label: 'publicRooms', icon: 'earth-outline', tint: '#D6C4FF' },
] as const;
const TABS: TabItem<Tab>[] = [
  { key: 'play', label: 'Oyna', icon: 'game-controller-outline', iconActive: 'game-controller' },
  { key: 'how', label: 'Nasıl Oynanır', icon: 'book-outline', iconActive: 'book' },
  { key: 'profile', label: 'Profil', icon: 'person-outline', iconActive: 'person' },
];

const getSteps = (): { icon: IconName; color: string; title: string; text: string }[] => [
  { icon: 'people', color: colors.cyan, title: translate("Takımlara ayrılın"), text: translate("Oda kodunu paylaş. Oyun başlayınca herkes adil şekilde iki takıma bölünür; her takımın bir Kaptanı olur.") },
  { icon: 'help-circle', color: colors.yellow, title: translate("Soruları çöz, parça kazan"), text: translate("Harf bulmacası ya da bilmece… İlk doğru cevaplayan takım yapı parçasını alır. Yanlış cevap parçayı rakibe verir!") },
  { icon: 'flash', color: colors.mint, title: translate("Devre arası mini oyun"), text: translate("Refleks, hafıza veya denge oyununu kazanan takım bonus parça ve +2 puan alır.") },
  { icon: 'construct', color: colors.magenta, title: translate("Yaratığını inşa et"), text: translate("Takımın Mimarı toplanan parçaları tuvale dizer. Diğerleri emoji ve sesli yönlendirmeyle destek olur.") },
  { icon: 'trophy', color: colors.gold, title: translate("Gizli oylama"), text: translate("En çılgın yaratığa gizlice oy ver. Resmi şampiyon puanla, en komik tasarım oylarla belirlenir.") },
];

export function HomeScreen({ onEnter, avatarId, onAvatarChange, onAccountDeleted }: { onEnter: (roomId: string) => void; avatarId: AvatarId; onAvatarChange: (id: AvatarId) => void; onAccountDeleted: (result: DeletionResult) => void }) {
  const language = useLanguage();
  const tabs: TabItem<Tab>[] = TABS.map((tab) => ({ ...tab, label: tab.key === 'play' ? t('play') : tab.key === 'how' ? t('how') : t('profile') }));
  const [tab, setTab] = useState<Tab>('play');
  const [appearance, setAppearance] = useState<HomeAppearance | null>(null);
  const [roomAction, setRoomAction] = useState<RoomAction | null>('rooms');
  const [savingAppearance, setSavingAppearance] = useState(false);
  const appearanceWrite = useRef(false);
  const simple = appearance === 'simple';
  const [nick, setNick] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);
  const [nameRequired, setNameRequired] = useState(false);
  const pendingEntry = useRef<{ kind: 'create' | 'join'; code: string } | null>(null);
  const [code, setCode] = useState('');
  const [openRooms, setOpenRooms] = useState<OpenRoom[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [mode, setMode] = useState<GameMode>('custom');
  const [modeIndex, setModeIndex] = useState(3);
  const { width: windowWidth } = useWindowDimensions();
  const [modeCarouselWidth, setModeCarouselWidth] = useState(0);
  const modeSlideWidth = modeCarouselWidth || Math.max(220, windowWidth - 72);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const joiningRef = useRef(false);
  const [profile, setProfile] = useState<Profile>({ games: 0, wins: 0, lastRoom: null });
  const [sound, setSound] = useState(soundFx.isEnabled());
  const { toast, show } = useToast();
  const scrollRef = useRef<ScrollView>(null);
  const modeCarouselRef = useRef<ScrollView>(null);

  const joinFormRef = useRef<View>(null);
  const joinFormVisible = !simple || roomAction === 'join';

  useEffect(() => {
    if (Platform.OS !== 'web' || !joinFormVisible || tab !== 'play' || appearance === null || !nameLoaded || nameRequired) return;
    const scroll = scrollRef.current?.getScrollableNode();
    const form = joinFormRef.current;
    if (!scroll || !form || !(scroll instanceof HTMLElement) || !(form instanceof HTMLElement)) return;
    const viewport = window.visualViewport;
    let frame = 0;

    const revealForm = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.activeElement;
        if (!(input instanceof HTMLInputElement) || !form.contains(input)) return;
        const scrollBounds = scroll.getBoundingClientRect();
        const viewportTop = viewport?.offsetTop ?? 0;
        const top = Math.max(scrollBounds.top, viewportTop) + 12;
        const bottom = Math.min(scrollBounds.bottom, viewportTop + (viewport?.height ?? window.innerHeight)) - 12;
        if (bottom <= top) return;

        const formBounds = form.getBoundingClientRect();
        // Prefer showing both the code field and the join button when they fit.
        const bounds = formBounds.height <= bottom - top ? formBounds : input.getBoundingClientRect();
        if (bounds.bottom > bottom) scroll.scrollTop += Math.ceil(bounds.bottom - bottom);
        else if (bounds.top < top) scroll.scrollTop -= Math.ceil(top - bounds.top);
      });
    };

    // Safari can resize the visible viewport before the React scroll area relayouts.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(revealForm);
    observer?.observe(scroll);
    form.addEventListener('focusin', revealForm);
    viewport?.addEventListener('resize', revealForm);
    viewport?.addEventListener('scroll', revealForm);
    window.addEventListener('resize', revealForm);
    revealForm();

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      form.removeEventListener('focusin', revealForm);
      viewport?.removeEventListener('resize', revealForm);
      viewport?.removeEventListener('scroll', revealForm);
      window.removeEventListener('resize', revealForm);
    };
  }, [appearance, joinFormVisible, nameLoaded, nameRequired, tab]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem('nickname').then(value => {
      if (!active) return;
      const saved = value?.trim() ?? '';
      if (validNickname(saved)) setNick(saved);
      setNameRequired(!validNickname(saved));
    }).catch(() => { if (active) setNameRequired(true); })
      .finally(() => { if (active) setNameLoaded(true); });
    AsyncStorage.getItem(HOME_APPEARANCE_KEY).catch(() => null).then(value => {
      if (active) setAppearance(readHomeAppearance(value));
    });
    getProfile().then(setProfile);
    return () => { active = false; };
  }, []);

  // Açık odaları ilk yüklemede al ve oda/oyuncu değişikliklerini gerçek zamanlı izle.
  useEffect(() => {
    let active = true;
    const refreshRooms = async () => {
      try {
        const rooms = await api.openRooms();
        if (active) setOpenRooms(rooms);
      } catch (error) {
        console.warn(translate("Açık odalar yüklenemedi:"), error);
      } finally {
        if (active) setRoomsLoading(false);
      }
    };
    // Realtime events and polling may arrive together. Serialize refreshes so
    // an older request cannot overwrite a newer room/player snapshot.
    const loadRooms = coalescedTask(refreshRooms, () => active);
    void loadRooms();
    const channel = supabase
      .channel('public-open-rooms')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => { void loadRooms(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { void loadRooms(); })
      .subscribe();
    // Public room metadata is also refreshed for visitors who are not room members.
    const refreshInterval = setInterval(() => { void loadRooms(); }, 5000);
    const appState = AppState.addEventListener('change', state => {
      if (state === 'active') void loadRooms();
    });
    return () => {
      appState.remove();
      active = false;
      clearInterval(refreshInterval);
      void supabase.removeChannel(channel);
    };
  }, []);

  // Only realign after a layout change; ordinary swipes and button animations
  // keep control of scrolling and preserve the player's selected mode.
  const alignCarousel = useEffectEvent((width: number) => {
    modeCarouselRef.current?.scrollTo({ x: width * modeIndex, animated: false });
  });
  useEffect(() => {
    if (modeCarouselWidth > 0) alignCarousel(modeCarouselWidth);
  }, [modeCarouselWidth, tab, appearance]);

  const lvl = levelOf(profile);
  const displayName = nick.trim() || t('newPlayer');

  const run = async (kind: 'create' | 'join', selectedRoomCode?: string, confirmedName?: string) => {
    if (joiningRef.current) return;
    const name = (confirmedName ?? nick).trim();
    if (!nameLoaded || !validNickname(name)) {
      pendingEntry.current = { kind, code: selectedRoomCode ?? code };
      setNameRequired(true);
      return;
    }
    const joinCode = (selectedRoomCode ?? code).trim();
    if (kind === 'join' && joinCode.length < 4) return show(t('roomCodeRequired'), 'error');
    joiningRef.current = true;
    setBusy(kind);
    try {
      await AsyncStorage.setItem('nickname', name);
      const res = kind === 'create' ? await api.createRoom(name, mode) : await api.joinRoom(joinCode, name);
      onEnter(res.room_id);
    } catch (e) {
      show((e as Error).message, 'error');
    } finally {
      joiningRef.current = false;
      setBusy(null);
    }
  };

  const toggleSound = (v: boolean) => {
    soundFx.setEnabled(v);
    setSound(v);
    AsyncStorage.setItem('soundEnabled', String(v)).catch(console.warn);
  };

  const changeAppearance = async (next: HomeAppearance) => {
    if (appearance === next || appearanceWrite.current) return;
    appearanceWrite.current = true;
    setSavingAppearance(true);
    try {
      await AsyncStorage.setItem(HOME_APPEARANCE_KEY, next);
      if (next === 'simple') setRoomAction('rooms');
      setAppearance(next);
    } catch {
      show(translate("Görünüm tercihi kaydedilemedi."), 'error');
    } finally {
      appearanceWrite.current = false;
      setSavingAppearance(false);
    }
  };

  if (!nameLoaded || appearance === null) return <Screen><View style={{flex:1,justifyContent:'center',alignItems:'center'}}>
    <Muted>{language==='en'?'Preparing your player profile…':translate("Oyuncu profilin hazırlanıyor…")}</Muted>
  </View></Screen>;

  if (nameRequired) return <NicknameStep initialValue={nick} avatarId={avatarId} onContinue={async name => {
    await AsyncStorage.setItem('nickname', name);
    setNick(name);
    setNameRequired(false);
    const pending = pendingEntry.current;
    pendingEntry.current = null;
    if (pending) void run(pending.kind, pending.code, name);
  }}/>;

  const modeOptions = [
    ['quick', 'flash', translate("Hızlı"), translate("8 Soru • ~5 dk")],
    ['standard', 'trophy', translate("Standart"), translate("14 Soru • ~10 dk")],
    ['long', 'flame', translate("Epik"), translate("20 Soru • ~18 dk")],
    ['custom', 'options', translate("Özel"), translate("Oyunları sen seç")],
  ] as const;

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* ================= ÜST BAR ================= */}
        <View style={s.topBar}>
          <Avatar source={avatarFor(displayName, avatarId)} size={52} ring={colors.cyan} />
          <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
            <View style={s.nameRow}>
              <Text numberOfLines={1} display style={s.topName}>{displayName}</Text>
              <Chip label={`LVL ${lvl.level}`} color={colors.gold} size="sm" icon="flash" />
            </View>
            <ProgressBar pct={lvl.progress} colors={gradients.gold} height={8} />
          </View>
          <View style={s.topActions}>
            <IconBtn
              icon={simple ? 'albums-outline' : 'apps-outline'}
              accessibilityLabel={simple ? translate("Normal görünüme geç") : translate("Basit görünüme geç")}
              active={simple}
              disabled={savingAppearance}
              onPress={() => { void changeAppearance(simple ? 'normal' : 'simple'); }}
            />
            <IconBtn
              icon={sound ? 'volume-high' : 'volume-mute'}
              onPress={() => toggleSound(!sound)}
              active={sound}
            />
          </View>
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
                    <Eyebrow live color={colors.mint} dot={colors.mint}>{t('gameArena')}</Eyebrow>
                    <Title size={31} style={{ marginTop: 8 }}>{translate(GAME_TITLE)}</Title>
                    <Muted style={{ marginTop: 6, maxWidth: 190 }}>
                      {t('heroDescription')}
                    </Muted>
                    <View style={s.heroChips}>
                      <Chip icon="people" label={t('teams')} color={colors.cyan} size="sm" />
                      <Chip icon="time" label={translate("5-20 dk")} color={colors.magenta} size="sm" />
                    </View>
                  </View>
                </View>
              </Reveal>

              {/* ================= TAKMA AD ================= */}
              {!simple && <Reveal delay={80}>
                <Card style={{ gap: 12 }}>
                  <Eyebrow icon="person-circle" color={colors.muted}>{t('nickname')}</Eyebrow>
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
                    placeholder={translate("örn. Çorap Avcısı")}
                    maxLength={20}
                  />
                </Card>
              </Reveal>}

              <View style={simple && s.dock}>
                {simple && (
                  <SwipeTabGroup axis="vertical" style={s.rail} testID="simple-room-rail" onSwipe={index => {
                    const action = ROOM_ACTIONS[index];
                    if (action && action.key !== roomAction) {
                      soundFx.click();
                      setRoomAction(action.key);
                    }
                  }}>
                    {(recordLayout, preview) => <>
                    <View pointerEvents="none" style={s.railGlass}>
                      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
                      <LinearGradient
                        colors={['rgba(174, 198, 234, 0.17)', 'rgba(69, 96, 142, 0.06)', 'rgba(9, 16, 33, 0.26)']}
                        locations={[0, 0.43, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    {preview && <RailLens top={preview.top} height={preview.height} />}
                    {ROOM_ACTIONS.map(({ key, icon, label, tint }, index) => {
                      const selected = roomAction === key;
                      const iconColor = preview ? swipeTabTint(colors.textSoft, tint, preview.position, index) : selected ? tint : colors.textSoft;
                      return (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityLabel={t(label)}
                          aria-expanded={selected}
                          onLayout={event => recordLayout(index, event)}
                          onPress={() => {
                            soundFx.click();
                            setRoomAction(current => current === key ? null : key);
                          }}
                          style={[s.railTab, selected && s.railTabSelected]}
                        >
                          {({ pressed }) => {
                            const focus = preview?.position ?? (pressed ? index : null);
                            return <>
                              {selected && !preview && <RailLens />}
                              <Ionicons
                                name={icon}
                                size={20}
                                color={pressed && !preview ? tint : iconColor}
                                style={{ transform: [{ scale: swipeTabIconScale(focus, index) }] }}
                              />
                              <Text style={[s.railLabel, { color: iconColor }]}>{t(label)}</Text>
                            </>;
                          }}
                        </Pressable>
                      );
                    })}
                    </>}
                  </SwipeTabGroup>
                )}
                <View style={simple ? s.dockContent : s.normalContent}>
                  {simple && roomAction === null && (
                    <View style={s.dockIdle} accessible={false} importantForAccessibility="no-hide-descendants">
                      <View style={[s.dockOrbit, s.dockOrbitOuter]} />
                      <View style={s.dockOrbit} />
                      <Ionicons name="game-controller-outline" size={40} color="#A4B7D8" />
                    </View>
                  )}
              {/* ================= ODA KUR ================= */}
              {(!simple || roomAction === 'create') && <HomeRoomPanel simple={simple} delay={160}>
                <Card accent={simple ? undefined : colors.mint} style={[{ gap: 14 }, simple && s.dockPanel]}>
                  <View style={[s.cardHead, simple && s.compactCardHead]}>
                    <View style={[s.cardIcon, simple && s.compactCardIcon, { backgroundColor: alpha(colors.mint, 0.14), borderColor: alpha(colors.mint, 0.4) }]}>
                      <Ionicons name="add-circle" size={22} color={colors.mint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={simple ? 18 : 20}>{t('roomTitle')}</Title>
                      <Muted>{t('roomDescription')}</Muted>
                    </View>
                  </View>
                  {simple ? (
                    <View style={s.modeGrid}>
                      {modeOptions.map(([key, icon, label, description], index) => (
                        <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label}. ${description}`} aria-selected={mode === key}
                          onPress={() => { soundFx.click(); setMode(key); setModeIndex(index); }}
                          style={[s.compactMode, mode === key && s.compactModeSelected]}>
                          <Ionicons name={icon} size={16} color={mode === key ? ROOM_ACTIONS[0].tint : colors.muted} />
                          <Text style={s.compactModeLabel}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : <>
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
                    {modeOptions.map(([m, icon, label, sub], index) => {
                      const on = mode === m;
                      const accent = '#DBE5F5';
                      return (
                        <View key={m} style={{ width: modeSlideWidth, paddingHorizontal: 2 }}>
                          <Tap
                            color={alpha(accent, 0.12)}
                            accent={accent}
                            scaleTo={0.98}
                            onPress={() => { soundFx.click(); setMode(m); setModeIndex(index); }}
                            style={[s.modeSlide, on && s.frostedModeSelected]}
                          >
                            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                              <Image source={art.bg} blurRadius={Platform.OS === 'android' ? 6 : 12} resizeMode="cover" style={s.frostedModeBackdrop} accessible={false} />
                              <LinearGradient colors={['rgba(17, 25, 44, 0.38)', 'rgba(8, 13, 27, 0.76)']} style={StyleSheet.absoluteFill} />
                            </View>
                            <View style={[s.modeIcon, { width: 54, height: 54, borderRadius: 27, backgroundColor: alpha(accent, 0.1) }, s.frostedModeIcon]}>
                              <Ionicons name={icon} size={28} color={on ? accent : colors.muted} />
                            </View>
                            <Text display style={[s.modeLabel, { fontSize: 20 }, on && { color: colors.text }]}>{label}</Text>
                            <Text style={[s.modeSub, { fontSize: 12 }, on && { color: accent }]}>{sub}</Text>
                            {on && (
                              <View style={[s.modeCheck, { backgroundColor: 'rgba(219, 229, 245, 0.14)' }, s.frostedModeIcon]}>
                                <Ionicons name="checkmark" size={12} color={accent} />
                              </View>
                            )}
                            <Text style={{ color: "#B5C3D8", fontSize: 11, marginTop: 8 }}>{translate("Yana kaydırarak modları keşfet")}</Text>
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
                  </>}
                  <Btn size={simple ? "md" : "lg"} title={t('roomCreate')} tone="success" icon="rocket" loading={busy === 'create'} onPress={() => run('create')} />
                </Card>
              </HomeRoomPanel>}

              {/* ================= ODAYA KATIL ================= */}
              {joinFormVisible && <HomeRoomPanel simple={simple} delay={240}>
                <Card accent={simple ? undefined : colors.cyan} style={[{ gap: 14 }, simple && s.dockPanel]}>
                  <View style={[s.cardHead, simple && s.compactCardHead]}>
                    <View style={[s.cardIcon, simple && s.compactCardIcon, { backgroundColor: alpha(colors.cyan, 0.14), borderColor: alpha(colors.cyan, 0.4) }]}>
                      <Ionicons name="enter" size={22} color={colors.cyan} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={simple ? 18 : 20}>{t('joinRoom')}</Title>
                      <Muted>{t('joinDescription')}</Muted>
                    </View>
                  </View>
                  <View ref={joinFormRef} style={s.joinForm}>
                    <Input
                      center
                      value={code}
                      onChangeText={(t) => setCode(t.toUpperCase())}
                      placeholder={t('roomCode')}
                      autoCapitalize="characters"
                      maxLength={5}
                      style={[s.codeInput, simple && s.compactCodeInput]}
                    />
                    <Btn size={simple ? "md" : "lg"} title={t('roomJoin')} tone="primary" icon="log-in" loading={busy === 'join'} onPress={() => run('join')} />
                  </View>
                </Card>
              </HomeRoomPanel>}

              {/* ================= AÇIK ODALAR ================= */}
              {(!simple || roomAction === 'rooms') && <HomeRoomPanel simple={simple} delay={280}>
                <Card accent={simple ? undefined : colors.mint} style={[{ gap: 14 }, simple && s.dockPanel]}>
                  <View style={[s.cardHead, simple && s.compactCardHead]}>
                    <View style={[s.cardIcon, simple && s.compactCardIcon, { backgroundColor: alpha(colors.mint, 0.14), borderColor: alpha(colors.mint, 0.4) }]}>
                      <Ionicons name="earth" size={22} color={colors.mint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Title size={simple ? 18 : 20}>{t('publicRooms')}</Title>
                      <Muted>{t('publicDescription')}</Muted>
                    </View>
                    <View style={{ minWidth: 28, height: 28, borderRadius: 14, backgroundColor: alpha(colors.mint, 0.14), alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
                      <Text style={{ color: colors.mint, fontWeight: '700', fontSize: 12 }}>{openRooms.length}</Text>
                    </View>
                  </View>
                  {roomsLoading ? (
                    <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                      <Muted>{t('roomsLoading')}</Muted>
                    </View>
                  ) : openRooms.length === 0 ? (
                    <View style={{ paddingVertical: 12, alignItems: 'center', gap: 5 }}>
                      <Ionicons name="game-controller-outline" size={28} color={colors.muted} />
                      <Text style={{ color: colors.textSoft, fontWeight: '600' }}>{t('noRooms')}</Text>
                      <Muted>{t('noRoomsHint')}</Muted>
                    </View>
                  ) : openRooms.map((room) => {
                    const waiting = room.phase === 'lobby';
                    const full = room.player_count >= 12;
                    const modeLabel: Record<string, string> = { quick: translate("Hızlı"), standard: translate("Standart"), long: translate("Epik"), custom: translate("Özel") };
                    return (
                      <View key={room.code} style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inset, padding: 12, gap: 10 }}>
                        <View style={[s.publicRoomHeader, simple && s.compactPublicRoomHeader]}>
                          {!simple && <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: alpha(waiting ? colors.mint : colors.violet, 0.14), alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name={waiting ? 'people' : 'game-controller'} size={20} color={waiting ? colors.mint : colors.violet} />
                          </View>}
                          <View style={[{ gap: 3 }, !simple && { flex: 1 }]}>
                            <Text display style={{ fontSize: 15, color: colors.text, fontWeight: '700' }}>{room.host_nickname}{translate("'ın Odası")}</Text>
                            <Muted>{modeLabel[room.mode] ?? room.mode} {translate('mod')} · {room.player_count}/12 {translate('oyuncu')} · {room.game_language === 'en' ? 'English' : 'Türkçe'}</Muted>
                          </View>
                          <Chip label={waiting ? translate("Bekliyor") : translate("Devam ediyor")} color={waiting ? colors.mint : colors.violet} size="sm" />
                        </View>
                        <Btn
                          title={waiting && !full ? translate("Katıl") : full && waiting ? translate("Oda dolu") : translate("Oyun başladı")}
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
              </HomeRoomPanel>}
                </View>
              </View>
            </>
          )}

          {tab === 'how' && (
            <>
              <Reveal>
                <View style={{ gap: 4 }}>
                  <Eyebrow color={colors.cyan} dot={colors.cyan}>{translate("Oyun rehberi")}</Eyebrow>
                  <Title size={28}>{translate("Nasıl Oynanır?")}</Title>
                  <Muted>{translate("5 adımda ucube yaratık inşa et, rakibi yen.")}</Muted>
                </View>
              </Reveal>
              {getSteps().map((st, i) => (
                <Reveal key={st.title} delay={80 + i * 70}>
                  <Card accent={st.color} style={s.step}>
                    <LinearGradient
                      colors={[alpha(st.color, 0.9), alpha(st.color, 0.45)]}
                      style={s.stepIcon}
                    >
                      <Ionicons name={st.icon} size={24} color="#0A1020" />
                    </LinearGradient>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[s.stepNo, { color: st.color }]}>{translate("ADIM")} {i + 1}</Text>
                      <Text display style={s.stepTitle}>{st.title}</Text>
                      <Muted>{st.text}</Muted>
                    </View>
                  </Card>
                </Reveal>
              ))}
              <Btn title={translate("Hemen Oyna")} icon="game-controller" tone="gold" onPress={() => setTab('play')} />
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
                  <View style={s.profileName}>
                    <Eyebrow color={colors.textSoft}>{t('nickname')}</Eyebrow>
                    <Input
                      icon="pencil"
                      accessibilityLabel={t('nickname')}
                      value={nick}
                      onChangeText={setNick}
                      onBlur={() => {
                        const name = nick.trim();
                        if (validNickname(name)) void AsyncStorage.setItem('nickname', name).catch(console.warn);
                      }}
                      placeholder={translate("Takma adın")}
                      maxLength={20}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <Chip label={format("Seviye {0}", lvl.level)} icon="flash" color={colors.gold} />
                    <Chip label={`${lvl.xp} XP`} icon="sparkles" color={colors.cyan} />
                  </View>
                  <View style={{ alignSelf: 'stretch', marginTop: 18, gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={s.xpLabel}>{translate("Sonraki seviye")}</Text>
                      <Text style={s.xpLabel}>{Math.round(lvl.progress * 100)}%</Text>
                    </View>
                    <ProgressBar pct={lvl.progress} colors={gradients.gold} height={12} />
                  </View>
                </View>
              </Reveal>

              <Reveal delay={90}>
                <View style={s.stats}>
                  <StatTile icon="game-controller" color={colors.cyan} value={profile.games} label={translate("Oynanan")} />
                  <StatTile icon="trophy" color={colors.gold} value={profile.wins} label={translate("Galibiyet")} />
                  <StatTile
                    icon="stats-chart"
                    color={colors.mint}
                    value={profile.games ? `%${Math.round((profile.wins / profile.games) * 100)}` : '—'}
                    label={translate("Kazanma")}
                  />
                </View>
              </Reveal>

              <Reveal delay={170}>
                <Card style={{ gap: 14 }}>
                  <SectionLabel>{translate("Hesap")}</SectionLabel>
                  <Muted>{translate("Avatarını değiştir")}</Muted>
                  <View style={s.avatarPicker}>
                    {AVATAR_OPTIONS.map((option) => (
                      <Tap key={option.id} accessibilityState={{ selected: avatarId === option.id }} onPress={() => onAvatarChange(option.id)} style={[s.avatarChoice, avatarId === option.id && s.avatarChoiceSelected]}>
                        <Avatar source={option.source} size={48} ring={avatarId === option.id ? colors.cyan : colors.borderLight} />
                        <Text style={s.avatarChoiceLabel}>{translate(option.label)}</Text>
                        {avatarId === option.id && <Ionicons name="checkmark-circle" size={16} color={colors.cyan} />}
                      </Tap>
                    ))}
                  </View>
                  <SectionLabel>{translate("Ayarlar")}</SectionLabel>
                  <View style={{ gap: 8 }}>
                    <Text style={s.settingTitle}>{t('language')}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['tr', 'en'] as const).map((option) => (
                        <Btn key={option} title={option === 'tr' ? 'Türkçe' : 'English'} tone={language === option ? 'primary' : 'ghost'} onPress={() => { void saveLanguage(option).catch(console.warn); }} />
                      ))}
                    </View>
                  </View>
                  <View style={s.appearanceSetting}>
                    <Text style={s.settingTitle}>{translate("Ana ekran görünümü")}</Text>
                    <View style={s.appearanceOptions}>
                      {(['normal', 'simple'] as const).map(option => (
                        <Pressable
                          key={option}
                          accessibilityRole="button"
                          aria-selected={appearance === option}
                          disabled={savingAppearance}
                          onPress={() => { void changeAppearance(option); }}
                          style={[s.appearanceOption, appearance === option && s.appearanceOptionSelected]}
                        >
                          <Ionicons name={option === 'normal' ? 'apps-outline' : 'albums-outline'} size={17} color={appearance === option ? '#AFE4FF' : colors.muted} />
                          <Text style={s.appearanceLabel}>{option === 'normal' ? translate("Normal") : translate("Basit")}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Muted>{appearance === 'simple' ? translate("Oda panellerini sağdaki sekmelerden aç.") : translate("Oda panellerini ana ekranda alt alta göster.")}</Muted>
                  </View>
                  <View style={s.settingRow}>
                    <View style={[s.cardIcon, { backgroundColor: alpha(colors.violet, 0.14), borderColor: alpha(colors.violet, 0.4) }]}>
                      <Ionicons name="musical-notes" size={20} color={colors.violet} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.settingTitle}>{t('soundEffects')}</Text>
                      <Muted>{t('soundDescription')}</Muted>
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
              <SafetyProfile />
              <PrivacyInfo collapsible onAccountDeleted={onAccountDeleted} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <TabBar items={tabs} active={tab} onChange={(k) => {
        if (k === 'profile') {
          scrollRef.current?.scrollTo({ y: 0, animated: false });
          void getProfile().then(setProfile);
        }
        setTab(k);
      }} />
      {toast}
    </Screen>
  );
}

function RailLens({ top, height }: { top?: number; height?: number }) {
  const moving = top !== undefined;
  return (
    <View
      pointerEvents="none"
      testID={moving ? 'room-tab-highlight' : undefined}
      style={[s.railLens, moving && { left: -4, right: 4, top, bottom: undefined, height }]}
    >
      <LinearGradient
        colors={['rgba(191, 216, 249, 0.27)', 'rgba(124, 149, 188, 0.08)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function HomeRoomPanel({ simple, delay, children }: { simple: boolean; delay: number; children: React.ReactNode }) {
  return simple ? <DockPanel>{children}</DockPanel> : <Reveal delay={delay}>{children}</Reveal>;
}

function DockPanel({ children }: { children: React.ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    let active = true;
    const animate = (reduced: boolean) => {
      if (!active) return;
      if (reduced) progress.setValue(1);
      else Animated.timing(progress, {
        toValue: 1,
        duration: 235,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };
    void AccessibilityInfo.isReduceMotionEnabled().then(animate, () => animate(true));
    return () => { active = false; progress.stopAnimation(); };
  }, [progress]);

  return <Animated.View style={{
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] }),
    transform: [
      { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
      { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] }) },
    ],
  }}>{children}</Animated.View>;
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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topName: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  scroll: { gap: 16, paddingBottom: 130, paddingTop: 4 },

  normalContent: { gap: 16 },
  dock: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 11 },
  dockContent: { flex: 1, minWidth: 0 },
  rail: { width: 82, padding: 4, marginRight: -4, marginTop: 9, borderRadius: 26, shadowColor: '#020510', shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 5 } },
  railGlass: { ...StyleSheet.absoluteFill, borderRadius: 26, overflow: 'hidden', backgroundColor: 'rgba(18, 28, 48, 0.82)', borderWidth: 1, borderColor: 'rgba(198, 218, 250, 0.21)' },
  railTab: { minHeight: 69, paddingHorizontal: 6, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', gap: 5 },
  railTabSelected: { marginLeft: -8, paddingLeft: 9 },
  railLens: { ...StyleSheet.absoluteFill, borderRadius: 22, overflow: 'hidden', backgroundColor: 'rgba(32, 49, 75, 0.81)' },
  railLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', color: colors.textSoft },
  dockIdle: { minHeight: 232, alignItems: 'center', justifyContent: 'center' },
  dockOrbit: { position: 'absolute', width: 118, height: 118, borderRadius: 36, borderWidth: 1, borderColor: '#7085AD45', backgroundColor: '#1C2A4655', transform: [{ rotate: '27deg' }] },
  dockOrbitOuter: { width: 146, height: 146, borderColor: '#7085AD26', backgroundColor: 'transparent', transform: [{ rotate: '-18deg' }] },
  dockPanel: { backgroundColor: '#152137', borderColor: '#435371', padding: 12, borderRadius: 21 },
  compactCardHead: { gap: 8, alignItems: 'flex-start' },
  compactCardIcon: { width: 32, height: 32, borderRadius: 16 },
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6 },
  compactMode: { width: '48%', minHeight: 46, paddingHorizontal: 3, paddingVertical: 5, gap: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#3B4A65', backgroundColor: '#132038' },
  compactModeSelected: { borderColor: '#A2EFD4', backgroundColor: '#23364A' },
  compactModeLabel: { fontSize: 11, textAlign: 'center', color: colors.textSoft },
  compactCodeInput: { fontSize: 19, letterSpacing: 3 },
  publicRoomHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactPublicRoomHeader: { flexDirection: 'column', alignItems: 'flex-start', gap: 6 },
  appearanceSetting: { gap: 8 },
  appearanceOptions: { flexDirection: 'row', gap: 8 },
  appearanceOption: { minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 13, backgroundColor: colors.inset },
  appearanceOptionSelected: { borderColor: '#AFE4FF88', backgroundColor: '#213451' },
  appearanceLabel: { color: colors.textSoft, flexShrink: 1, textAlign: 'center' },

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

  modeSlide: { minHeight: 164, paddingVertical: 18, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 6, overflow: 'hidden', backgroundColor: '#151F32', borderWidth: 1, borderColor: 'rgba(219, 229, 245, 0.18)' },
  frostedModeSelected: { borderColor: 'rgba(219, 229, 245, 0.36)' },
  frostedModeBackdrop: { width: '100%', height: '100%', transform: [{ scale: 1.12 }] },
  frostedModeIcon: { borderWidth: 1, borderColor: 'rgba(219, 229, 245, 0.22)' },
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

  joinForm: { gap: 14 },
  codeInput: { fontFamily: 'Outfit_900Black', fontSize: 26, letterSpacing: 10, paddingVertical: 12 },

  step: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  stepIcon: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  stepNo: { fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  stepTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },

  profileName: { alignSelf: 'stretch', marginTop: 14, gap: 7 },
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
