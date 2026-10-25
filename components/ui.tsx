import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, GestureResponderEvent, Image, ImageBackground, ImageSourcePropType, LayoutChangeEvent,
  Modal, Platform, Pressable, PressableProps,
  StyleProp, StyleSheet, Text as RNText, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, colors, gradients, radius } from '../lib/theme';
import { art } from '../lib/art';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Grad = readonly [string, string];

// ============================================================================
// Metin: fontWeight -> özel font ailesi eşlemesi (Android'de sahte kalın yok)
// ============================================================================
const BODY: Record<string, string> = {
  '300': 'Sora_400Regular', '400': 'Sora_400Regular', '500': 'Sora_500Medium', '600': 'Sora_600SemiBold',
  '700': 'Sora_700Bold', '800': 'Sora_700Bold', '900': 'Sora_700Bold', bold: 'Sora_700Bold', normal: 'Sora_400Regular',
};
const DISPLAY: Record<string, string> = {
  '300': 'Outfit_600SemiBold', '400': 'Outfit_600SemiBold', '500': 'Outfit_600SemiBold', '600': 'Outfit_600SemiBold',
  '700': 'Outfit_700Bold', '800': 'Outfit_800ExtraBold', '900': 'Outfit_900Black', bold: 'Outfit_700Bold', normal: 'Outfit_600SemiBold',
};

/** Uygulama geneli Text. `display` → Outfit (başlık/sayı), aksi halde Sora. */
export function Text({ display, style, ...rest }: TextProps & { display?: boolean }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const w = String(flat.fontWeight ?? '500');
  const family = flat.fontFamily ?? (display ? DISPLAY[w] ?? DISPLAY['700'] : BODY[w] ?? BODY['500']);
  return <RNText {...rest} style={[style, { fontFamily: family, fontWeight: undefined }]} />;
}

// ============================================================================
// Ekran iskeleti
// ============================================================================
/**
 * Mobil web'de sanal klavye açılınca içerik alanı, tarayıcının GERÇEK görünür alanına
 * (visualViewport yüksekliği + üst kayması) küçültülür. Böylece odaklanan input ve altındaki
 * kartlar klavyenin altında kalmaz; kapanışta alan tek bir CSS geçişiyle yumuşakça genişler.
 */
const KB_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** Shared, in-flow wall clock header for every Screen. */
function ScreenClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setTime(new Date());
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);
  const value = [time.getHours(), time.getMinutes(), time.getSeconds()]
    .map((part) => String(part).padStart(2, '0')).join(':');
  return (
    <View pointerEvents="none" style={screenClockStyles.row}>
      <View style={screenClockStyles.badge}>
        <Ionicons name="time-outline" size={13} color={colors.cyan} />
        <Text style={screenClockStyles.text}>{value}</Text>
      </View>
    </View>
  );
}

const screenClockStyles = StyleSheet.create({
  row: { height: 38, flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(10, 20, 39, 0.92)', borderWidth: 1, borderColor: 'rgba(100, 210, 255, 0.35)' },
  text: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'Sora_600SemiBold' },
});

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const [outerH, setOuterH] = useState(0);
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null); // null = klavye kapalı

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vp = window.visualViewport;
    const update = () => {
      const covered = window.innerHeight - vp.height;
      if (covered > 120) {
        const h = Math.round(vp.height);
        const top = Math.round(vp.offsetTop);
        setVv((p) => (p && p.h === h && p.top === top ? p : { h, top }));
      } else {
        setVv((p) => (p === null ? p : null));
      }
    };
    update();
    vp.addEventListener('resize', update);
    vp.addEventListener('scroll', update);
    return () => {
      vp.removeEventListener('resize', update);
      vp.removeEventListener('scroll', update);
    };
  }, []);

  const isIosWeb =
    Platform.OS === 'web' &&
    typeof navigator !== 'undefined' &&
    /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const topPad = Math.max(insets.top, isIosWeb ? 48 : Platform.OS === 'web' ? 16 : 8);
  const userStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const bottomPad = userStyle.paddingBottom !== undefined
    ? Number(userStyle.paddingBottom)
    : Math.max(insets.bottom, isIosWeb ? 24 : 8);

  // Ölçü alınana kadar (ve native'de) klasik flex:1; web'de ölçüden sonra piksel yüksekliği (geçiş animasyonu için).
  const areaStyle: ViewStyle =
    Platform.OS === 'web' && outerH > 0
      ? ({
          position: 'absolute',
          left: 0,
          right: 0,
          top: vv ? vv.top : 0,
          height: vv ? Math.min(vv.h, outerH) : outerH,
          transition: `height 380ms ${KB_EASE}`,
        } as ViewStyle)
      : { flex: 1 };

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bg, overflow: 'hidden' }}
      onLayout={(e) => setOuterH(Math.round(e.nativeEvent.layout.height))}
    >
      <ImageBackground source={art.bg} resizeMode="cover" style={StyleSheet.absoluteFill} imageStyle={{ opacity: 0.6 }} />
      <LinearGradient
        colors={['rgba(5,10,20,0.5)', 'rgba(5,10,20,0.8)', 'rgba(5,10,20,0.95)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <SafeAreaView
        style={[
          { paddingHorizontal: 18, paddingTop: topPad, paddingBottom: bottomPad },
          areaStyle,
          style,
        ]}
      >
        <ScreenClock />
        {children}
      </SafeAreaView>
    </View>
  );
}

