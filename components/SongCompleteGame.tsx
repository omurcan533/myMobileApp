import { translate, useLanguage } from '../lib/i18n';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { Btn, Card, Muted, Text, Title } from './ui';
import {usePlaySize} from './PlayLayout';
import type { Side } from '../lib/types';

export function SongCompleteGame({ id, ...props }: SongProps) {
  return <SongRound key={id} id={id} {...props} />;
}
type SongProps = {
  id: string; prompt: string; live: boolean; canPlay: boolean; paused: boolean;
  winner: Side | null; side: Side | null; onError: (message: string) => void;
};
function SongRound({ id, prompt, live, canPlay, paused, winner, side, onError }: SongProps) {
  useLanguage();
  const compact=usePlaySize().active;
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [correct, setCorrect] = useState(false);
  // The keyed SongRound resets answer and feedback when a new round starts.
  const send = async () => {
    if (!answer.trim() || busy || correct || !live || !canPlay || paused) return;
    setBusy(true);
    try {
      const ok = await api.submitSongAnswer(id, answer.trim());
      setCorrect(ok);
      setFeedback(translate(ok ? 'Doğru cevap!' : 'Yanlış cevap, tekrar dene!'));
      if (!ok) setAnswer('');
    } catch (e) {
      const message = (e as Error).message;
      onError(message);
    } finally { setBusy(false); }
  };
  const result = !live ? winner === side && !!winner ? 'won' : winner ? 'lost' : 'draw' : null;
  return (
    <Card style={[styles.card,compact&&{padding:10,gap:8}]}>
      <Title size={compact?18:24} style={{ textAlign: 'center' }}>🎵 {translate('Şarkı Tamamlama')}</Title>
      {!compact&&<Muted style={{ textAlign: 'center' }}>{translate('Sanatçıyı ve eksik şarkı adını incele. Sınırsız deneme hakkın var. İlk doğru yanıt veren takım kazanır!')}</Muted>}
      <View style={[styles.question,compact&&{padding:10}]}><Text style={styles.prompt}>{prompt}</Text></View>
      {result ? (
        <View style={[styles.result, { borderColor: result === 'won' ? '#42DDA7' : result === 'lost' ? '#F27889' : '#E3BC70' }]}>
          <Title size={24} style={{ textAlign: 'center', color: result === 'won' ? '#42DDA7' : result === 'lost' ? '#F27889' : '#E3BC70' }}>
            {translate(result === 'won' ? '🏆 KAZANDINIZ!' : result === 'lost' ? 'BU TURU KAYBETTİNİZ' : 'SÜRE DOLDU')}
          </Title>
          <Text style={styles.center}>{translate(result === 'won' ? '+2 puan ve bonus parça takımınızın!' : result === 'lost' ? 'Rakip takım şarkıyı önce tamamladı.' : 'Bu turda kazanan olmadı.')}</Text>
        </View>
      ) : correct ? (
        <View style={styles.result}>
          <Title size={20} style={{ textAlign: 'center', color: correct ? '#42DDA7' : '#F27889' }}>{translate(correct ? 'DOĞRU! 🎉' : 'YANLIŞ CEVAP')}</Title>
          <Text style={styles.center}>{translate(correct ? 'Takımınız kazandı! Sonuç diğer oyunculara aktarılıyor.' : 'Cevap hakkını kullandın. Diğer oyuncuları bekle.')}</Text>
        </View>
      ) : (
        <>
          {!!feedback && <Text style={{ color: '#F2BD72', textAlign: 'center', fontWeight: '700' }}>{feedback}</Text>}
          <TextInput
            style={styles.input} value={answer} onChangeText={setAnswer}
            placeholder={translate('Eksik şarkı adını yaz...')} placeholderTextColor="#96A7BE"
            autoCapitalize="words" maxLength={100} editable={live && canPlay && !paused && !busy}
            onSubmitEditing={send} returnKeyType="done"
          />
          <Btn title={translate('Cevabı Gönder')} icon="send" tone="success" disabled={!live || !canPlay || paused || busy || !answer.trim()} onPress={send} />
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
