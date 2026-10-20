import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { CanvasStudio } from '../components/Canvas';
import { Btn, Card, Muted, Screen, TimerBar, Title, useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { secondsLeft } from '../lib/selectors';
import { colors, radius, teamColor, teamName } from '../lib/theme';
import type { Ctx } from '../lib/types';

/** İnşa fazı: Mimar tuvali yönetir, takım canlı izler ve emoji tepkileri gönderir. */
export function BuildingScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const { width, height } = useWindowDimensions();
  const now = useNow();
  const left = secondsLeft(data.room.phase_ends_at, now);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const { toast, show } = useToast();

  const mates = data.players.filter((p) => p.team_side === me.team_side);
  const architect = mates.find((p) => p.is_architect);
  const myTeam = data.teams.find((t) => t.side === me.team_side);
  const size = Math.max(220, Math.min(width - 40, height - 400));

  const guard = (fn: () => Promise<unknown>) => fn().catch((e) => show((e as Error).message));

  return (
    <Screen>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Title size={22}>🏗️ İnşa Zamanı</Title>
          <Muted>
            <Text style={{ color: teamColor(me.team_side) }}>{teamName(me.team_side)}</Text> · Mimar: {architect?.nickname ?? '—'}
            {me.is_architect ? ' (sensin!)' : ''} · {Math.ceil(left)} sn
          </Muted>
        </View>
        <Pressable onPress={() => setOpen(true)} style={s.gear}><Text style={{ fontSize: 22 }}>⚙️</Text></Pressable>
      </View>
      <TimerBar left={left} total={75} color={teamColor(me.team_side)} />

      <View style={{ alignItems: 'center', marginTop: 12, flex: 1 }}>
        <CanvasStudio ctx={ctx} size={size} />
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <View style={s.sheet}>
            <View style={s.sheetHead}>
              <Title size={20}>Takım ayarları</Title>
              <Pressable onPress={() => setOpen(false)}><Text style={{ color: colors.muted, fontSize: 24 }}>✕</Text></Pressable>
            </View>

            {me.is_captain ? (
              <Card style={{ gap: 10 }}>
                <Muted>Yaratığın adı (Kaptan)</Muted>
                <TextInput
                  value={name} onChangeText={setName} maxLength={60}
                  placeholder={myTeam?.creature_name ?? 'örn. Dört Gözlü Çorap Canavarı'} placeholderTextColor={colors.muted}
                  style={s.input}
                />
                <Btn title="Adı Kaydet" disabled={!name.trim()} onPress={() => guard(async () => { await api.setCreatureName(data.room.id, name); show('İsim kaydedildi ✍️'); })} />
              </Card>
            ) : (
              <Card><Muted>Yaratık adı: <Text style={{ color: colors.yellow }}>{myTeam?.creature_name ?? 'Kaptan henüz belirlemedi'}</Text></Muted></Card>
            )}

            {mates.length > 1 && (
              <Card style={{ gap: 8 }}>
                <Muted>Mimarı seç (takım çoğunluk oyu)</Muted>
                {mates.map((p) => (
                  <Btn
                    key={p.id}
                    title={`${p.nickname}${p.is_architect ? '  🏗️' : ''}`}
                    tone={p.is_architect ? 'success' : 'ghost'}
                    disabled={p.is_architect}
                    onPress={() => guard(async () => { const changed = await api.voteArchitect(data.room.id, p.id); show(changed ? 'Yeni Mimar seçildi!' : 'Oyun kaydedildi 🗳️'); })}
                  />
                ))}
              </Card>
            )}
          </View>
          {toast}
        </View>
      </Modal>
      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  gear: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: 20, gap: 12, paddingBottom: 36 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: { backgroundColor: colors.bg, color: colors.text, borderRadius: radius.sm, padding: 14, fontSize: 16, fontWeight: '700', borderWidth: 1, borderColor: colors.surface2 },
});
