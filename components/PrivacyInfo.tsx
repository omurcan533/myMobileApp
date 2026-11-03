import React, { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { colors } from '../lib/theme';
import { Btn, Card, Muted, Text, Title } from './ui';
import { translate, useLanguage } from '../lib/i18n';

export function PrivacyInfo() {
  useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [linkFailed, setLinkFailed] = useState(false);

  return (
    <Card style={{ gap: 12 }}>
      <Title size={20}>{translate('Gizlilik ve veriler')}</Title>
      <Muted>{translate('Takma adla oynasan da oyun verilerin sunucuda işlenir.')}</Muted>
      <Btn
        title={expanded ? translate('Ayrıntıları gizle') : translate('Verilerim nasıl kullanılıyor?')}
        tone="ghost"
        icon="shield-checkmark-outline"
        onPress={() => setExpanded(value => !value)}
      />
      {expanded && (
        <View style={{ gap: 12 }}>
          <Text style={styles.body}>{translate('Cihazında: takma adın, avatarın, dil ve ses tercihin, oyun istatistiklerin ve oturum bilgilerin saklanır.')}</Text>
          <Text style={styles.body}>{translate('Sunucuda: anonim kullanıcı kimliğin, oda katılımın, oyun hamlelerin, cevapların, puanların ve yazdığın mesajlar işlenir. Çevrim içi oyun için Supabase kullanılır.')}</Text>
          <Text style={styles.body}>{translate('Diğer oyuncular: odadaki takma adını, avatarını ve oyunda paylaştığın içerikleri görebilir. Açık oda listesi oda kodunu ve kurucunun takma adını gösterir.')}</Text>
          <Text style={styles.body}>{translate('Kişisel sorular: oda kurucusu bu isteğe bağlı özelliği açarsa yanıtların odada paylaşılır ve hafıza oyunlarında kullanılabilir. Paylaşmak istemediğin bilgileri yazma; özelliğin kapatılmasını isteyebilirsin.')}</Text>
          <Muted>{translate('Uygulamayı kaldırmak veya cihaz verilerini temizlemek, sunucudaki anonim hesabını ve oyun kayıtlarını otomatik olarak silmez.')}</Muted>
        </View>
      )}
      <Btn
        title={translate('Destek ve iletişim')}
        tone="ghost"
        icon="help-circle-outline"
        onPress={() => {
          setLinkFailed(false);
          void Linking.openURL('https://omurcan533.github.io/myMobileApp/support.html')
            .catch(() => setLinkFailed(true));
        }}
      />
      <Text selectable style={styles.body}>yilmazomurcan@gmail.com</Text>
      {linkFailed && <Muted>{translate('Sayfa açılamadı. Yukarıdaki e-posta adresinden bize ulaşabilirsin.')}</Muted>}
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.text, fontSize: 14, lineHeight: 22 },
});
