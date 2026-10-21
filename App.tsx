import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Sora_400Regular, Sora_500Medium, Sora_600SemiBold, Sora_700Bold } from '@expo-google-fonts/sora';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold, Outfit_900Black } from '@expo-google-fonts/outfit';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, Float, Muted, Screen, Text, Title } from './components/ui';
import { useGameDriver } from './hooks/useGameDriver';
import { useRoom } from './hooks/useRoom';
import { ensureAnonymousSession, supabase } from './lib/supabase';
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

  useEffect(() => { if (gone) onLeave(); }, [gone, onLeave]);

  if (!data || !me) {
    return <Loading text="Odaya bağlanılıyor…" />;
  }
  const ctx: Ctx = { data, me, catalog, onLeave };

  switch (data.room.phase) {
    case 'lobby': return <LobbyScreen ctx={ctx} />;
    case 'question': return <QuestionScreen ctx={ctx} />;
    case 'minigame': return <MinigameScreen ctx={ctx} />;
    case 'building': return <BuildingScreen ctx={ctx} />;
    case 'voting': return <VotingScreen ctx={ctx} />;
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

  const boot = useCallback(async () => {
    setError(null);
    try {
      const [user] = await Promise.all([ensureAnonymousSession(), syncServerTime()]);
      const [pieces, saved] = await Promise.all([supabase.from('pieces').select('*'), AsyncStorage.getItem(ROOM_KEY)]);
      setCatalog(Object.fromEntries(((pieces.data ?? []) as Piece[]).map((p) => [p.id, p])));
      setUserId(user.id);
      if (saved) setRoomId(saved);
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { boot(); }, [boot]);

  const enter = useCallback((id: string) => { AsyncStorage.setItem(ROOM_KEY, id); setRoomId(id); }, []);
  const leave = useCallback(() => { AsyncStorage.removeItem(ROOM_KEY); setRoomId(null); }, []);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
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
      ) : (
        <HomeScreen onEnter={enter} />
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
