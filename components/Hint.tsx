import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from './ui';
import { alpha, colors } from '../lib/theme';

/**
 * Just-in-time onboarding: kapatılabilir, tek seferlik ipucu kartı.
 */
export function Hint({ id, text }: { id: string; text: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(`hint:${id}`).then((v) => {
      if (alive && !v) setShow(true);
    });
    return () => { alive = false; };
  }, [id]);

  if (!show) return null;
  return (
    <Pressable
      onPress={() => {
        AsyncStorage.setItem(`hint:${id}`, '1');
        setShow(false);
      }}
      style={({ pressed }) => [s.bubble, pressed && { opacity: 0.8 }]}
    >
      <View style={s.iconWrap}>
        <Ionicons name="bulb" size={16} color={colors.yellow} />
      </View>
      <Text style={s.text}>{text}</Text>
      <Ionicons name="close" size={18} color={colors.subtle} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: {
    backgroundColor: alpha(colors.yellow, 0.07),
    borderRadius: 18,
    borderWidth: 1,
    borderColor: alpha(colors.yellow, 0.28),
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    marginVertical: 6,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: alpha(colors.yellow, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, color: colors.textSoft, fontWeight: '500', fontSize: 12.5, lineHeight: 18 },
});
