import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { translate } from '../lib/i18n';
import { colors } from '../lib/theme';
import { Muted, Text } from './ui';

export function GameInstructions({ text, color }: { text: string; color: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(value => !value)}
        style={styles.toggle}
      >
        <Text style={[styles.label, { color }]}>{translate("Oyun Açıklaması")}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={color} />
      </Pressable>
      {expanded && <Muted style={styles.instructions}>{text}</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  toggle: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  label: { flex: 1, fontWeight: '800' },
  instructions: { paddingHorizontal: 12, paddingBottom: 12, lineHeight: 20 },
});
