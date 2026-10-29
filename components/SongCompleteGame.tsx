import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { Btn, Card, Muted, Text, Title } from './ui';
import {usePlaySize} from './PlayLayout';
import type { Side } from '../lib/types';

export function SongCompleteGame({ id, prompt, live, canPlay, paused, winner, side, onError }: {
  id: string; prompt: string; live: boolean; canPlay: boolean; paused: boolean;
  winner: Side | null; side: Side | null; onError: (message: string) => void;
}) {
  const compact=usePlaySize().active;
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [correct, setCorrect] = useState(false);
  useEffect(() => { setAnswer(''); setFeedback(''); setCorrect(false); }, [id]);
  const send = async () => {
    if (!answer.trim() || busy || correct || !live || !canPlay || paused) return;
    setBusy(true);
    try {
      const ok = await api.submitSongAnswer(id, answer.trim());
      setCorrect(ok);
      setFeedback(ok ? 'Doğru cevap!' : 'Yanlış cevap, tekrar dene!');
      if (!ok) setAnswer('');
    } catch (e) {
      const message = (e as Error).message;
      onError(message);
    } finally { setBusy(false); }
  };
  const result = !live ? winner === side && !!winner ? 'won' : winner ? 'lost' : 'draw' : null;
  return (
    <Card style={[styles.card,compact&&{padding:10,gap:8}]}>
      <Title size={compact?18:24} style={{ textAlign: 'center' }}>🎵 Şarkı Tamamlama</Title>
      {!compact&&<Muted style={{ textAlign: 'center' }}>Sanatçıyı ve eksik şarkı adını incele. Sınırsız deneme hakkın var. İlk doğru yanıt veren takım kazanır!</Muted>}
      <View style={[styles.question,compact&&{padding:10}]}><Text style={styles.prompt}>{prompt}</Text></View>
      {result ? (
        <View style={[styles.result, { borderColor: result === 'won' ? '#42DDA7' : result === 'lost' ? '#F27889' : '#E3BC70' }]}>
          <Title size={24} style={{ textAlign: 'center', color: result === 'won' ? '#42DDA7' : result === 'lost' ? '#F27889' : '#E3BC70' }}>
            {result === 'won' ? '🏆 KAZANDINIZ!' : result === 'lost' ? 'BU TURU KAYBETTİNİZ' : 'SÜRE DOLDU'}
          </Title>
          <Text style={styles.center}>{result === 'won' ? '+2 puan ve bonus parça takımınızın!' : result === 'lost' ? 'Rakip takım şarkıyı önce tamamladı.' : 'Bu turda kazanan olmadı.'}</Text>
        </View>
      ) : correct ? (
        <View style={styles.result}>
          <Title size={20} style={{ textAlign: 'center', color: correct ? '#42DDA7' : '#F27889' }}>{correct ? 'DOĞRU! 🎉' : 'YANLIŞ CEVAP'}</Title>
          <Text style={styles.center}>{correct ? 'Takımınız kazandı! Sonuç diğer oyunculara aktarılıyor.' : 'Cevap hakkını kullandın. Diğer oyuncuları bekle.'}</Text>
        </View>
      ) : (
        <>
          {!!feedback && <Text style={{ color: '#F2BD72', textAlign: 'center', fontWeight: '700' }}>{feedback}</Text>}
          <TextInput
            style={styles.input} value={answer} onChangeText={setAnswer}
            placeholder="Eksik şarkı adını yaz..." placeholderTextColor="#96A7BE"
            autoCapitalize="words" maxLength={100} editable={live && canPlay && !paused && !busy}
            onSubmitEditing={send} returnKeyType="done"
          />
          <Btn title="Cevabı Gönder" icon="send" tone="success" disabled={!live || !canPlay || paused || busy || !answer.trim()} onPress={send} />
          {busy && <ActivityIndicator />}
        </>
      )}
    </Card>
  );
}
const styles = StyleSheet.create({
  card: { gap: 14 },
  question: { padding: 20, borderRadius: 16, backgroundColor: '#152A48', borderWidth: 1, borderColor: '#42638C' },
  prompt: { color: '#F4F7FF', textAlign: 'center', fontSize: 21, fontWeight: '800', lineHeight: 32 },
  input: { color: '#FFFFFF', borderWidth: 1.5, borderColor: '#5A7DA3', backgroundColor: '#101F36', borderRadius: 12, minHeight: 54, paddingHorizontal: 14, fontSize: 17 },
  result: { padding: 22, gap: 10, borderWidth: 2, borderColor: '#4A678B', borderRadius: 16 },
  center: { color: '#EDF5FF', fontSize: 15, textAlign: 'center' },
});