// ============================================================================
// Animasyonlar
// ============================================================================
/** Yumuşak "nabız" animasyonu: öne çıkan öğeler için.
 * Kart ve kutuların (div) nefes alırken ekranın sağına/soluna taşmasını kesinlikle engellemek için,
 * nabız hareketi 1.0 tepe noktasından hafifçe içeriye doğru nefes alır (1.0 -> 0.975 -> 1.0).
 * Böylece öğe hiçbir zaman 1.0 ölçeğini aşmaz ve ekran marjları içinde kalır.
 */
export function Pulse({
  children,
  active = true,
  amount = 1.025,
  style,
}: {
  children: React.ReactNode;
  active?: boolean;
  amount?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const [v] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!active) { v.setValue(1); return; }
    // amount > 1 ise (örn: 1.025 veya 1.03), dışa doğru balonlaşıp sağdan/soldan taşmak yerine
    // 1.0 ile hafifçe içe doğru nefes aldırır (örn: 0.975 - 1.0).
    const minScale = amount > 1 ? Math.max(0.95, 1 - (amount - 1)) : amount;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: minScale, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, amount, v]);
  return <Animated.View style={[{ transform: [{ scale: v }] }, style]}>{children}</Animated.View>;
}

/** Açılışta aşağıdan yukarı süzülerek belirir. */
export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 480, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [delay, v]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}

/** Havada asılı gibi yavaşça süzülen içerik (maskotlar için). */
export function Float({ children, amount = 7, duration = 2200, style }: { children: React.ReactNode; amount?: number; duration?: number; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [duration, v]);
  return (
    <Animated.View style={[style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -amount] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Canlı durum noktası (nabız atar). */
export function LiveDot({ color = colors.mint, size = 8 }: { color?: string; size?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: size * 2.2, height: size * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute', width: size, height: size, borderRadius: size, backgroundColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

// ============================================================================
// Dokunma efekti: dokunulan noktadan yayılan dalga + halka + kıvılcımlar + parıltı
// ============================================================================
type RippleItem = { id: number; x: number; y: number; v: Animated.Value };
const SPARKS = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i / 6) * Math.PI * 2 + 0.4;
  return { dx: Math.cos(a), dy: Math.sin(a), d: 24 + (i % 3) * 10 };
});
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
let rippleSeq = 0;

function useRipple(color: string, accent: string, borderRadius: number) {
  const [ripples, setRipples] = useState<RippleItem[]>([]);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [flash] = useState(() => new Animated.Value(0));
  const [node, setNode] = useState<View | null>(null);

  const spawn = (x: number, y: number) => {
    const id = rippleSeq++;
    const v = new Animated.Value(0);
    setRipples((r) => [...r.slice(-2), { id, x, y, v }]);
    Animated.timing(v, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() =>
      setRipples((r) => r.filter((i) => i.id !== id)),
    );
  };

  const onPressIn = (e: GestureResponderEvent) => {
    const { pageX, pageY } = e.nativeEvent;
    Animated.timing(flash, { toValue: 1, duration: 90, useNativeDriver: true }).start();
    const center = () => spawn(box.w / 2, box.h / 2);
    if (node && typeof node.measureInWindow === 'function' && typeof pageX === 'number') {
      node.measureInWindow((x, y) => {
        const px = pageX - x;
        const py = pageY - y;
        if (Number.isFinite(px) && Number.isFinite(py)) spawn(clamp(px, 0, box.w), clamp(py, 0, box.h));
        else center();
      });
    } else {
      center();
    }
  };

  const onPressOut = () => {
    Animated.timing(flash, { toValue: 0, duration: 340, useNativeDriver: true }).start();
  };

  const onLayout = (e: LayoutChangeEvent) =>
    setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });

  const D = Math.max(60, Math.hypot(box.w, box.h) * 2);
  const layer = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius, overflow: 'hidden' }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: flash.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }) }]}
      />
      {ripples.map((r) => (
        <React.Fragment key={r.id}>
          <Animated.View
            style={{
              position: 'absolute', left: r.x - D / 2, top: r.y - D / 2, width: D, height: D, borderRadius: D / 2,
              backgroundColor: color,
              opacity: r.v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] }),
              transform: [{ scale: r.v.interpolate({ inputRange: [0, 1], outputRange: [0.03, 1] }) }],
            }}
          />
          <Animated.View
            style={{
              position: 'absolute', left: r.x - D / 2, top: r.y - D / 2, width: D, height: D, borderRadius: D / 2,
              borderWidth: 2, borderColor: accent,
              opacity: r.v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.8, 0] }),
              transform: [{ scale: r.v.interpolate({ inputRange: [0, 1], outputRange: [0.03, 0.7] }) }],
            }}
          />
          {SPARKS.map((sp, i) => (
            <Animated.View
              key={i}
              style={{
                position: 'absolute', left: r.x - 2.5, top: r.y - 2.5, width: 5, height: 5, borderRadius: 2.5, backgroundColor: accent,
                opacity: r.v.interpolate({ inputRange: [0, 0.1, 0.7, 1], outputRange: [0, 1, 0.6, 0] }),
                transform: [
                  { translateX: r.v.interpolate({ inputRange: [0, 1], outputRange: [0, sp.dx * sp.d] }) },
                  { translateY: r.v.interpolate({ inputRange: [0, 1], outputRange: [0, sp.dy * sp.d] }) },
                  { scale: r.v.interpolate({ inputRange: [0, 1], outputRange: [1.2, 0.2] }) },
                ],
              }}
            />
          ))}
        </React.Fragment>
      ))}
    </View>
  );

  return { attach: setNode, layer, onLayout, onPressIn, onPressOut };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/* eslint-disable react-hooks/refs -- useRipple React ref kullanmaz (state tabanlı callback ref); derleyici yanlış pozitif veriyor */

