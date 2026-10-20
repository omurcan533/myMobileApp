import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../lib/theme';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={[colors.bg, colors.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={[{ flex: 1, paddingHorizontal: 20, paddingVertical: 12 }, style]}>{children}</SafeAreaView>
    </LinearGradient>
  );
}

type Tone = 'primary' | 'ghost' | 'danger' | 'success' | 'custom';

export function Btn({
  title, onPress, tone = 'primary', color, disabled, loading, style,
}: {
  title: string;
  onPress: () => void;
  tone?: Tone;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    tone === 'primary' ? colors.purple
    : tone === 'danger' ? colors.red
    : tone === 'success' ? colors.green
    : tone === 'custom' ? color
    : 'transparent';
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        tone === 'ghost' && { borderWidth: 2, borderColor: colors.surface2 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.btnText, tone === 'success' && { color: '#07210F' }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children, size = 28 }: { children: React.ReactNode; size?: number }) {
  return <Text style={{ color: colors.text, fontSize: size, fontWeight: '900', letterSpacing: -0.5 }}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[{ color: colors.muted, fontSize: 14, fontWeight: '600' }, style]}>{children}</Text>;
}

/** Ekranın altında kısa süre görünen bildirim. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2200);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = msg ? (
    <View style={s.toast} pointerEvents="none">
      <Text style={s.toastText}>{msg}</Text>
    </View>
  ) : null;
  return { toast: node, show };
}

/** Yumuşak "nabız" animasyonu: öne çıkan öğeler için. */
export function Pulse({ children, active = true }: { children: React.ReactNode; active?: boolean }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) { v.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1.05, duration: 600, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, v]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

export function TimerBar({
  left,
  total,
  color = colors.yellow,
  label = 'Kalan Süre',
}: {
  left: number;
  total: number;
  color?: string;
  label?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const secs = Math.ceil(Math.max(0, left));
  const isUrgent = secs <= 5;
  const activeColor = isUrgent ? colors.red : color;

  return (
    <View style={{ gap: 6, marginVertical: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '700' }}>⏱️ {label}</Text>
        <Text style={{ color: activeColor, fontSize: 16, fontWeight: '900', letterSpacing: 0.5 }}>
          {secs} sn
        </Text>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: activeColor }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  btn: { paddingVertical: 16, paddingHorizontal: 22, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, borderWidth: 1, borderColor: colors.surface2 },
  toast: { position: 'absolute', bottom: 40, left: 24, right: 24, backgroundColor: '#000C', padding: 14, borderRadius: radius.sm, alignItems: 'center' },
  toastText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  barBg: { height: 10, borderRadius: 5, backgroundColor: colors.surface2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
});
