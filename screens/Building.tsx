import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CanvasStudio } from '../components/Canvas';
import { useToast } from '../components/ui';
import { useNow } from '../hooks/useNow';
import { api } from '../lib/api';
import { secondsLeft } from '../lib/selectors';
import { teamColor, teamName } from '../lib/theme';
import type { Ctx } from '../lib/types';

/**
 * İnşa fazı — Midas esintili ferah, modern ve lüks karanlık tema.
 * Mimar tuvali yönetir, takım canlı izler ve emoji tepkileri gönderir.
 */
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
  const size = Math.max(220, Math.min(width - 40, height - 420));

  const tColor = teamColor(me.team_side);
  const secs = Math.ceil(Math.max(0, left));
  const isUrgent = secs <= 10;
  const progressPct = Math.max(0, Math.min(100, (left / 75) * 100));

  const guard = (fn: () => Promise<unknown>) =>
    fn().catch((e) => show((e as Error).message));

  return (
    <LinearGradient colors={['#080B12', '#0E131F']} style={s.root}>
      <SafeAreaView style={s.safeArea}>
        {/* ================= ÜST BAŞLIK & BİLGİ ALANI ================= */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            {/* Canlı Durum Rozeti */}
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveText}>CANLI İNŞA EVRESİ</Text>
            </View>

            {/* Ferah Başlık */}
            <Text style={s.title}>İnşa Zamanı</Text>

            {/* Midas Çip / Hap Rozetleri */}
            <View style={s.badgesRow}>
              {/* Takım Rozeti */}
              <View
                style={[
                  s.chip,
                  { backgroundColor: `${tColor}16`, borderColor: `${tColor}38` },
                ]}
              >
                <View style={[s.chipDot, { backgroundColor: tColor }]} />
                <Text style={[s.chipText, { color: tColor }]}>
                  {teamName(me.team_side)}
                </Text>
              </View>

              {/* Mimar Rozeti */}
              <View style={s.architectChip}>
                <Text style={s.architectEmoji}>🏗️</Text>
                <Text style={s.architectLabel}>
                  Mimar:{' '}
                  <Text style={s.architectValue}>
                    {architect?.nickname ?? '—'}
                  </Text>
                  {me.is_architect && (
                    <Text style={s.architectSelf}> (Sen)</Text>
                  )}
                </Text>
              </View>
            </View>
          </View>

          {/* Ayarlar Düğmesi (Midas Kart Stili) */}
          <Pressable
            onPress={() => setOpen(true)}
            style={({ pressed }) => [
              s.gearBtn,
              pressed && { opacity: 0.7, transform: [{ scale: 0.94 }] },
            ]}
          >
            <Text style={s.gearIcon}>⚙️</Text>
          </Pressable>
        </View>

        {/* ================= MİDAS PERFORMANS / SÜRE KARTI ================= */}
        <View style={s.timerCard}>
          <View style={s.timerHeader}>
            <View style={s.timerLabelGroup}>
              <Text style={s.timerIcon}>⏱️</Text>
              <Text style={s.timerLabel}>KALAN SÜRE</Text>
            </View>
            <View style={[s.timeBadge, isUrgent && s.timeBadgeUrgent]}>
              <Text
                style={[
                  s.timeValue,
                  { color: isUrgent ? '#F43F5E' : '#FFFFFF' },
                ]}
              >
                {secs}
              </Text>
              <Text style={s.timeUnit}>sn</Text>
            </View>
          </View>

          {/* İnce & Modern İlerleme Çubuğu */}
          <View style={s.progressTrack}>
            <View
              style={[
                s.progressFill,
                {
                  width: `${progressPct}%`,
                  backgroundColor: isUrgent ? '#F43F5E' : tColor,
                },
              ]}
            />
          </View>
        </View>

        {/* ================= TUVAL / STÜDYO ALANI ================= */}
        <View style={s.canvasContainer}>
          <CanvasStudio ctx={ctx} size={size} />
        </View>

        {/* ================= TAKIM AYARLARI BOTTOM SHEET ================= */}
        <Modal
          visible={open}
          transparent
          animationType="slide"
          onRequestClose={() => setOpen(false)}
        >
          <View style={s.modalBackdrop}>
            <Pressable
              style={s.dismissArea}
              onPress={() => setOpen(false)}
            />
            <View style={s.sheet}>
              {/* Çekme Çubuğu */}
              <View style={s.dragHandle} />

              {/* Sheet Başlığı */}
              <View style={s.sheetHead}>
                <View>
                  <Text style={s.sheetTag}>TAKIM YÖNETİMİ</Text>
                  <Text style={s.sheetTitle}>Takım Ayarları</Text>
                </View>
                <Pressable
                  onPress={() => setOpen(false)}
                  style={({ pressed }) => [
                    s.closeBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={s.closeText}>✕</Text>
                </Pressable>
              </View>

              {/* Yaratık Adı Kartı */}
              {me.is_captain ? (
                <View style={s.card}>
                  <Text style={s.cardSub}>YARATIK ADI (KAPTAN)</Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    maxLength={60}
                    placeholder={
                      myTeam?.creature_name ??
                      'örn. Dört Gözlü Çorap Canavarı'
                    }
                    placeholderTextColor="#5A6679"
                    style={s.input}
                  />
                  <Pressable
                    disabled={!name.trim()}
                    onPress={() =>
                      guard(async () => {
                        await api.setCreatureName(data.room.id, name);
                        show('İsim başarıyla kaydedildi ✍️');
                      })
                    }
                    style={({ pressed }) => [
                      s.actionBtn,
                      { opacity: !name.trim() ? 0.4 : pressed ? 0.9 : 1 },
                    ]}
                  >
                    <Text style={s.actionBtnText}>Adı Kaydet</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={s.card}>
                  <Text style={s.cardSub}>YARATIK ADI</Text>
                  <Text style={s.creatureNameDisplay}>
                    {myTeam?.creature_name ?? 'Kaptan henüz belirlemedi'}
                  </Text>
                </View>
              )}

              {/* Mimar Seçimi Kartı */}
              {mates.length > 1 && (
                <View style={s.card}>
                  <Text style={s.cardSub}>
                    MİMARI SEÇ (TAKIM ÇOĞUNLUK OYU)
                  </Text>
                  <View style={{ gap: 10, marginTop: 4 }}>
                    {mates.map((p) => {
                      const isArch = p.is_architect;
                      return (
                        <Pressable
                          key={p.id}
                          disabled={isArch}
                          onPress={() =>
                            guard(async () => {
                              const changed = await api.voteArchitect(
                                data.room.id,
                                p.id
                              );
                              show(
                                changed
                                  ? 'Yeni Mimar seçildi! 🏗️'
                                  : 'Oyun kaydedildi 🗳️'
                              );
                            })
                          }
                          style={({ pressed }) => [
                            s.memberRow,
                            isArch ? s.memberRowActive : s.memberRowInactive,
                            pressed && !isArch && { opacity: 0.8 },
                          ]}
                        >
                          <View style={s.memberInfo}>
                            <View
                              style={[
                                s.memberDot,
                                {
                                  backgroundColor: isArch
                                    ? '#10B981'
                                    : '#5A6679',
                                },
                              ]}
                            />
                            <Text
                              style={[
                                s.memberName,
                                isArch && s.memberNameActive,
                              ]}
                            >
                              {p.nickname}
                            </Text>
                          </View>
                          <View
                            style={[
                              s.statusTag,
                              isArch
                                ? s.statusTagActive
                                : s.statusTagInactive,
                            ]}
                          >
                            <Text
                              style={[
                                s.statusTagText,
                                isArch && { color: '#10B981' },
                              ]}
                            >
                              {isArch ? 'Aktif Mimar 🏗️' : 'Oy Ver 🗳️'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
            {toast}
          </View>
        </Modal>

        {toast}
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safeArea: {
    flex: 1,
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 24,
  },

  // Üst Başlık & Bilgi
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20, // Ferah, açık boşluk
    paddingTop: 4,
  },
  headerLeft: { flex: 1, paddingRight: 16 },

  // Canlı Bildirim Rozeti
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  liveText: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },

  // Başlık
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.6,
  },

  // Rozet Sırası (Çipler)
  badgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12, // Başlık ile rozetler arası nefes alma alanı
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },

  architectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#111622',
    borderWidth: 1,
    borderColor: '#1E283A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  architectEmoji: { fontSize: 13 },
  architectLabel: { color: '#8E9BAE', fontSize: 12, fontWeight: '600' },
  architectValue: { color: '#FFFFFF', fontWeight: '700' },
  architectSelf: { color: '#38BDF8', fontWeight: '800' },

  // Ayarlar Düğmesi
  gearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#121722',
    borderWidth: 1,
    borderColor: '#1F293A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  gearIcon: { fontSize: 20 },

  // Midas Sayaç / Performans Kartı
  timerCard: {
    backgroundColor: '#101521',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1C2436',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 22, // Sayaç ile tuval arasında ferah boşluk
  },
  timerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  timerIcon: { fontSize: 14 },
  timerLabel: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    backgroundColor: '#161D2C',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  timeBadgeUrgent: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  timeValue: { fontSize: 17, fontWeight: '900', letterSpacing: 0.5 },
  timeUnit: { color: '#8E9BAE', fontSize: 12, fontWeight: '700' },

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A2336',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },

  // Tuval Alanı
  canvasContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Modal / Bottom Sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: '#0D111A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderWidth: 1,
    borderColor: '#1E2638',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    gap: 16,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#263042',
    alignSelf: 'center',
    marginBottom: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  sheetTag: {
    color: '#7E8B9E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  sheetTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 2,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#161D2B',
    borderWidth: 1,
    borderColor: '#232E42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#8E9BAE', fontSize: 16, fontWeight: '700' },

  // Kartlar
  card: {
    backgroundColor: '#121724',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 18,
    gap: 12,
  },
  cardSub: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  creatureNameDisplay: {
    color: '#FFD93D',
    fontSize: 16,
    fontWeight: '800',
    paddingVertical: 4,
  },
  input: {
    backgroundColor: '#090C14',
    color: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#1E283A',
  },
  actionBtn: {
    backgroundColor: '#2B66FF',
    borderRadius: 100,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },

  // Üye Sıraları (Mimar Oylama)
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
  },
  memberRowActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  memberRowInactive: {
    backgroundColor: '#161D2C',
    borderColor: '#222D3E',
  },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberDot: { width: 8, height: 8, borderRadius: 4 },
  memberName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  memberNameActive: { color: '#10B981', fontWeight: '800' },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusTagActive: { backgroundColor: 'rgba(16, 185, 129, 0.18)' },
  statusTagInactive: { backgroundColor: '#1F293A' },
  statusTagText: { color: '#8E9BAE', fontSize: 12, fontWeight: '700' },
});