/**
 * Dokunma geri bildirimli Pressable: yaylı basılma + dokunulan noktadan dalga/halka/kıvılcım.
 * Her tıklanabilir kart/çip/buton için `Pressable` yerine kullanılır.
 */
export function Tap({
  children, style, onPress, onPressIn, onPressOut, color = 'rgba(255,255,255,0.3)', accent = '#FFFFFF', scaleTo = 0.93, ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; color?: string; accent?: string; scaleTo?: number;
}) {
  const [pressAnim] = useState(() => new Animated.Value(0));
  const flat = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const rp = useRipple(color, accent, typeof flat.borderRadius === 'number' ? flat.borderRadius : 0);
  const spring = (to: number) =>
    Animated.spring(pressAnim, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 5 }).start();

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, scaleTo] });
  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 3] });

  return (
    <AnimatedPressable
      {...rest}
      ref={rp.attach as any}
      onLayout={rp.onLayout}
      onPress={onPress}
      onPressIn={(e: GestureResponderEvent) => { spring(1); rp.onPressIn(e); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { spring(0); rp.onPressOut(); onPressOut?.(e); }}
      style={[style, { transform: [{ scale }, { translateY }] }] as any}
    >
      {children}
      {rp.layer}
    </AnimatedPressable>
  );
}

// ============================================================================
// Butonlar
// ============================================================================
type Tone = 'primary' | 'success' | 'danger' | 'gold' | 'violet' | 'ghost' | 'custom';
type BtnSize = 'lg' | 'md' | 'sm';

const TONES: Record<Exclude<Tone, 'ghost' | 'custom'>, { g: Grad; fg: string; glow: string }> = {
  primary: { g: gradients.primary, fg: '#04122A', glow: colors.cyan },
  success: { g: gradients.success, fg: '#05281A', glow: colors.mint },
  danger: { g: gradients.danger, fg: '#FFFFFF', glow: colors.red },
  gold: { g: gradients.gold, fg: '#3A2100', glow: colors.gold },
  violet: { g: gradients.violet, fg: '#FFFFFF', glow: colors.violet },
};
const SIZES = {
  lg: { h: 58, font: 16, icon: 20, px: 24 },
  md: { h: 48, font: 14, icon: 18, px: 18 },
  sm: { h: 38, font: 12.5, icon: 16, px: 14 },
};

