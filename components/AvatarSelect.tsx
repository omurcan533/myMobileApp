import { translate, useLanguage } from '../lib/i18n';
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Avatar, Btn, Card, Eyebrow, Screen, Tap, Text, Title } from './ui';
import { AVATAR_OPTIONS, AvatarId } from '../lib/art';
import { colors, alpha } from '../lib/theme';

export function AvatarSelect({ selected, onSelect, onContinue }: { selected: AvatarId; onSelect: (id: AvatarId) => void; onContinue: () => void }) {
  useLanguage();
  return (
    <Screen>
      <View style={styles.body}>
        <Eyebrow color={colors.cyan}>{translate("Oyuncu profili")}</Eyebrow>
        <Title size={27}>{translate("Avatarını seç")}</Title>
        <Text style={styles.help}>{translate("Oyun odasında arkadaşların seçtiğin avatarı görecek.")}</Text>
        <Card style={styles.grid}>
          {AVATAR_OPTIONS.map((option) => (
            <Tap key={option.id} onPress={() => onSelect(option.id)} style={[styles.item, selected === option.id && styles.selected]}>
              <Avatar source={option.source} size={64} ring={selected === option.id ? colors.cyan : colors.borderLight} />
              <Text style={styles.label}>{option.label}</Text>
            </Tap>
          ))}
        </Card>
        <Btn title={translate("Devam Et")} icon="checkmark-circle" onPress={onContinue} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 16 },
  help: { color: colors.muted, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  item: { alignItems: 'center', gap: 7, borderWidth: 2, borderColor: colors.border, borderRadius: 16, padding: 8 },
  selected: { borderColor: colors.cyan, backgroundColor: alpha(colors.cyan, 0.12) },
  label: { color: colors.text, fontWeight: '700' },
});
