import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, Float, Muted, Screen, Text, Title } from './components/ui';
import { AvatarSelect } from './components/AvatarSelect';
import { PartyBreak } from './components/PartyBreak';
import { AVATAR_OPTIONS, AvatarId } from './lib/art';
import { useGameDriver } from './hooks/useGameDriver';
import { useRoom } from './hooks/useRoom';
import { ensureAnonymousSession, supabase } from './lib/supabase';
import { api } from './lib/api';
import { soundFx } from './lib/soundEffects';
import { syncServerTime } from './lib/serverTime';
import { art } from './lib/art';
import { alpha, colors } from './lib/theme';
import type { Ctx, Piece } from './lib/types';
import { BuildingScreen } from './screens/Building';
import { HomeScreen } from './screens/Home';
import { LobbyScreen } from './screens/Lobby';
import { MinigameScreen } from './screens/Minigame';
import { QuestionScreen } from './screens/Question';
import { ResultsScreen } from './screens/Results';
import { VotingScreen } from './screens/Voting';
import { TeamRevealScreen } from './screens/TeamReveal';

const ROOM_KEY = 'roomId';

/** Yükleme / bağlanma ekranı: süzülen maskot + parlayan halka. */
function Loading({ text }: { text: string }) {
  return (
    <Screen>
      <View style={s.center}>
        <Float amount={10}>
          <View style={s.mascotRing}>
            <Image source={art.fox} style={s.mascot} resizeMode="cover" />
          </View>
        </Float>
        <ActivityIndicator color={colors.cyan} size="small" style={{ marginTop: 22 }} />
        <Text style={s.load}>{text}</Text>
      </View>
    </Screen>
  );
}