export function Btn({
  title, onPress, tone = 'primary', color, disabled, loading, style, icon, size = 'lg',
}: {
  title: string;
  onPress: () => void;
  tone?: Tone;
  color?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  icon?: IconName;
  size?: BtnSize;
}) {
  const [pressAnim] = useState(() => new Animated.Value(0));
  const sz = SIZES[size];
  const isGhost = tone === 'ghost';
  const cfg = tone === 'custom'
    ? { g: [color ?? colors.accent, color ?? colors.accent] as Grad, fg: '#FFFFFF', glow: color ?? colors.accent }
    : isGhost ? null : TONES[tone];

  const press = (to: number) =>
    Animated.spring(pressAnim, { toValue: to, useNativeDriver: true, speed: 50, bounciness: 4 }).start();

  const handlePress = () => {
    soundFx.click();
    haptic.light();
    onPress();
  };

  const scale = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });
  const translateY = pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] });

  const fg = cfg ? cfg.fg : colors.textSoft;
  const rp = useRipple(cfg ? 'rgba(255,255,255,0.4)' : alpha(colors.cyan, 0.32), cfg ? '#FFFFFF' : colors.cyan, radius.full);

  return (
    <Animated.View
      style={[
        {
          transform: [{ scale }, { translateY }],
          opacity: disabled ? 0.45 : 1,
          borderRadius: radius.full,
        },
        cfg && {
          shadowColor: cfg.glow,
          shadowOpacity: 0.55,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: disabled ? 0 : 8,
        },
        style,
      ]}
    >
      <Pressable
        ref={rp.attach}
        onLayout={rp.onLayout}
        disabled={disabled || loading}
        onPress={handlePress}
        onPressIn={(e) => { press(1); rp.onPressIn(e); }}
        onPressOut={() => { press(0); rp.onPressOut(); }}
        style={{ borderRadius: radius.full, overflow: 'hidden', backgroundColor: 'transparent' }}
      >
        {cfg ? (
          <LinearGradient colors={cfg.g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.btn, { height: sz.h, paddingHorizontal: sz.px }]}>
            <View style={s.btnInner}>
              {loading ? <ActivityIndicator color={fg} /> : (
                <>
                  {icon && <Ionicons name={icon} size={sz.icon} color={fg} />}
                  <Text display style={{ color: fg, fontSize: sz.font + 1, fontWeight: '800', letterSpacing: 0.3 }}>{title}</Text>
                </>
              )}
            </View>
          </LinearGradient>
        ) : (
          <View style={[s.btn, s.btnGhost, { height: sz.h, paddingHorizontal: sz.px }]}>
            <View style={s.btnInner}>
              {loading ? <ActivityIndicator color={fg} /> : (
                <>
                  {icon && <Ionicons name={icon} size={sz.icon} color={fg} />}
                  <Text display style={{ color: fg, fontSize: sz.font + 1, fontWeight: '700', letterSpacing: 0.2 }}>{title}</Text>
                </>
              )}
            </View>
          </View>
        )}
        {rp.layer}
      </Pressable>
    </Animated.View>
  );
}

/* eslint-enable react-hooks/refs */

/** Yuvarlak cam ikon butonu. */
export function IconBtn({
  icon, onPress, size = 44, color = colors.textSoft, disabled, active, badge, style,
}: {
  icon: IconName; onPress: () => void; size?: number; color?: string; disabled?: boolean; active?: boolean; badge?: number | string; style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tap
      disabled={disabled}
      onPress={() => { soundFx.click(); haptic.light(); onPress(); }}
      color={alpha(colors.cyan, 0.35)}
      accent={colors.cyan}
      scaleTo={0.86}
      style={[
        s.iconBtn,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.35 : 1 },
        active && { backgroundColor: alpha(colors.cyan, 0.18), borderColor: alpha(colors.cyan, 0.55) },
        style,
      ]}
    >
      <Ionicons name={icon} size={size * 0.46} color={active ? colors.cyan : color} />
      {badge !== undefined && (
        <View style={s.iconBadge}><Text style={s.iconBadgeText}>{badge}</Text></View>
      )}
    </Tap>
  );
}

