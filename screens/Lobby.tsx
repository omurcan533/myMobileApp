import React, { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Btn, Card, Muted, Pulse, Screen, Title, useToast } from '../components/ui';
import { api } from '../lib/api';
import { colors, radius } from '../lib/theme';
import type { Ctx } from '../lib/types';
import { GAME_TITLE } from './Home';

export function LobbyScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, onLeave } = ctx;
  const { room, players } = data;
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  const start = async () => {
    setBusy(true);
    try {
      await api.startGame(room.id);
    } catch (e) {
      show((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = () =>
    Share.share({ message: `${GAME_TITLE}'ne gel! Oda kodu: ${room.code}` }).catch(() => undefined);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: 16, paddingBottom: 24 }}>
        <View style={{ alignItems: 'center', paddingTop: 12 }}>
          <Muted>ODA KODU</Muted>
          <Pulse>
            <Text style={s.code}>{room.code}</Text>
          </Pulse>
          <Btn title="📤 Arkadaşlarına gönder" tone="ghost" onPress={share} style={{ marginTop: 8 }} />
        </View>

        <Card style={{ gap: 10 }}>
          <Title size={20}>Oyuncular ({players.length}/12)</Title>
          {players.map((p) => (
            <View key={p.id} style={s.player}>
              <Text style={s.pName}>{p.nickname}{p.id === me.id ? ' (sen)' : ''}</Text>
              {p.is_host && <Text style={s.badge}>👑 Kurucu</Text>}
            </View>
          ))}
          <Muted>Oyun başlayınca herkes rastgele iki takıma ayrılır. Tek sayıda olmanız sorun değil!</Muted>
        </Card>

        {me.is_host ? (
          <Btn title={players.length < 2 ? 'En az 2 kişi gerekli' : '🚀 Oyunu Başlat'} disabled={players.length < 2} loading={busy} tone="success" onPress={start} />
        ) : (
          <Card><Muted style={{ textAlign: 'center' }}>Kurucunun oyunu başlatması bekleniyor…</Muted></Card>
        )}
        <Btn title="Odadan çık" tone="ghost" onPress={onLeave} />
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  code: { color: colors.yellow, fontSize: 64, fontWeight: '900', letterSpacing: 10 },
  player: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bg, padding: 12, borderRadius: radius.sm },
  pName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  badge: { color: colors.yellow, fontWeight: '800', fontSize: 12 },
});
