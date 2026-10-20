import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Just-in-time onboarding: Midas tarzı zarif ipucu rozeti.
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
      <Text style={s.icon}>💡</Text>
      <Text style={s.text}>{text}</Text>
      <Text style={s.skip}>✕</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  bubble: {
    backgroundColor: '#101521',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1E283A',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 8,
  },
  icon: { fontSize: 15 },
  text: { flex: 1, color: '#94A3B8', fontWeight: '600', fontSize: 13, lineHeight: 18 },
  skip: { color: '#64748B', fontWeight: '700', fontSize: 13, paddingHorizontal: 4 },
});