// ============================================================================
// Kartlar & düzen
// ============================================================================
/** Cam panel kart. `accent` verilirse kenarlık ve üst parıltı o renkte olur. */
export function Card({
  children, style, accent, gradient,
}: { children: React.ReactNode; style?: StyleProp<ViewStyle>; accent?: string; gradient?: Grad }) {
  const border = accent ? alpha(accent, 0.4) : colors.border;
  return (
    <View style={[s.card, { borderColor: border, shadowColor: accent ?? '#000' }, accent && s.cardGlow, style]}>
      <LinearGradient
        colors={gradient ?? [accent ? alpha(accent, 0.16) : 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0)']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.7 }}
        style={s.cardSheen}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

export function Title({ children, size = 28, color, style }: { children: React.ReactNode; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return (
    <Text display style={[{ color: color ?? colors.text, fontWeight: '800', letterSpacing: -0.4, fontSize: size, lineHeight: size * 1.15 }, style]}>
      {children}
    </Text>
  );
}

export function Muted({ children, style, numberOfLines }: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text numberOfLines={numberOfLines} style={[{ color: colors.muted, fontSize: 13, fontWeight: '500', lineHeight: 19 }, style]}>
      {children}
    </Text>
  );
}

/** Küçük, harf aralıklı üst başlık (opsiyonel canlı nokta ile). */
export function Eyebrow({ children, color = colors.muted, dot, live, icon, style }: {
  children: React.ReactNode; color?: string; dot?: string; live?: boolean; icon?: IconName; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 6 }, style]}>
      {live && <LiveDot color={dot ?? colors.mint} size={6} />}
      {!live && dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />}
      {icon && <Ionicons name={icon} size={13} color={color} />}
      <Text style={{ color, fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' }}>{children}</Text>
    </View>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
      <Eyebrow color={colors.subtle}>{children}</Eyebrow>
      {right}
    </View>
  );
}

/** Tint'li hap rozet. */
export function Chip({ label, icon, color = colors.muted, solid, style, size = 'md' }: {
  label?: string; icon?: IconName; color?: string; solid?: boolean; style?: StyleProp<ViewStyle>; size?: 'sm' | 'md';
}) {
  const pad = size === 'sm' ? { paddingHorizontal: 8, paddingVertical: 3 } : { paddingHorizontal: 11, paddingVertical: 5 };
  return (
    <View
      style={[
        s.chip, pad,
        { backgroundColor: solid ? color : alpha(color, 0.14), borderColor: solid ? color : alpha(color, 0.38) },
        style,
      ]}
    >
      {icon && <Ionicons name={icon} size={size === 'sm' ? 11 : 13} color={solid ? '#0A1020' : color} />}
      {label !== undefined && (
        <Text style={{ color: solid ? '#0A1020' : color, fontSize: size === 'sm' ? 10.5 : 12, fontWeight: '700', letterSpacing: 0.2 }}>{label}</Text>
      )}
    </View>
  );
}

// ============================================================================
// Para birimleri & avatar
// ============================================================================
export function CoinIcon({ size = 22 }: { size?: number }) {
  return (
    <LinearGradient
      colors={gradients.gold}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
        borderWidth: Math.max(1.5, size * 0.08), borderColor: '#FFE9A0',
        shadowColor: colors.gold, shadowOpacity: 0.7, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View style={{ width: size * 0.66, height: size * 0.66, borderRadius: size, borderWidth: 1.2, borderColor: 'rgba(120,64,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="star" size={size * 0.42} color="#8A4B00" />
      </View>
    </LinearGradient>
  );
}

export function GemIcon({ size = 18, color = colors.cyan }: { size?: number; color?: string }) {
  return (
    <View style={{ shadowColor: color, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } }}>
      <Ionicons name="diamond" size={size} color={color} />
    </View>
  );
}

/** Altın kredi rozeti. */
export function CoinPill({ value, label, size = 'md' }: { value: number | string; label?: string; size?: 'sm' | 'md' }) {
  const small = size === 'sm';
  return (
    <View style={[s.pill, { backgroundColor: alpha(colors.gold, 0.12), borderColor: alpha(colors.gold, 0.4), paddingVertical: small ? 3 : 5, paddingRight: small ? 9 : 12 }]}>
      <CoinIcon size={small ? 17 : 22} />
      <Text display style={{ color: colors.yellow, fontSize: small ? 13 : 15, fontWeight: '800' }}>{value}</Text>
      {label && <Text style={{ color: alpha(colors.yellow, 0.7), fontSize: 11, fontWeight: '600' }}>{label}</Text>}
    </View>
  );
}

export function GemPill({ value, label }: { value: number | string; label?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: alpha(colors.cyan, 0.1), borderColor: alpha(colors.cyan, 0.38), paddingVertical: 5, paddingRight: 12 }]}>
      <GemIcon size={18} />
      <Text display style={{ color: colors.cyan, fontSize: 15, fontWeight: '800' }}>{value}</Text>
      {label && <Text style={{ color: alpha(colors.cyan, 0.7), fontSize: 11, fontWeight: '600' }}>{label}</Text>}
    </View>
  );
}

