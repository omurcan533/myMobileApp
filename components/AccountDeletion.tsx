import React, { useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Btn, Input, Muted, Sheet, Text, Title } from './ui';
import { colors } from '../lib/theme';
import { translate, useLanguage } from '../lib/i18n';
import { deleteAccount, issueDeletionCode, type DeletionResult } from '../lib/accountDeletion';

export function AccountDeletion({ onDeleted }: { onDeleted: (result: DeletionResult) => void }) {
  const language = useLanguage();
  const [panel, setPanel] = useState<'delete' | 'code' | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [error, setError] = useState('');
  const word = language === 'tr' ? 'SİL' : 'DELETE';
  const close = () => { if (!locked.current) { setPanel(null); setConfirmation(''); setError(''); } };
  const run = async () => {
    if (locked.current || (panel === 'delete' && confirmation.trim() !== word)) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (panel === 'code') setCode(await issueDeletionCode());
      else onDeleted(await deleteAccount());
    } catch (e) { setError((e as Error).message); }
    finally { locked.current = false; setBusy(false); }
  };
  return (
    <View style={{ gap: 10 }}>
      <Btn title={translate('Webden silme kodu')} icon="key-outline" tone="ghost" onPress={() => setPanel('code')} />
      <Btn title={translate('Hesabımı ve verilerimi sil')} icon="trash-outline" tone="danger" onPress={() => setPanel('delete')} />
      <Sheet visible={panel !== null} onClose={close}>
        {panel === 'delete' ? <>
          <Title size={22}>{translate('Hesabını kalıcı olarak sil')}</Title>
          <Text style={styles.body}>{translate('Anonim hesabın, katılım kayıtların, cevapların, mesajların ve kişisel soru yanıtların silinir. Kurucusu olduğun odalar kapanır ve bu odaların ortak oyun verileri de silinir. Devam eden oyunlar etkilenebilir.')}</Text>
          <Muted>{translate('Bu işlem geri alınamaz. Cihazdaki takma adın, avatar tercihin ve oyun istatistiklerin de temizlenir.')}</Muted>
          <Text style={styles.body}>{translate('Onaylamak için aşağıdaki kelimeyi yaz:')} <Text style={styles.word}>{word}</Text></Text>
          <Input value={confirmation} onChangeText={setConfirmation} placeholder={word} autoCapitalize="characters" autoCorrect={false} editable={!busy} accessibilityLabel={translate('Silme onayı')} />
          <Btn title={translate('Kalıcı olarak sil')} icon="trash" tone="danger" disabled={confirmation.trim() !== word || busy} loading={busy} onPress={() => { void run(); }} />
        </> : <>
          <Title size={22}>{translate('Webden hesap silme')}</Title>
          <Text style={styles.body}>{translate('Bu kod, uygulamayı kaldırdıktan sonra da web sayfasından bu hesabı silebilmeni sağlar. Kodu gizli tut: kodu bilen kişi hesabını kalıcı olarak silebilir.')}</Text>
          <Muted>{translate('Kodu güvenli bir yere kaydet. Yeni kod oluşturursan önceki kod geçersiz olur. Kod hesabına giriş yapmak veya verilerini okumak için kullanılamaz.')}</Muted>
          {!!code && <Text selectable style={styles.code}>{code.match(/.{1,8}/g)?.join('-')}</Text>}
          <Btn title={code ? translate('Yeni kod oluştur') : translate('Silme kodu oluştur')} icon="key" tone="ghost" loading={busy} disabled={busy} onPress={() => { void run(); }} />
          <Btn title={translate('Hesap silme sayfasını aç')} icon="open-outline" tone="ghost" onPress={() => { void Linking.openURL('https://omurcan533.github.io/myMobileApp/delete-account.html').catch(() => setError(translate('Sayfa açılamadı. Destek adresinden bize ulaşabilirsin.'))); }} />
        </>}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Btn title={translate('Vazgeç')} tone="ghost" disabled={busy} onPress={close} />
      </Sheet>
    </View>
  );
}
const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 14, lineHeight: 22 },
  word: { color: colors.red, fontWeight: '800' },
  code: { color: colors.cyan, fontSize: 16, lineHeight: 25, fontWeight: '600' },
  error: { color: colors.red, fontSize: 14, lineHeight: 20 },
});
