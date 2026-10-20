import React, { useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Btn, Card, Muted, Pulse, Screen, Title, useToast } from '../components/ui';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
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
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= ODA KODU KARTI ================= */}
        <View style={s.codeCard}>
          <View style={s.badge}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText}>BEKLEME ODASI</Text>
          </View>
          <Text style={s.codeLabel}>KATILIM KODU</Text>
          <Pulse>
            <Text style={s.code}>{room.code}</Text>
          </Pulse>
          <Btn
            title="📤 Arkadaşlarına Gönder"
            tone="ghost"
            onPress={share}
            style={{ marginTop: 12, width: '100%' }}
          />
        </View>

        {/* ================= OYUNCULAR LİSTESİ ================= */}
        <Card style={{ gap: 14 }}>
          <View style={s.playersHead}>
            <Title size={20}>Oyuncular</Title>
            <View style={s.countBadge}>
              <Text style={s.countText}>{players.length} / 12</Text>
            </View>
          </View>

          <View style={{ gap: 8 }}>
            {players.map((p) => {
              const isMe = p.id === me.id;
              return (
                <View key={p.id} style={[s.playerRow, isMe && s.playerRowMe]}>
                  <View style={s.playerLeft}>
                    <View style={[s.avatarCircle, isMe && s.avatarCircleMe]}>
                      <Text style={s.avatarInitial}>
                        {p.nickname.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[s.pName, isMe && s.pNameMe]}>
                      {p.nickname}
                      {isMe ? ' (Sen)' : ''}
                    </Text>
                  </View>
                  {p.is_host && (
                    <View style={s.hostBadge}>
                      <Text style={s.hostText}>👑 Kurucu</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <Muted style={{ marginTop: 4 }}>
            Oyun başladığında oyuncular adil şekilde iki takıma ayrılır.
          </Muted>
        </Card>

        {/* ================= BAŞLAT / AYRIL ================= */}
        <View style={{ gap: 12, marginTop: 4 }}>
          {me.is_host ? (
            <Btn
              title={players.length < 2 ? 'En az 2 kişi gerekli' : '🚀 Oyunu Başlat'}
              disabled={players.length < 2}
              loading={busy}
              tone="success"
              onPress={start}
            />
          ) : (
            <Card style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Muted style={{ textAlign: 'center' }}>
                ⏳ Kurucunun oyunu başlatması bekleniyor…
              </Muted>
            </Card>
          )}
          <Btn title="Odadan Ayrıl" tone="ghost" onPress={onLeave} />
        </View>
      </ScrollView>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 18, paddingBottom: 40 },
  codeCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 22,
    alignItems: 'center',
    marginTop: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: '#161D2C',
    borderWidth: 1,
    borderColor: '#242F46',
    marginBottom: 12,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' },
  badgeText: { color: '#8E9BAE', fontSize: 10, fontWeight: '800', letterSpacing: 1.1 },
  codeLabel: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  code: {
    color: '#F59E0B',
    fontSize: 58,
    fontWeight: '900',
    letterSpacing: 8,
    marginVertical: 4,
  },
  playersHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  countBadge: {
    backgroundColor: '#161D2C',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  countText: { color: '#8E9BAE', fontSize: 12, fontWeight: '800' },
  playerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#090C14',
    borderWidth: 1,
    borderColor: '#18202E',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  playerRowMe: {
    borderColor: '#242F46',
    backgroundColor: '#0E131E',
  },
  playerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#161D2C',
    borderWidth: 1,
    borderColor: '#242F46',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCircleMe: {
    backgroundColor: 'rgba(43, 102, 255, 0.2)',
    borderColor: '#2B66FF',
  },
  avatarInitial: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  pName: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  pNameMe: { color: '#60A5FA', fontWeight: '800' },
  hostBadge: {
    backgroundColor: '#22190E',
    borderWidth: 1,
    borderColor: '#3D2D14',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hostText: { color: '#F59E0B', fontWeight: '800', fontSize: 12 },
});