function RoomView({ roomId, userId, catalog, onLeave }: { roomId: string; userId: string; catalog: Record<string, Piece>; onLeave: () => void }) {
  const { data, gone } = useRoom(roomId);
  const me = data?.players.find((p) => p.user_id === userId);
  useGameDriver(data, me?.id);
  useEffect(()=>{
    if (!data || !me?.is_host || !data.players.some(p=>(p as any).is_bot)) return;
    if (data.room.phase!=='team_reveal' && data.room.phase!=='minigame') return;
    let running=false;
    const advance=async()=>{if(running)return;running=true;try{await api.advanceTestBots(roomId);await api.botSurvivorStep(roomId);}catch(e){console.warn('Test bot action:',e);}finally{running=false;}};
    advance();const timer=setInterval(advance,1800);return()=>clearInterval(timer);
  },[roomId,me?.is_host,data?.room.phase,data?.players.some(p=>(p as any).is_bot)]);
  const exitRoom = useCallback(async () => {
    await api.leaveRoom(roomId);
    onLeave();
  }, [roomId, onLeave]);

  useEffect(() => {
    if (gone) { onLeave(); return; }
    if (data && !me) {
      onLeave();
      Alert.alert('Odadan Çıkarıldın', 'Oda kurucusu seni bekleme odasından çıkardı.');
    }
  }, [gone, data, me, onLeave]);

  if (!data || !me) {
    return <Loading text="Odaya bağlanılıyor…" />;
  }
  const ctx: Ctx = { data, me, catalog, onLeave, exitRoom };

  const withBreak=(screen:React.ReactNode)=><View style={{flex:1}}>{screen}{data.room.phase!=='lobby'&&data.room.phase!=='results'&&<View pointerEvents="box-none" style={{position:'absolute',top:8,right:12,left:12,maxHeight:'70%'}}><PartyBreak roomId={data.room.id} players={data.players} myId={me.id} isHost={me.is_host} canStart={data.room.phase==='minigame'&&data.minigames.some(m=>m.status==='done')} autoKey={data.room.phase==='building' ? data.minigames.filter(m=>m.status==='done').slice(-1)[0]?.id ?? null : null} /></View>}</View>;
  switch (data.room.phase) {
    case 'lobby': return <LobbyScreen ctx={ctx} />;
    case 'team_reveal':
      return data.players.every((player) => player.team_side !== null)
        ? <TeamRevealScreen ctx={ctx} />
        : <Loading text="Takımlar belirleniyor…" />;
    case 'question': return withBreak(<QuestionScreen ctx={ctx} />);
    case 'minigame': return withBreak(<MinigameScreen ctx={ctx} />);
    case 'building': return withBreak(<BuildingScreen ctx={ctx} />);
    case 'voting': return withBreak(<VotingScreen ctx={ctx} />);
    case 'results': return <ResultsScreen ctx={ctx} />;
  }
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold,
    Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black,
  });
  const [userId, setUserId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Record<string, Piece>>({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [avatarId, setAvatarId] = useState<AvatarId>('fox');
  const [avatarChosen, setAvatarChosen] = useState(false);

  const boot = useCallback(async () => {
    setError(null);
    try {
      const [user] = await Promise.all([ensureAnonymousSession(), syncServerTime()]);
      const [pieces, saved] = await Promise.all([supabase.from('pieces').select('*'), AsyncStorage.getItem(ROOM_KEY)]);
      setCatalog(Object.fromEntries(((pieces.data ?? []) as Piece[]).map((p) => [p.id, p])));
      const soundEnabled = await AsyncStorage.getItem('soundEnabled');
      if (soundEnabled !== null) soundFx.setEnabled(soundEnabled === 'true');
      const savedAvatar = await AsyncStorage.getItem('avatarId');
      if (AVATAR_OPTIONS.some((a) => a.id === savedAvatar)) setAvatarId(savedAvatar as AvatarId);
      setUserId(user.id);
      if (saved) setRoomId(saved);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  // Mobil web (Safari/Chrome) için rubberband, klavye kayması ve beyaz boşluk koruması
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'app-mobile-web-fix';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          html, body {
            background-color: #050A14 !important;
            height: 100% !important;
            min-height: 100% !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: hidden !important;
            overscroll-behavior-y: none !important;
            -webkit-text-size-adjust: 100% !important;
          }
          #root {
            background-color: #050A14 !important;
            height: 100% !important;
            height: 100dvh !important;
            min-height: 100% !important;
            min-height: 100dvh !important;
            width: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
          }
          input, textarea, select {
            user-select: auto !important;
            -webkit-user-select: auto !important;
            outline: none !important;
            box-shadow: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          input:focus, textarea:focus, select:focus {
            outline: none !important;
            box-shadow: none !important;
          }
        `;
        document.head.appendChild(style);
      }

    }
  }, []);

  const enter = useCallback((id: string) => {
    AsyncStorage.setItem(ROOM_KEY, id);
    api.setPlayerAvatar(id, avatarId).catch((e) => console.warn('Avatar kaydedilemedi:', e));
    setRoomId(id);
  }, [avatarId]);
  const leave = useCallback(() => { AsyncStorage.removeItem(ROOM_KEY); setRoomId(null); }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      {error ? (
        <Screen>
          <View style={s.center}>
            <View style={s.errorIcon}><Ionicons name="cloud-offline" size={40} color={colors.red} /></View>
            <Title>Bağlanamadık</Title>
            <Muted style={{ textAlign: 'center', maxWidth: 300 }}>{error}</Muted>
            <Btn title="Tekrar dene" icon="refresh" onPress={boot} style={{ marginTop: 18, alignSelf: 'stretch' }} />
          </View>
        </Screen>
      ) : !ready || !userId ? (
        <Loading text="Arena hazırlanıyor…" />
      ) : roomId ? (
        <RoomView roomId={roomId} userId={userId} catalog={catalog} onLeave={leave} />
      ) : !avatarChosen ? (
        <AvatarSelect selected={avatarId} onSelect={(id) => { setAvatarId(id); AsyncStorage.setItem('avatarId', id); }} onContinue={() => setAvatarChosen(true)} />
      ) : (
        <HomeScreen onEnter={enter} avatarId={avatarId} onAvatarChange={(id) => { setAvatarId(id); AsyncStorage.setItem('avatarId', id).catch(console.warn); }} />
      )}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  load: { color: colors.muted, fontWeight: '600', fontSize: 13, letterSpacing: 0.4, marginTop: 6 },
  mascotRing: {
    width: 150,
    height: 150,
    borderRadius: 75,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.8,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  mascot: { width: '100%', height: '100%' },
  errorIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: alpha(colors.red, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.red, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
});
