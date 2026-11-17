import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/theme';
import { Card, Title } from './ui';

export function ProfileSection({ title, collapsible = true, children }: {
  title: string;
  collapsible?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card style={styles.card}>
      {collapsible ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(value => !value)}
          style={styles.header}
        >
          <Title size={20} style={styles.title}>{title}</Title>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.cyan} />
        </Pressable>
      ) : (
        <Title size={20}>{title}</Title>
      )}
      {(!collapsible || expanded) && children}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1 },
});
