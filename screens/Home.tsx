import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, Card, Muted, Screen, Title, useToast } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius } from '../lib/theme';

export const GAME_TITLE = 'Ucube Atölyesi';

export function HomeScreen({ onEnter }: { onEnter: (roomId: string) => void }) {
  const [nick, setNick] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'quick' | 'long'>('quick');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const { toast, show } = useToast();

  useEffect(() => {
    AsyncStorage.getItem('nickname').then((v) => v && setNick(v));
  }, []);

  const run = async (kind: 'create' | 'join') => {
    const name = nick.trim();
    if (!name) return show('Önce bir takma ad yaz 😎');
    if (kind === 'join' && code.trim().length < 4) return show('Oda kodunu yaz.');
    setBusy(kind);
    try {
      await AsyncStorage.setItem('nickname', name);
      const res = kind === 'create' ? await api.createRoom(name, mode) : await api.joinRoom(code.trim(), name);
      onEnter(res.room_id);
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.hero}>
            <Text style={s.emoji}>🧦👁️🛞</Text>
            <Title size={38}>{GAME_TITLE}</Title>
            <Muted style={{ textAlign: 'center', marginTop: 6 }}>
              İki takım, aynı bulmacalar. Parçaları kap, en absürt yaratığı inşa et!
            </Muted>
          </View>

          <Card style={{ gap: 12 }}>
            <Muted>Takma adın</Muted>
            <TextInput
              value={nick}
              onChangeText={setNick}
              placeholder="örn. Çorap Avcısı"
              placeholderTextColor={colors.muted}
              maxLength={20}
              style={s.input}
            />
          </Card>

          <Card style={{ gap: 12 }}>
            <Title size={20}>Yeni oda kur</Title>
            <View style={s.modes}>
              {([['quick', '⚡ Hızlı', '~5-10 dk'], ['long', '🏗️ Uzun', '~15-20 dk']] as const).map(([m, label, sub]) => (
                <Pressable key={m} onPress={() => setMode(m)} style={[s.mode, mode === m && s.modeOn]}>
                  <Text style={s.modeLabel}>{label}</Text>
                  <Text style={s.modeSub}>{sub}</Text>
                </Pressable>
              ))}
            </View>
            <Btn title="Oda Kur" loading={busy === 'create'} onPress={() => run('create')} />
          </Card>

          <Card style={{ gap: 12 }}>
            <Title size={20}>Odaya katıl</Title>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ODA KODU"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              maxLength={5}
              style={[s.input, s.codeInput]}
            />
            <Btn title="Katıl" tone="custom" color={colors.teamB} loading={busy === 'join'} onPress={() => run('join')} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 16, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingVertical: 24 },
  emoji: { fontSize: 44, marginBottom: 8 },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: radius.sm, padding: 14, fontSize: 18, fontWeight: '700', borderWidth: 1, borderColor: colors.surface2 },
  codeInput: { textAlign: 'center', letterSpacing: 8, fontSize: 24 },
  modes: { flexDirection: 'row', gap: 10 },
  mode: { flex: 1, padding: 14, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.surface2, alignItems: 'center' },
  modeOn: { borderColor: colors.yellow, backgroundColor: colors.yellow + '22' },
  modeLabel: { color: colors.text, fontWeight: '900', fontSize: 16 },
  modeSub: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
});
