import 'react-native-url-polyfill/auto';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, Muted, Screen, Title } from './components/ui';
import { useGameDriver } from './hooks/useGameDriver';
import { useRoom } from './hooks/useRoom';
import { ensureAnonymousSession, supabase } from './lib/supabase';
import { syncServerTime } from './lib/serverTime';
import { colors } from './lib/theme';
import type { Ctx, Piece } from './lib/types';
import { BuildingScreen } from './screens/Building';
import { HomeScreen } from './screens/Home';
import { LobbyScreen } from './screens/Lobby';
import { MinigameScreen } from './screens/Minigame';
import { QuestionScreen } from './screens/Question';
import { ResultsScreen } from './screens/Results';
import { VotingScreen } from './screens/Voting';

const ROOM_KEY = 'roomId';

function RoomView({ roomId, userId, catalog, onLeave }: { roomId: string; userId: string; catalog: Record<string, Piece>; onLeave: () => void }) {
  const { data, gone } = useRoom(roomId);
  const me = data?.players.find((p) => p.user_id === userId);
  useGameDriver(data, me?.id);

  useEffect(() => { if (gone) onLeave(); }, [gone, onLeave]);

  if (!data || !me) {
    return <Screen><View style={s.center}><ActivityIndicator color={colors.yellow} size="large" /><Muted>Odaya bağlanılıyor…</Muted></View></Screen>;
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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {error ? (
        <Screen><View style={s.center}><Title>Bağlanamadık 😵</Title><Muted>{error}</Muted><Btn title="Tekrar dene" onPress={boot} style={{ marginTop: 16 }} /></View></Screen>
      ) : !ready || !userId ? (
        <Screen><View style={s.center}><ActivityIndicator color={colors.yellow} size="large" /><Text style={s.load}>Yükleniyor…</Text></View></Screen>
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
  load: { color: colors.muted, fontWeight: '700' },
});
