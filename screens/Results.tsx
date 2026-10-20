import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { CanvasBoard } from '../components/Canvas';
import { Btn, Muted, Pulse, Screen, Title } from '../components/ui';
import { api } from '../lib/api';
import { teamColor, teamName } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { Ctx, GameResults, Side } from '../lib/types';

export function ResultsScreen({ ctx }: { ctx: Ctx }) {
  const { data, me, catalog, onLeave } = ctx;
  const { width } = useWindowDimensions();
  const colW = (width - 44 - 14) / 2; // Ferah padding hesabıyla sütun genişliği
  const [res, setRes] = useState<GameResults | null>(null);

  useEffect(() => {
    api.results(data.room.id).then((r) => {
      setRes(r);
      soundFx.cheer();
      haptic.success();
    }).catch(() => undefined);
  }, [data.room.id]);

  if (!res) {
    return (
      <Screen>
        <View style={s.center}>
          <Text style={{ fontSize: 36, marginBottom: 12 }}>🏁</Text>
          <Title size={22}>Sonuçlar Hesaplanıyor…</Title>
          <Muted style={{ marginTop: 6 }}>Puanlar toplanıyor, lütfen bekle.</Muted>
        </View>
      </Screen>
    );
  }

  const isOfficialMine = res.official_winner && me.team_side === res.official_winner;
  const isFunnyMine = res.funny_winner && me.team_side === res.funny_winner;

  return (
    <Screen>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ================= BAŞLIK ================= */}
        <View style={s.header}>
          <View style={s.liveBadge}>
            <View style={s.liveDot} />
            <Text style={s.liveText}>OYUN TAMAMLANDI</Text>
          </View>
          <Title size={30}>Sonuçlar</Title>
        </View>

        {/* ================= ŞAMPİYONLUK KARTLARI (FERAH & AYRIŞMIŞ) ================= */}
        <View style={s.awardsSection}>
          {/* 1. Resmi Şampiyon Kartı */}
          <Pulse>
            <View style={[s.awardCard, s.officialCard]}>
              <View style={s.awardTopRow}>
                <View style={s.awardCategoryPill}>
                  <Text style={s.awardCategoryText}>🏆 RESMİ ŞAMPİYON</Text>
                </View>
                {isOfficialMine && (
                  <View style={s.minePill}>
                    <Text style={s.minePillText}>🎉 Bu bizim!</Text>
                  </View>
                )}
              </View>

              <View style={s.awardBody}>
                <View style={s.trophyContainer}>
                  <Text style={{ fontSize: 44 }}>🏆</Text>
                </View>
                <Text style={s.winnerTitle}>
                  {res.official_winner ? teamName(res.official_winner) : 'Berabere'}
                </Text>
                {res.official_winner && (
                  <View
                    style={[
                      s.teamPill,
                      {
                        backgroundColor: `${teamColor(res.official_winner)}18`,
                        borderColor: `${teamColor(res.official_winner)}40`,
                      },
                    ]}
                  >
                    <View
                      style={[
                        s.teamDot,
                        { backgroundColor: teamColor(res.official_winner) },
                      ]}
                    />
                    <Text
                      style={[
                        s.teamPillText,
                        { color: teamColor(res.official_winner) },
                      ]}
                    >
                      {res.teams[res.official_winner].score} Puan ile Kazandı
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Pulse>

          {/* 2. En Komik / Çılgın Tasarım Kartı */}
          <View style={[s.awardCard, s.funnyCard]}>
            <View style={s.awardTopRow}>
              <View style={[s.awardCategoryPill, { backgroundColor: '#1A1830', borderColor: '#322852' }]}>
                <Text style={[s.awardCategoryText, { color: '#C084FC' }]}>
                  🤪 EN KOMİK / ÇILGIN TASARIM
                </Text>
              </View>
              {isFunnyMine && (
                <View style={s.minePill}>
                  <Text style={s.minePillText}>⭐ Bizim Yaratık!</Text>
                </View>
              )}
            </View>

            <View style={s.awardBody}>
              <View style={[s.trophyContainer, { backgroundColor: '#161328', borderColor: '#2E2248' }]}>
                <Text style={{ fontSize: 38 }}>
                  {res.funny_winner ? '👑' : '🤝'}
                </Text>
              </View>
              <Text style={s.winnerTitle}>
                {res.funny_winner ? teamName(res.funny_winner) : 'Berabere'}
              </Text>
              {res.funny_winner ? (
                <Text style={s.funnySub}>
                  {res.teams[res.funny_winner].creature_name ?? 'İsimsiz Ucube'} ·{' '}
                  {res.teams[res.funny_winner].funny_votes} Oy
                </Text>
              ) : (
                <Text style={s.funnySub}>Takımlar eşit komiklik oyu aldı</Text>
              )}
            </View>
          </View>
        </View>

        {/* ================= YARATIK SERGİSİ (ÇİZGİSİZ, FERAH DARK KARTLAR) ================= */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>YARATIK SERGİSİ</Text>
        </View>

        <View style={s.creatureRow}>
          {(['A', 'B'] as Side[]).map((side) => {
            const tColor = teamColor(side);
            const teamData = res.teams[side];
            return (
              <View key={side} style={[s.creatureShowcaseCard, { width: colW }]}>
                {/* Takım Çipi */}
                <View
                  style={[
                    s.teamChip,
                    { backgroundColor: `${tColor}16`, borderColor: `${tColor}38` },
                  ]}
                >
                  <View style={[s.chipDot, { backgroundColor: tColor }]} />
                  <Text style={[s.teamChipText, { color: tColor }]}>
                    {teamName(side)}
                  </Text>
                </View>

                {/* Çizgisiz, Modern Tuval Çerçevesi */}
                <View style={s.canvasWrapper}>
                  <CanvasBoard ctx={ctx} side={side} size={colW - 24} />
                </View>

                {/* Yaratık Adı */}
                <Text style={s.creatureName} numberOfLines={2}>
                  {teamData.creature_name ?? 'İsimsiz Ucube'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* ================= TAKIM DETAY PUANLARI ================= */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>TAKIM İSTATİSTİKLERİ</Text>
        </View>

        <View style={{ gap: 12 }}>
          {(['A', 'B'] as Side[]).map((side) => {
            const t = res.teams[side];
            const tColor = teamColor(side);
            const pieces = data.teamPieces.filter((p) => p.side === side);
            return (
              <View key={side} style={s.scoreCard}>
                <View style={s.scoreCardHead}>
                  <View
                    style={[
                      s.teamChip,
                      { backgroundColor: `${tColor}16`, borderColor: `${tColor}38` },
                    ]}
                  >
                    <View style={[s.chipDot, { backgroundColor: tColor }]} />
                    <Text style={[s.teamChipText, { color: tColor }]}>
                      {teamName(side)}
                    </Text>
                  </View>
                  <View style={s.scorePill}>
                    <Text style={s.scorePillValue}>{t.score}</Text>
                    <Text style={s.scorePillUnit}>Puan</Text>
                  </View>
                </View>

                {/* Toplanan Parçalar Haznesi */}
                <View style={s.piecesTray}>
                  <Text style={s.piecesList}>
                    {pieces.length
                      ? pieces.map((p) => catalog[p.piece_id]?.emoji ?? '❔').join('  ')
                      : 'Henüz parça yok'}
                  </Text>
                </View>

                {/* İstatistik Çipleri */}
                <View style={s.statsRow}>
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Parça</Text>
                    <Text style={s.statValue}>{t.pieces}</Text>
                  </View>
                  <View style={s.statDivider} />
                  <View style={s.statItem}>
                    <Text style={s.statLabel}>Komiklik Oyu</Text>
                    <Text style={s.statValue}>{t.funny_votes}</Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>

        {/* ================= ANA MENÜYE DÖN BUTONU ================= */}
        <View style={{ marginTop: 12, marginBottom: 20 }}>
          <Btn title="Ana Menüye Dön" tone="primary" onPress={onLeave} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  scroll: { gap: 18, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: { paddingTop: 8, marginBottom: 4 },
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
  },

  // Ödül Kartları
  awardsSection: { gap: 14 },
  awardCard: {
    backgroundColor: '#101521',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 20,
  },
  officialCard: {
    borderColor: 'rgba(245, 158, 11, 0.25)',
    backgroundColor: '#111520',
  },
  funnyCard: {
    borderColor: 'rgba(139, 92, 246, 0.25)',
    backgroundColor: '#101422',
  },
  awardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  awardCategoryPill: {
    backgroundColor: '#1E1910',
    borderWidth: 1,
    borderColor: '#3D2F15',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  awardCategoryText: {
    color: '#F59E0B',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  minePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
  },
  minePillText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '800',
  },
  awardBody: { alignItems: 'center', gap: 8 },
  trophyContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#1C1A14',
    borderWidth: 1,
    borderColor: '#382D16',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  winnerTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    borderWidth: 1,
  },
  teamDot: { width: 6, height: 6, borderRadius: 3 },
  teamPillText: { fontSize: 13, fontWeight: '800' },
  funnySub: { color: '#8E9BAE', fontSize: 14, fontWeight: '600' },

  // Bölüm Başlığı
  sectionHeader: { marginTop: 8, marginBottom: -6 },
  sectionTitle: {
    color: '#7E8B9E',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  // Yaratık Kartları
  creatureRow: { flexDirection: 'row', gap: 14 },
  creatureShowcaseCard: {
    backgroundColor: '#101521',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 12,
    alignItems: 'center',
    gap: 10,
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipDot: { width: 6, height: 6, borderRadius: 3 },
  teamChipText: { fontSize: 12, fontWeight: '700' },
  canvasWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0E131F',
  },
  creatureName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Takım Puan Kartı
  scoreCard: {
    backgroundColor: '#101521',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#1C2436',
    padding: 18,
    gap: 12,
  },
  scoreCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    backgroundColor: '#161D2C',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  scorePillValue: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
  },
  scorePillUnit: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '700',
  },
  piecesTray: {
    backgroundColor: '#0A0D15',
    borderWidth: 1,
    borderColor: '#181F2E',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  piecesList: { fontSize: 24, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingTop: 4,
  },
  statItem: { alignItems: 'center', gap: 2 },
  statLabel: { color: '#8E9BAE', fontSize: 11, fontWeight: '700' },
  statValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  statDivider: { width: 1, height: 20, backgroundColor: '#1C2436' },
});
