import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CanvasStudio } from '../components/Canvas';
import {
  Avatar, Btn, Card, Chip, Eyebrow, IconBtn, Input, Muted, ProgressBar, RoomExitButton, Screen, Sheet, Tap, Text, Title, useToast,
} from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { avatarFor } from '../lib/art';
import { effNow, secondsLeft } from '../lib/selectors';
import { soundFx } from '../lib/soundEffects';
import { alpha, colors, gradients, teamColor, teamName } from '../lib/theme';
import type { Ctx } from '../lib/types';

/**
 * İnşa fazı — neon arena teması.
 * Mimar tuvali yönetir, takım canlı izler ve emoji tepkileri gönderir.
 */
export function BuildingScreen({ ctx }: { ctx: Ctx }) {
  const { data, me } = ctx;
  const { width, height } = useWindowDimensions();
  const now = useNow();
  const left = secondsLeft(data.room.phase_ends_at, effNow(data.room, now));
  const [open, setOpen] = useState(false);
  const [draggingPiece, setDraggingPiece] = useState(false);
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const { toast, show } = useToast();

  const mates = data.players.filter((p) => p.team_side === me.team_side);
  const architect = mates.find((p) => p.is_architect);
  const myTeam = data.teams.find((t) => t.side === me.team_side);
  // Board size follows the available width, not the remaining viewport height.
  // The entire building screen scrolls, so the board never overlaps the timer or controls.
  const size = Math.max(180, Math.min(width - 52, 420));
  const isArchitect = me.is_architect || (mates.length === 1 && architect?.id === me.id);

  const tColor = teamColor(me.team_side);
  const secs = Math.ceil(Math.max(0, left));
  const isUrgent = secs <= 10;
  const previousSecond = useRef(secs);
  useEffect(() => {
    if (secs !== previousSecond.current && secs > 0 && secs <= 5) soundFx.countdown(secs);
    if (secs === 0 && previousSecond.current > 0) soundFx.timeUp();
    previousSecond.current = secs;
  }, [secs]);
  const progressPct = Math.max(0, Math.min(1, left / 75));

  const isMyTeamReady = me.team_side === 'A' ? !!data.room.building_ready_a : !!data.room.building_ready_b;
  const readyCount = (data.room.building_ready_a ? 1 : 0) + (data.room.building_ready_b ? 1 : 0);

  const guard = (fn: () => Promise<unknown>) =>
    fn().catch((e) => show((e as Error).message, 'error'));

  return (
    <Screen>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} scrollEnabled={!draggingPiece}>
      {/* ================= ÜST BAŞLIK & BİLGİ ALANI ================= */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Eyebrow live color={colors.mint} dot={colors.mint}>Canlı inşa evresi</Eyebrow>
          <Title size={30}>İnşa Zamanı</Title>
          <View style={s.badgesRow}>
            <Chip color={tColor} icon="shield" label={teamName(me.team_side)} />
            <View style={s.architectChip}>
              <Avatar source={avatarFor(architect?.nickname, architect?.avatar_id)} size={22} ring={colors.magenta} glow={false} />
              <Text style={s.architectLabel}>
                Mimar:{' '}
                <Text style={s.architectValue}>{architect?.nickname ?? '—'}</Text>
                {me.is_architect && <Text style={s.architectSelf}> (Sen)</Text>}
              </Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <RoomExitButton onExit={ctx.exitRoom} />
          <IconBtn icon="settings-sharp" onPress={() => setOpen(true)} size={48} />
        </View>
      </View>

      {/* ================= SÜRE KARTI ================= */}
      <Card accent={isUrgent ? colors.red : tColor} style={s.timerCard}>
        <View style={s.timerHeader}>
          <View style={s.timerLabelGroup}>
            <Ionicons name={isUrgent ? 'alarm' : 'timer-outline'} size={18} color={isUrgent ? colors.red : tColor} />
            <Text style={s.timerLabel}>KALAN SÜRE</Text>
          </View>
          <View style={s.timeBadge}>
            <Text display style={[s.timeValue, { color: isUrgent ? colors.red : colors.text }]}>{secs}</Text>
            <Text style={s.timeUnit}>sn</Text>
          </View>
        </View>
        <ProgressBar
          pct={progressPct}
          colors={isUrgent ? gradients.danger : [alpha(tColor, 0.85), tColor]}
          height={9}
          duration={1000}
        />
      </Card>

      {/* ================= HAZIRLIK BUTONU (Yalnızca Mimar) ================= */}
      <View style={s.readySection}>
        {isArchitect ? (
          <Btn
            title={
              isMyTeamReady
                ? `Rakip Bekleniyor (${readyCount}/2 Takım Hazır)`
                : 'İnşa Tamamlandı, Hazırız!'
            }
            tone={isMyTeamReady ? 'gold' : 'success'}
            icon={isMyTeamReady ? 'hourglass' : 'checkmark-circle'}
            size="md"
            onPress={() =>
              guard(async () => {
                const next = !isMyTeamReady;
                await api.setBuildingReady(data.room.id, next);
                show(
                  next ? 'Takımınız hazır! Rakip bekleniyor…' : 'Hazırlık geri alındı',
                  next ? 'success' : 'info',
                );
              })
            }
          />
        ) : (
          <Card accent={isMyTeamReady ? colors.mint : colors.border} style={{ paddingVertical: 10, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons
                name={isMyTeamReady ? 'checkmark-circle' : 'construct'}
                size={22}
                color={isMyTeamReady ? colors.mint : colors.cyan}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>
                  {isMyTeamReady
                    ? `Takım Hazır! Rakip Bekleniyor (${readyCount}/2)`
                    : `Mimar (${architect?.nickname ?? 'Takım'}) inşayı tamamlıyor…`}
                </Text>
                <Muted style={{ fontSize: 11 }}>
                  {isMyTeamReady ? 'Her iki takım da hazır olunca oylamaya geçilecek' : 'İnşaat hazır butonuna sadece Mimar basabilir'}
                </Muted>
              </View>
            </View>
          </Card>
        )}
      </View>

      {/* ================= TUVAL / STÜDYO ALANI ================= */}
      {me.is_captain&&<Btn title="Mimarı Seç / Değiştir" icon="construct" onPress={()=>setOpen(true)} style={{marginBottom:12}}/>}
      <View style={s.canvasContainer}>
        <CanvasStudio ctx={ctx} size={size} onDraggingChange={setDraggingPiece} />
      </View>

      </ScrollView>

      {/* ================= TAKIM AYARLARI ================= */}
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <View style={s.sheetHead}>
          <View>
            <Eyebrow color={colors.muted} icon="people">Takım yönetimi</Eyebrow>
            <Title size={24}>Takım Ayarları</Title>
          </View>
          <IconBtn icon="close" onPress={() => setOpen(false)} size={40} />
        </View>

        {/* Yaratık Adı & Özel Gücü Kartı */}
        {me.is_captain ? (
          <Card style={{ gap: 12 }}>
            <Eyebrow icon="create" color={colors.muted}>Yaratık adı & unvanı (Kaptan)</Eyebrow>
            <Input
              icon="sparkles"
              value={name}
              onChangeText={setName}
              maxLength={60}
              placeholder={myTeam?.creature_name ?? 'örn. Siborg Ejderi'}
            />
            <Input
              icon="flash"
              value={title}
              onChangeText={setTitle}
              maxLength={60}
              placeholder={myTeam?.creature_title ?? 'Özel Güç / Unvan (örn. Galaksi Fatihi)'}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {['Alev Püskürten', 'Kozmik Yıkıcı', 'Galaksi Fatihi', 'Lazer Gözlü', 'Uykusuz Şampiyon'].map((sug) => (
                <Tap key={sug} onPress={() => setTitle(sug)} color={alpha(colors.violet, 0.4)} accent={colors.violet} scaleTo={0.92} style={{ borderRadius: 100 }}>
                  <Chip size="sm" color={colors.violet} icon="sparkles" label={sug} />
                </Tap>
              ))}
            </View>
            <Btn
              title="Kaydet"
              icon="save"
              size="md"
              tone="primary"
              disabled={!name.trim() && !title.trim()}
              onPress={() =>
                guard(async () => {
                  await api.setCreatureName(data.room.id, name || (myTeam?.creature_name ?? 'İsimsiz Canavar'), title || myTeam?.creature_title);
                  show('Başarıyla kaydedildi', 'success');
                })
              }
            />
          </Card>
        ) : (
          <Card style={{ gap: 6 }}>
            <Eyebrow icon="sparkles" color={colors.muted}>Yaratık adı & unvanı</Eyebrow>
            <Text display style={s.creatureNameDisplay}>
              {myTeam?.creature_name ?? 'Kaptan henüz belirlemedi'}
            </Text>
            {myTeam?.creature_title && (
              <Text style={{ color: colors.cyan, fontSize: 13, fontWeight: '600' }}>
                ⚡ {myTeam.creature_title}
              </Text>
            )}
          </Card>
        )}

        {/* Mimar Seçimi Kartı */}
        {mates.length > 1 && (
          <Card style={{ gap: 12 }}>
            <Eyebrow icon="construct" color={colors.muted}>Mimarı takım kaptanı seçer</Eyebrow>
            <Muted>{me.is_captain?'Kendin dahil takımından birini seçebilirsin.':'Mimarı takım kaptanın değiştirebilir.'}</Muted>
            <View style={{ gap: 10 }}>
              {mates.map((p) => {
                const isArch = p.is_architect;
                return (
                  <Tap
                    key={p.id}
                    disabled={isArch||!me.is_captain}
                    color={alpha(colors.mint, 0.3)}
                    accent={colors.mint}
                    scaleTo={0.96}
                    onPress={() =>
                      guard(async () => {
                        const changed = await api.voteArchitect(data.room.id, p.id);
                        show(changed ? 'Yeni mimar seçildi!' : 'Bu oyuncu zaten mimar.', 'success');
                      })
                    }
                    style={[s.memberRow,width<=430&&{flexDirection:'column',alignItems:'stretch',gap:8}, isArch ? s.memberRowActive : s.memberRowInactive]}
                  >
                    <View style={s.memberInfo}>
                      <Avatar source={avatarFor(p.nickname, p.avatar_id)} size={36} ring={isArch ? colors.mint : colors.borderLight} glow={isArch} />
                      <Text numberOfLines={2} style={[s.memberName, isArch && { color: colors.mint }]}>{p.nickname}{p.id===me.id?' (Sen)':''}</Text>
                    </View>
                    <Chip
                      size="sm"
                      color={isArch ? colors.mint : colors.muted}
                      icon={isArch ? 'construct' : 'hand-right'}
                      label={isArch ? 'Aktif Mimar' : me.is_captain?'Mimar Seç':'Oyuncu'}
                    />
                  </Tap>
                );
              })}
            </View>
          </Card>
        )}
        {toast}
      </Sheet>

      {toast}
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { paddingBottom: 32 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, paddingTop: 4 },
  headerLeft: { flex: 1, paddingRight: 14, gap: 4 },
  badgesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  architectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: alpha(colors.magenta, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.magenta, 0.35),
    paddingLeft: 4,
    paddingRight: 11,
    paddingVertical: 3,
    borderRadius: 100,
  },
  architectLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  architectValue: { color: colors.text, fontWeight: '700' },
  architectSelf: { color: colors.cyan, fontWeight: '700' },

  timerCard: { gap: 12, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 14 },
  timerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  timeBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  timeValue: { fontSize: 26, fontWeight: '900', lineHeight: 28 },
  timeUnit: { color: colors.muted, fontSize: 12, fontWeight: '600' },

  readySection: { marginBottom: 20, minHeight: 66, zIndex: 1 },
  canvasContainer: { alignItems: 'center', paddingTop: 12, zIndex: 0 },

  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creatureNameDisplay: { color: colors.yellow, fontSize: 20, fontWeight: '800', paddingVertical: 2 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  memberRowActive: { backgroundColor: alpha(colors.mint, 0.1), borderColor: alpha(colors.mint, 0.4) },
  memberRowInactive: { backgroundColor: colors.inset, borderColor: colors.border },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 10,minWidth:0 },
  memberName: { flex:1,color: colors.text, fontSize: 15, fontWeight: '700' },
});
