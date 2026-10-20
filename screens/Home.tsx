import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Btn, Card, Muted, Screen, Title, useToast } from '../components/ui';
import { api } from '../lib/api';
import { colors } from '../lib/theme';

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
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* ================= HERO ================= */}
          <View style={s.hero}>
            <View style={s.badge}>
              <View style={s.badgeDot} />
              <Text style={s.badgeText}>MİDAS MULTIPLAYER ARENA</Text>
            </View>
            <Text style={s.emoji}>🧦 👁️ 🛞</Text>
            <Title size={36}>{GAME_TITLE}</Title>
            <Muted style={{ textAlign: 'center', marginTop: 8, paddingHorizontal: 16 }}>
              İki takım, aynı bulmacalar. Parçaları kap, en absürt yaratığı inşa et!
            </Muted>
          </View>

          {/* ================= TAKMA AD ================= */}
          <Card style={{ gap: 10 }}>
            <Text style={s.cardLabel}>OYUNCU ADIN</Text>
            <TextInput
              value={nick}
              onChangeText={setNick}
              placeholder="örn. Çorap Avcısı"
              placeholderTextColor="#5A6679"
              maxLength={20}
              style={s.input}
            />
          </Card>

          {/* ================= ODA KUR ================= */}
          <Card style={{ gap: 14 }}>
            <Title size={20}>Yeni Oda Kur</Title>
            <View style={s.modes}>
              {([['quick', '⚡ Hızlı', '~5-10 dk'], ['long', '🏗️ Uzun', '~15-20 dk']] as const).map(([m, label, sub]) => (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[s.mode, mode === m && s.modeOn]}
                >
                  <Text style={[s.modeLabel, mode === m && s.modeLabelOn]}>{label}</Text>
                  <Text style={[s.modeSub, mode === m && s.modeSubOn]}>{sub}</Text>
                </Pressable>
              ))}
            </View>
            <Btn title="Oda Kur" tone="primary" loading={busy === 'create'} onPress={() => run('create')} />
          </Card>

          {/* ================= ODAYA KATIL ================= */}
          <Card style={{ gap: 14 }}>
            <Title size={20}>Odaya Katıl</Title>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="ODA KODU"
              placeholderTextColor="#5A6679"
              autoCapitalize="characters"
              maxLength={5}
              style={[s.input, s.codeInput]}
            />
            <Btn title="Odaya Giriş Yap" tone="custom" color="#0EA5E9" loading={busy === 'join'} onPress={() => run('join')} />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 18, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 16, paddingBottom: 10 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: '#101521',
    borderWidth: 1,
    borderColor: '#1C2436',
    marginBottom: 16,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2B66FF' },
  badgeText: { color: '#8E9BAE', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  emoji: { fontSize: 40, marginBottom: 10 },
  cardLabel: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
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
  codeInput: {
    textAlign: 'center',
    letterSpacing: 8,
    fontSize: 22,
    fontWeight: '900',
  },
  modes: { flexDirection: 'row', gap: 10 },
  mode: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E283A',
    backgroundColor: '#090C14',
    alignItems: 'center',
  },
  modeOn: {
    borderColor: '#2B66FF',
    backgroundColor: 'rgba(43, 102, 255, 0.12)',
  },
  modeLabel: { color: '#8E9BAE', fontWeight: '800', fontSize: 15 },
  modeLabelOn: { color: '#FFFFFF' },
  modeSub: { color: '#5A6679', fontSize: 12, marginTop: 3, fontWeight: '600' },
  modeSubOn: { color: '#93C5FD' },
});
