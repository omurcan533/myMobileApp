import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={[colors.bg, colors.bg2]} style={{ flex: 1 }}>
      <SafeAreaView style={[{ flex: 1, paddingHorizontal: 22, paddingVertical: 14 }, style]}>{children}</SafeAreaView>
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
    tone === 'primary' ? colors.accent
    : tone === 'danger' ? colors.red
    : tone === 'success' ? colors.green
    : tone === 'custom' ? color
    : 'transparent';

  const isGhost = tone === 'ghost';

  const handlePress = () => {
    soundFx.click();
    haptic.light();
    onPress();
  };

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={handlePress}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] },
        isGhost && s.btnGhost,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text
          style={[
            s.btnText,
            isGhost && s.btnGhostText,
            tone === 'success' && { color: '#07210F' },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Title({ children, size = 28 }: { children: React.ReactNode; size?: number }) {
  return <Text style={[s.title, { fontSize: size }]}>{children}</Text>;
}

export function Muted({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

/** Ekranın altında kısa süre görünen bildirim (Midas Floating Pill). */
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
        Animated.timing(v, { toValue: 1.03, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
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

  const prevSecs = useRef(secs);
  useEffect(() => {
    if (isUrgent && secs > 0 && prevSecs.current !== secs) {
      soundFx.tick();
      haptic.light();
    }
    prevSecs.current = secs;
  }, [isUrgent, secs]);

  return (
    <View style={s.timerContainer}>
      <View style={s.timerHead}>
        <View style={s.timerLabelRow}>
          <Text style={{ fontSize: 13 }}>⏱️</Text>
          <Text style={s.timerLabel}>{label.toUpperCase()}</Text>
        </View>
        <View style={[s.timerBadge, isUrgent && s.timerBadgeUrgent]}>
          <Text style={[s.timerValue, { color: activeColor }]}>
            {secs}
          </Text>
          <Text style={s.timerUnit}>sn</Text>
        </View>
      </View>
      <View style={s.barBg}>
        <View style={[s.barFill, { width: `${pct * 100}%`, backgroundColor: activeColor }]} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    paddingVertical: 15,
    paddingHorizontal: 22,
    borderRadius: 100, // Midas hap buton
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: {
    backgroundColor: '#121724',
    borderWidth: 1,
    borderColor: '#242F46',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  btnGhostText: {
    color: '#8E9BAE',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    color: colors.text,
    fontWeight: '900',
    letterSpacing: -0.6,
  },
  muted: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  toast: {
    position: 'absolute',
    bottom: 36,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(13, 17, 26, 0.94)',
    borderWidth: 1,
    borderColor: '#242F46',
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  timerContainer: {
    gap: 8,
    marginVertical: 6,
    backgroundColor: '#101521',
    borderWidth: 1,
    borderColor: '#1C2436',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timerLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timerLabel: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    backgroundColor: '#161D2C',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#242F46',
  },
  timerBadgeUrgent: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.4)',
  },
  timerValue: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  timerUnit: {
    color: '#8E9BAE',
    fontSize: 11,
    fontWeight: '700',
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1A2336',
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
