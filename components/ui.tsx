import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, GestureResponderEvent, Image, ImageBackground, ImageSourcePropType, LayoutChangeEvent,
  Modal, Platform, Pressable, PressableProps, ScrollView, useWindowDimensions,
  StyleProp, StyleSheet, Text as RNText, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
 * kartlar klavyenin altında kalmaz; tarayıcı araç çubukları da görünür alana dahildir.
 */

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
  row: { height: 32, flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-start', marginBottom: 4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(10, 20, 39, 0.92)', borderWidth: 1, borderColor: 'rgba(100, 210, 255, 0.35)' },
  text: { color: '#FFFFFF', fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'Sora_600SemiBold' },
});

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  const [outerH, setOuterH] = useState(0);
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) return;
    const vp = window.visualViewport;
    const update = () => {
      const covered = window.innerHeight - vp.height;
      {
        const h = Math.round(vp.height);
        const top = covered > 120 ? Math.round(vp.offsetTop) : 0;
        setVv((p) => (p && p.h === h && p.top === top ? p : { h, top }));
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
  const {width}=useWindowDimensions();
  const topPad = Math.max(insets.top, Platform.OS === 'web' ? 12 : 8);
  const userStyle = (StyleSheet.flatten(style) || {}) as ViewStyle;
  const bottomPad = userStyle.paddingBottom !== undefined
    ? Number(userStyle.paddingBottom)
    : Math.max(insets.bottom, isIosWeb ? 24 : 8);

  // Ölçü alınana kadar (ve native'de) klasik flex:1; web'de ölçüden sonra görünür alanın piksel yüksekliği.
  const areaStyle: ViewStyle =
    Platform.OS === 'web' && outerH > 0
      ? ({
          position: 'absolute',
          left: 0,
          right: 0,
          top: vv ? vv.top : 0,
          height: vv ? Math.min(vv.h, outerH) : outerH,
          minHeight: 0,
        } as ViewStyle)
      : { flex: 1 };

  return (
    <View
      style={{ flex: 1, minHeight: 0, backgroundColor: colors.bg, overflow: 'hidden' }}
      onLayout={(e) => setOuterH(Math.round(e.nativeEvent.layout.height))}
    >
      <ImageBackground source={art.bg} resizeMode="cover" style={StyleSheet.absoluteFill} imageStyle={{ opacity: 0.6 }} />
      <LinearGradient
        colors={['rgba(5,10,20,0.5)', 'rgba(5,10,20,0.8)', 'rgba(5,10,20,0.95)']}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View
        style={[
          { paddingHorizontal: width<380?10:14, paddingTop: topPad, paddingBottom: bottomPad, minHeight:0 },
          areaStyle,
          style,
        ]}
      >
        <ScreenClock />
        {children}
      </View>
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
          minWidth:0,maxWidth:'100%',
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
        accessibilityRole="button"
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
                  <Text display style={{ color: fg, fontSize: sz.font + 1, fontWeight: '800', letterSpacing: 0.3,flexShrink:1,textAlign:'center' }}>{title}</Text>
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
                  <Text display style={{ color: fg, fontSize: sz.font + 1, fontWeight: '700', letterSpacing: 0.2,flexShrink:1,textAlign:'center' }}>{title}</Text>
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
      soundFx.countdown(secs);
      haptic.light();
    }
    if (secs === 0 && prevSecs.current > 0) soundFx.timeUp();
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
          center && { textAlign: '…21388 tokens truncated…? '(Sen)' : ''}
                  </Text>
                  <Text style={{ color: tColor, fontSize: 11, fontWeight: '600' }}>
                    {teamName(p.team_side)}
                  </Text>
                </View>

                {guess !== null && live && !isMe ? (
                  <Chip label="Tahmin gönderildi" color={colors.mint} size="sm" icon="checkmark-circle" />
                ) : guess !== null ? (
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={[s.guessBadge, { backgroundColor: alpha(tColor, 0.18), borderColor: alpha(tColor, 0.5) }]}>
                      <Text display style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>
                        {guess}
                      </Text>
                    </View>
                    {!live && targetNum !== null && diff !== null && (
                      <Text style={{ color: isWinner ? colors.gold : colors.muted, fontSize: 11, fontWeight: '700' }}>
                        {isWinner ? `🏆 En Yakın (Fark: ${diff})` : `Fark: ${diff}`}
                      </Text>
                    )}
                  </View>
                ) : (
                  <Chip label="Düşünüyor..." color={colors.muted} size="sm" icon="time-outline" />
                )}
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  lineResultOverlay: { marginTop: 14, borderWidth: 2, borderRadius: 24, paddingVertical: 30, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', gap: 14, overflow: 'hidden', minHeight: 280 },
  lineResultIcon: { width: 84, height: 84, borderRadius: 42, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A1727' },
  lineResultText: { color: '#F1F5FF', fontSize: 17, lineHeight: 25, fontWeight: '700', textAlign: 'center' },
  lineResultTeam: { fontSize: 15, fontWeight: '800', textAlign: 'center' },

  scroll: { gap: 14, paddingBottom: 36, paddingTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  header: { gap: 4, marginTop: 2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bigIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: alpha(colors.magenta, 0.12),
    borderWidth: 1,
    borderColor: alpha(colors.magenta, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  briefingCard: { alignItems: 'center', gap: 12, paddingVertical: 24, paddingHorizontal: 16 },
  briefingCountdown: { color: colors.text, fontSize: 58, fontWeight: '900', lineHeight: 66 },

  // Refleks
  reflexWrap: { alignItems: 'center', gap: 20, paddingVertical: 10 },
  ringOuter: { padding: 10 },
  ringMid: { width: 270, height: 270, borderRadius: 135, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  reflexBtn: {
    width: 218,
    height: 218,
    borderRadius: 109,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  reflexFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  reflexSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.18)' },
  reflexText: { color: '#FFFFFF', fontSize: 38, fontWeight: '900', letterSpacing: 1 },
  reflexMs: { color: colors.text, fontSize: 32, fontWeight: '900' },

  // Genel oyun konteyneri
  gameContainer: { alignItems: 'center', gap: 16, padding: 20 },
  gameInstruction: { color: colors.textSoft, fontSize: 15, fontWeight: '700', textAlign: 'center', paddingHorizontal: 12 },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 100,
    borderWidth: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  statusBannerText: { fontSize: 13, fontWeight: '700' },
  memoryResultRow: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.inset },
  paused: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, backgroundColor: 'rgba(5, 10, 20, 0.95)', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },

  // Hafıza grid
  memoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', width: '100%' },
  memoryCard: {
    width: '30%',
    backgroundColor: colors.inset,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    borderRadius: 20,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 6,
  },
  memoryCardActive: {
    backgroundColor: alpha(colors.mint, 0.2),
    borderColor: colors.mint,
    shadowColor: colors.mint,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
    transform: [{ scale: 1.06 }],
  },
  memoryName: { color: colors.muted, fontSize: 12.5, fontWeight: '700' },
  stepBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepBadgeText: { color: '#05281A', fontSize: 13, fontWeight: '900' },

  // Denge
  balanceTrack: {
    width: '100%',
    height: 54,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 27,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  safeZone: {
    position: 'absolute',
    left: '35%',
    width: '30%',
    top: 0,
    bottom: 0,
    backgroundColor: alpha(colors.mint, 0.16),
    borderLeftWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: alpha(colors.mint, 0.5),
  },
  balancePointer: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    marginLeft: -13,
    borderWidth: 3,
    borderColor: '#fff',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  nudgeRow: { flexDirection: 'row', gap: 12, width: '100%' },

  // Ortak elemanlar
  progressWrap: { gap: 8, marginTop: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusText: { color: colors.textSoft, fontSize: 16, fontWeight: '800' },
  winnerCard: { alignItems: 'center', gap: 10, paddingVertical: 24, marginTop: 4 },
  playerVoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 22,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 14,
  },
  playerVoteCardSelected: {
    borderColor: alpha(colors.mint, 0.7),
    backgroundColor: alpha(colors.mint, 0.1),
  },
  playerNickText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  playerTeamText: { fontSize: 11, fontWeight: '700' },
  voteRadio: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderLight,
    backgroundColor: colors.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteRadioSelected: { borderColor: colors.mint, backgroundColor: colors.mint },
  promptCard: { alignItems: 'center', gap: 12 },
  prompt: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 30 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resName: { color: colors.text, fontWeight: '700', fontSize: 14 },
  resPct: { fontWeight: '900', fontSize: 16 },

  // Matematik ve sayı tahmini
  correctAnswerCard: { alignItems: 'center', gap: 10, paddingVertical: 26, paddingHorizontal: 18, borderWidth: 2, borderColor: colors.mint },
  correctAnswerHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  correctAnswerLabel: { color: colors.mint, fontSize: 18, fontWeight: '900', letterSpacing: 1.2 },
  correctAnswerValue: { color: '#FFFFFF', fontSize: 64, lineHeight: 78, fontWeight: '900', textAlign: 'center', width: '100%' },
  correctAnswerDifference: { color: colors.textSoft, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 4 },
  mathDisplay: {
    backgroundColor: colors.inset,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  mathDisplayText: { fontSize: 28, fontWeight: '900', color: colors.cyan },
  numPadGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  numPadKey: {
    width: '30%',
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.inset,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numPadActionKey: {
    backgroundColor: alpha(colors.cyan, 0.12),
    borderColor: alpha(colors.cyan, 0.35),
  },
  numPadKeyText: { fontSize: 22, fontWeight: '800', color: colors.text },
  guessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: alpha(colors.surface2, 0.45),
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guessBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
});