/** Yuvarlak maskot avatarı (renkli halka + parıltı). */
export function Avatar({ source, size = 44, ring = colors.cyan, glow = true, style }: {
  source: ImageSourcePropType; size?: number; ring?: string; glow?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const w = Math.max(2, size * 0.055);
  return (
    <View
      style={[
        {
          width: size, height: size, borderRadius: size / 2, borderWidth: w, borderColor: ring, overflow: 'hidden', backgroundColor: colors.surface2,
        },
        glow && { shadowColor: ring, shadowOpacity: 0.7, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
        style,
      ]}
    >
      <Image source={source} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
    </View>
  );
}

// ============================================================================
// İlerleme & zaman
// ============================================================================
export function ProgressBar({ pct, colors: g = gradients.primary, height = 10, duration = 600, style }: {
  pct: number; colors?: Grad; height?: number; duration?: number; style?: StyleProp<ViewStyle>;
}) {
  const [v] = useState(() => new Animated.Value(pct));
  useEffect(() => {
    Animated.timing(v, { toValue: Math.max(0, Math.min(1, pct)), duration, easing: Easing.linear, useNativeDriver: false }).start();
  }, [pct, duration, v]);
  return (
    <View style={[{ height, borderRadius: height, backgroundColor: colors.inset, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }, style]}>
      <Animated.View style={{ height: '100%', width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }}>
        <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: height }}>
          <View style={{ position: 'absolute', top: 1, left: 4, right: 4, height: height * 0.32, borderRadius: height, backgroundColor: 'rgba(255,255,255,0.28)' }} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export function TimerBar({
  left, total, color, label = 'Kalan Süre',
}: {
  left: number; total: number; color?: string; label?: string;
}) {
  const pct = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const secs = Math.ceil(Math.max(0, left));
  const isUrgent = secs <= 5;
  const base = color ?? colors.cyan;
  const activeColor = isUrgent ? colors.red : base;
  const grad: Grad = isUrgent ? gradients.danger : [alpha(base, 0.9), base];

  const prevSecs = useRef(secs);
  useEffect(() => {
    if (isUrgent && secs > 0 && prevSecs.current !== secs) {
      soundFx.tick();
      haptic.light();
    }
    prevSecs.current = secs;
  }, [isUrgent, secs]);

  return (
    <Card accent={isUrgent ? colors.red : undefined} style={s.timer}>
      <View style={s.timerHead}>
        <View style={s.timerLabelRow}>
          <View style={[s.timerIcon, { backgroundColor: alpha(activeColor, 0.16), borderColor: alpha(activeColor, 0.4) }]}>
            <Ionicons name={isUrgent ? 'alarm' : 'timer-outline'} size={16} color={activeColor} />
          </View>
          <Text style={s.timerLabel}>{label.toUpperCase()}</Text>
        </View>
        <Pulse active={isUrgent} amount={1.12}>
          <View style={s.timerBadge}>
            <Text display style={{ color: activeColor, fontSize: 26, fontWeight: '900', lineHeight: 28, textShadowColor: alpha(activeColor, 0.6), textShadowRadius: 10 }}>{secs}</Text>
            <Text style={s.timerUnit}>sn</Text>
          </View>
        </Pulse>
      </View>
      <ProgressBar pct={pct} colors={grad} height={9} duration={1000} />
    </Card>
  );
}

// ============================================================================
// Giriş alanı
// ============================================================================
export function Input({ icon, style, containerStyle, center, onFocus, onBlur, ...rest }: TextInputProps & {
  icon?: IconName; containerStyle?: StyleProp<ViewStyle>; center?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  const requestedFontSize = StyleSheet.flatten(style)?.fontSize;
  const webFontSize = typeof requestedFontSize === 'number' ? Math.max(20, requestedFontSize) : 20;
  return (
    <View
      style={[
        s.input,
        focus && { borderColor: alpha(colors.cyan, 0.7), shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
        containerStyle,
      ]}
    >
      {icon && <Ionicons name={icon} size={19} color={focus ? colors.cyan : colors.subtle} />}
      <TextInput
        placeholderTextColor={colors.subtle}
        selectionColor={colors.cyan}
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          onFocus?.(e);
        }}
        onBlur={(e) => { setFocus(false); onBlur?.(e); }}
        style={[
          {
            flex: 1,
            color: colors.text,
            fontSize: 16,
            fontFamily: 'Sora_600SemiBold',
            paddingVertical: Platform.OS === 'ios' ? 15 : 12,
            ...(Platform.OS === 'web' ? ({ outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' } as any) : {}),
          },
          center && { textAlign: 'center' },
          style,
          Platform.OS === 'web' && { fontSize: webFontSize },
        ]}
      />
    </View>
  );
}

// ============================================================================
// Alt sekme çubuğu (Tap-2-Earn tarzı yüzen cam hap)
// ============================================================================
export interface TabItem<K extends string> { key: K; label: string; icon: IconName; iconActive?: IconName }

const TAB_ITEM_WIDTH = 100;

/** Sekme ikonu: aktif olunca yaylanarak büyür ve hafifçe sallanır. */
function TabIcon({ on, name, size = 22 }: { on: boolean; name: IconName; size?: number }) {
  const [v] = useState(() => new Animated.Value(on ? 1 : 0));
  useEffect(() => {
    if (!on) { v.setValue(0); return; }
    v.setValue(0);
    Animated.spring(v, { toValue: 1, friction: 3.4, tension: 150, useNativeDriver: true }).start();
  }, [on, v]);
  return (
    <Animated.View
      style={{
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [5, -1] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.12] }) },
          { rotate: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-14deg', '8deg', '0deg'] }) },
        ],
      }}
    >
      <Ionicons name={name} size={size} color={on ? colors.cyan : colors.muted} />
    </Animated.View>
  );
}

export function TabBar<K extends string>({ items, active, onChange }: { items: TabItem<K>[]; active: K; onChange: (k: K) => void }) {
  const insets = useSafeAreaInsets();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const activeIdx = Math.max(0, items.findIndex((it) => it.key === active));
  const [slideAnim] = useState(() => new Animated.Value(activeIdx));
  const [scaleAnim] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: activeIdx,
        useNativeDriver: false,
        tension: 65,
        friction: 8,
      }),
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: false }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: false }),
      ]),
    ]).start();
  }, [activeIdx, slideAnim, scaleAnim]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && typeof window !== 'undefined') {
      const viewport = window.visualViewport;
      if (!viewport) return;

      let baselineHeight = Math.max(window.innerHeight, viewport.height);
      let keyboardVisible = false;
      const updateFromViewport = () => {
        const visibleHeight = viewport.height;
        if (!keyboardVisible && visibleHeight > baselineHeight) baselineHeight = visibleHeight;
        keyboardVisible = baselineHeight - visibleHeight > 120;
        setIsKeyboardOpen(keyboardVisible);
      };
      const onFocusIn = (e: FocusEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') {
          keyboardVisible = true;
          setIsKeyboardOpen(true);
        }
      };
      const onFocusOut = () => {
        keyboardVisible = false;
        setIsKeyboardOpen(false);
      };
      viewport.addEventListener('resize', updateFromViewport);
      window.addEventListener('resize', updateFromViewport);
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('focusout', onFocusOut);
      return () => {
        viewport.removeEventListener('resize', updateFromViewport);
        window.removeEventListener('resize', updateFromViewport);
        document.removeEventListener('focusin', onFocusIn);
        document.removeEventListener('focusout', onFocusOut);
      };
    }
  }, []);

  const [tabOpacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.timing(tabOpacity, {
      toValue: isKeyboardOpen ? 0 : 1,
      duration: isKeyboardOpen ? 180 : 340,
      easing: isKeyboardOpen ? Easing.out(Easing.quad) : Easing.bezier(0.25, 0.1, 0.25, 1),
      useNativeDriver: true,
    }).start();
  }, [isKeyboardOpen, tabOpacity]);

  const leftPos = slideAnim.interpolate({
    inputRange: [0, Math.max(1, items.length - 1)],
    outputRange: [6, 6 + (items.length - 1) * (TAB_ITEM_WIDTH + 6)],
  });

  return (
    <Animated.View
      style={[
        s.tabWrap,
        {
          bottom: Math.max(insets.bottom, 12) + 6,
          opacity: tabOpacity,
          transform: [
            {
              translateY: tabOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [24, 0],
              }),
            },
          ],
        },
      ]}
      pointerEvents={isKeyboardOpen ? 'none' : 'box-none'}
    >
      <View style={s.tabBar}>
        <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={['rgba(10,22,46,0.92)', 'rgba(6,12,28,0.98)']}
          style={StyleSheet.absoluteFill}
        />

        {/* Akıcı Kayan Gösterge (Sliding Glow Pill) */}
        <Animated.View
          style={[
            s.tabIndicator,
            {
              left: leftPos,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(0, 229, 255, 0.35)', 'rgba(168, 85, 247, 0.22)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.indicatorSheen} />
        </Animated.View>

        {items.map((it) => {
          const on = it.key === active;
          return (
            <Tap
              key={it.key}
              color={alpha(colors.cyan, 0.3)}
              accent={colors.cyan}
              scaleTo={0.9}
              onPress={() => {
                if (!on) {
                  soundFx.click();
                  haptic.light();
                  onChange(it.key);
                }
              }}
              style={s.tabItem}
            >
              <TabIcon on={on} name={on ? it.iconActive ?? it.icon : it.icon} />
              <Text
                style={[
                  s.tabLabel,
                  on ? { color: colors.text, fontWeight: '800' } : { color: colors.subtle },
                ]}
              >
                {it.label}
              </Text>
            </Tap>
          );
        })}
      </View>
    </Animated.View>
  );
}

