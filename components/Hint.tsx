import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, radius } from '../lib/theme';

/**
 * Just-in-time onboarding: ilk karşılaşmada tek cümlelik balon, dokununca bir daha çıkmaz.
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
      style={s.bubble}
    >
      <Text style={s.text}>💡 {text}</Text>
      <Text style={s.skip}>Geç ✕</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: {
    backgroundColor: colors.yellow, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 6,
  },
  text: { flex: 1, color: '#2B2200', fontWeight: '800', fontSize: 14 },
  skip: { color: '#2B2200', fontWeight: '700', fontSize: 12, opacity: 0.7 },
});