// ============================================================================
// Modal / alt sayfa
// ============================================================================
export function Sheet({ visible, onClose, children, centered }: {
  visible: boolean; onClose: () => void; children: React.ReactNode; centered?: boolean;
}) {
  return (
    <Modal visible={visible} transparent animationType={centered ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View style={[s.backdrop, centered ? { justifyContent: 'center', padding: 24 } : { justifyContent: 'flex-end' }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={centered ? s.dialog : s.sheet}>
          {!centered && <View style={s.handle} />}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function RoomExitButton({ onExit }: { onExit: () => Promise<void> }) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  const leave = async () => {
    setBusy(true);
    try {
      await onExit();
      setVisible(false);
    } catch (error) {
      show((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <IconBtn icon="exit-outline" size={38} color={colors.red} onPress={() => setVisible(true)} />
      <Sheet visible={visible} centered onClose={() => setVisible(false)}>
        <View style={{ gap: 14 }}>
          <Title size={22}>Oyundan ayrıl?</Title>
          <Muted>Odadan çıkacaksın. Kurucuysan oda başka bir oyuncuya devredilir.</Muted>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
            <Btn title="Vazgeç" tone="ghost" size="md" onPress={() => setVisible(false)} />
            <Btn title="Odadan Ayrıl" tone="danger" size="md" loading={busy} onPress={leave} />
          </View>
        </View>
      </Sheet>
      {toast}
    </>
  );
}

// ============================================================================
// Toast
// ============================================================================
export type ToastKind = 'info' | 'success' | 'error';
const TOAST_ICON: Record<ToastKind, { icon: IconName; color: string }> = {
  info: { icon: 'information-circle', color: colors.cyan },
  success: { icon: 'checkmark-circle', color: colors.mint },
  error: { icon: 'alert-circle', color: colors.red },
};

function ToastView({ msg, kind }: { msg: string; kind: ToastKind }) {
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }).start();
  }, [v]);
  const t = TOAST_ICON[kind];
  return (
    <Animated.View
      style={[
        s.toast,
        { top: insets.top + 10, borderColor: alpha(t.color, 0.45), shadowColor: t.color },
        { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={t.icon} size={20} color={t.color} />
      <Text style={s.toastText}>{msg}</Text>
    </Animated.View>
  );
}

/** Ekranın üstünde kısa süre beliren bildirim. */
export function useToast() {
  const [t, setT] = useState<{ msg: string; kind: ToastKind; id: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const counter = useRef(0);
  const show = (m: string, kind: ToastKind = 'info') => {
    setT({ msg: m, kind, id: ++counter.current });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), 2400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const node = t ? <ToastView key={t.id} msg={t.msg} kind={t.kind} /> : null;
  return { toast: node, show };
}

// ============================================================================
// Stiller
// ============================================================================
const s = StyleSheet.create({
  btn: {
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderTopColor: 'rgba(255,255,255,0.7)',
    borderBottomWidth: 3.5,
    borderBottomColor: 'rgba(0,0,0,0.32)',
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnGhost: { backgroundColor: colors.glass, borderColor: colors.borderLight },

  iconBtn: { backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.red, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  iconBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  card: { backgroundColor: colors.glass, borderRadius: radius.lg, padding: 18, borderWidth: 1, overflow: 'hidden' },
  cardGlow: { shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  cardSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.full, borderWidth: 1, alignSelf: 'flex-start' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radius.full, borderWidth: 1, paddingLeft: 5, alignSelf: 'flex-start' },

  timer: { gap: 12, paddingVertical: 12, paddingHorizontal: 16, marginVertical: 2 },
  timerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timerLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timerIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  timerLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  timerBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  timerUnit: { color: colors.muted, fontSize: 12, fontWeight: '600' },

  input: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.inset, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16,
  },

  tabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  tabBar: {
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.38)',
    shadowColor: colors.cyan,
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  tabIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    width: 100,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 229, 255, 0.75)',
    shadowColor: colors.cyan,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 6,
  },
  indicatorSheen: {
    position: 'absolute',
    bottom: 3,
    left: 14,
    right: 14,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.95,
    shadowRadius: 4,
  },
  tabItem: {
    width: 100,
    paddingVertical: 9,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    zIndex: 2,
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: 0.3,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cyan,
    marginTop: -1,
    shadowColor: colors.cyan,
    shadowOpacity: 0.9,
    shadowRadius: 4,
  },

  backdrop: { flex: 1, backgroundColor: 'rgba(2,6,14,0.78)' },
  dialog: {
    backgroundColor: colors.glassStrong, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.borderLight,
    width: '100%', maxWidth: 420, alignSelf: 'center', padding: 24, gap: 12, alignItems: 'center',
    shadowColor: colors.cyan, shadowOpacity: 0.25, shadowRadius: 30, elevation: 16,
  },
  sheet: {
    backgroundColor: '#0A1428', borderTopLeftRadius: 34, borderTopRightRadius: 34, borderWidth: 1, borderBottomWidth: 0,
    borderColor: colors.borderLight, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 38, gap: 14,
  },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.borderLight, alignSelf: 'center', marginBottom: 6 },

  toast: {
    position: 'absolute', left: 20, right: 20, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(8,16,32,0.96)',
    borderWidth: 1, paddingVertical: 13, paddingHorizontal: 18, borderRadius: radius.full,
    shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 12,
  },
  toastText: { color: colors.text, fontWeight: '600', fontSize: 14, flex: 1 },
});
