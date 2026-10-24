import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, GestureResponderEvent, PanResponder, PanResponderGestureState, Pressable, ScrollView, StyleSheet, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Hint } from './Hint';
import { IconName, Muted, Text, useToast } from './ui';
import { supabase } from '../lib/supabase';
import { alpha, colors, teamColor } from '../lib/theme';
import { soundFx } from '../lib/soundEffects';
import { haptic } from '../lib/haptics';
import type { CanvasItem, Ctx, Side, TeamPiece } from '../lib/types';

/**
 * 2D çıkartma tuvali (Mr. Potato Head mantığı).
 * Koordinatlar tuvale göre normalize (0..1), parça boyutu tuval genişliğine oranlıdır;
 * böylece her ekran boyutunda aynı görünür.
 *
 * Canlı akış: Mimar'ın hareketleri Supabase Broadcast ile (≈70 ms aralıkla) takıma yayılır,
 * parmak kalktığında değişiklik canvas_items tablosuna kalıcı yazılır (RLS: yalnız Mimar).
 */

type TF = { x: number; y: number; scale: number; rotation: number; flip_x: boolean; z_index: number };
interface BoardItem { id: string; emoji: string; tf: TF }

const tfOf = (i: CanvasItem): TF => ({ x: i.x, y: i.y, scale: i.scale, rotation: i.rotation, flip_x: i.flip_x, z_index: i.z_index });
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

const REACTIONS: { emoji: string; label: string; sound: string }[] = [
  { emoji: '👑', label: 'Şaheser', sound: 'cheer' },
  { emoji: '🔥', label: 'Ateş', sound: 'cheer' },
  { emoji: '🧠', label: 'Dahice', sound: 'pop' },
  { emoji: '🪄', label: 'Sihirli', sound: 'whistle' },
  { emoji: '💅', label: 'İkonik', sound: 'pop' },
  { emoji: '🤯', label: 'Beyin Yandı', sound: 'boing' },
  { emoji: '🗿', label: 'Sigma', sound: 'horn' },
  { emoji: '👾', label: 'Uzaylı', sound: 'whistle' },
  { emoji: '🦖', label: 'Vahşi', sound: 'horn' },
  { emoji: '🦄', label: 'Efsane', sound: 'cheer' },
  { emoji: '🤡', label: 'Ne Yaptın?', sound: 'laugh' },
  { emoji: '💀', label: 'Öldüm', sound: 'laugh' },
  { emoji: '👁️', label: 'Gözüm!', sound: 'whistle' },
  { emoji: '💩', label: 'Rezalet', sound: 'horn' },
  { emoji: '🤌', label: 'Şef Dokunuşu', sound: 'boing' },
  { emoji: '🚀', label: 'Uçtu Gitti', sound: 'whistle' },
];

const SOUNDBOARD_PHRASES: { text: string; sound: string; icon: IconName }[] = [
  { text: 'Ters Çevir!', sound: 'whistle', icon: 'swap-horizontal' },
  { text: 'Daha Büyüt!', sound: 'boing', icon: 'expand' },
  { text: 'Küçült Bunu!', sound: 'whistle', icon: 'contract' },
  { text: 'Şaheser Oldu!', sound: 'cheer', icon: 'flame' },
  { text: 'Aşırı Çirkin!', sound: 'horn', icon: 'skull' },
  { text: 'Gözü Nerede?!', sound: 'horn', icon: 'eye' },
];

// ---------------------------------------------------------------- Parça (sürüklenebilir)

interface ItemProps {
  item: BoardItem;
  size: number;
  editable: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, p: Partial<TF>) => void;
  onCommit: (id: string) => void;
}

function ItemView(props: ItemProps) {
  const P = useRef(props);
  useEffect(() => {
    P.current = props;
  });
  const g = useRef({ base: props.item.tf, n: 1, dx0: 0, dy0: 0, pinch: null as null | { dist: number; ang: number } });

  // eslint-disable-next-line react-hooks/refs
  const [pr] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => P.current.editable,
      onMoveShouldSetPanResponder: () => P.current.editable,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        const p = P.current;
        p.onSelect(p.item.id);
        g.current = { base: { ...p.item.tf }, n: 1, dx0: 0, dy0: 0, pinch: null };
      },
      onPanResponderMove: (e: GestureResponderEvent, gs: PanResponderGestureState) => {
        const p = P.current;
        const G = g.current;
        const touches = e.nativeEvent.touches;
        if (touches.length !== G.n) {
          // Parmak sayısı değişti: şu anki durumdan yeniden başla (zıplamayı önler)
          G.base = { ...p.item.tf };
          G.dx0 = gs.dx; G.dy0 = gs.dy; G.n = touches.length; G.pinch = null;
        }
        let { scale, rotation } = G.base;
        if (touches.length >= 2) {
          const a = touches[0]; const b = touches[1];
          const dx = b.pageX - a.pageX; const dy = b.pageY - a.pageY;
          const dist = Math.hypot(dx, dy) || 1;
          const ang = Math.atan2(dy, dx);
          if (!G.pinch) G.pinch = { dist, ang };
          scale = clamp((G.base.scale * dist) / G.pinch.dist, 0.2, 6);
          rotation = G.base.rotation + ((ang - G.pinch.ang) * 180) / Math.PI;
        }
        p.onChange(p.item.id, {
          x: clamp(G.base.x + (gs.dx - G.dx0) / p.size, 0, 1),
          y: clamp(G.base.y + (gs.dy - G.dy0) / p.size, 0, 1),
          scale, rotation,
        });
      },
      onPanResponderRelease: () => P.current.onCommit(P.current.item.id),
      onPanResponderTerminate: () => P.current.onCommit(P.current.item.id),
    }),
  );

  const { item, size, selected } = props;
  const { tf } = item;
  const glyph = size * 0.3 * tf.scale;
  const outer = Math.max(glyph, 48);
  return (
    <View
      {...pr.panHandlers}
      style={{ position: 'absolute', left: tf.x * size - outer / 2, top: tf.y * size - outer / 2, width: outer, height: outer, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: glyph, height: glyph, alignItems: 'center', justifyContent: 'center', borderRadius: 12,
          borderWidth: selected ? 2 : 0, borderColor: colors.cyan, borderStyle: 'dashed',
          backgroundColor: selected ? alpha(colors.cyan, 0.08) : 'transparent',
          transform: [{ rotate: `${tf.rotation}deg` }, { scaleX: tf.flip_x ? -1 : 1 }],
        }}
      >
        <Text style={{ fontSize: glyph * 0.78, lineHeight: glyph * 0.95, includeFontPadding: false }}>{item.emoji}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Tuval zemini

interface Floating { id: number; emoji: string; x: number }

function FloatingEmoji({ f, size, onDone }: { f: Floating; size: number; onDone: (id: number) => void }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1600, useNativeDriver: true }).start(() => onDone(f.id));
  }, [v, f.id, onDone]);
  return (
    <Animated.Text
      pointerEvents="none"
      style={{
        position: 'absolute', bottom: 8, left: 12 + f.x * (size - 60), fontSize: 34,
        opacity: v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.7] }) }],
      }}
    >
      {f.emoji}
    </Animated.Text>
  );
}

function Board({
  side, size, items, editable, selected, onSelect, onChange, onCommit, floating, onFloatDone, speech,
}: {
  side: Side; size: number; items: BoardItem[]; editable: boolean; selected?: string | null;
  onSelect?: (id: string | null) => void; onChange?: (id: string, p: Partial<TF>) => void; onCommit?: (id: string) => void;
  floating?: Floating[]; onFloatDone?: (id: number) => void;
  speech?: { sender: string; text: string } | null;
}) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.tf.z_index - b.tf.z_index), [items]);
  const tColor = teamColor(side);
  return (
    <View style={[s.board, { width: size, height: size, borderColor: alpha(tColor, editable ? 0.6 : 0.35), shadowColor: tColor }]}>
      <LinearGradient colors={['#0F2142', '#08111F']} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      {/* Hafif ızgara */}
      {[0.25, 0.5, 0.75].map((p) => (
        <React.Fragment key={p}>
          <View pointerEvents="none" style={[s.gridLineH, { top: `${p * 100}%` }]} />
          <View pointerEvents="none" style={[s.gridLineV, { left: `${p * 100}%` }]} />
        </React.Fragment>
      ))}
      {editable && (
        <Pressable style={StyleSheet.flatten([s.fill])} onPress={() => onSelect?.(null)} />
      )}
      {sorted.map((it) => (
        <ItemView
          key={it.id}
          item={it}
          size={size}
          editable={editable}
          selected={selected === it.id}
          onSelect={(id) => onSelect?.(id)}
          onChange={(id, p) => onChange?.(id, p)}
          onCommit={(id) => onCommit?.(id)}
        />
      ))}
      {floating?.map((f) => <FloatingEmoji key={f.id} f={f} size={size} onDone={onFloatDone ?? (() => undefined)} />)}
      {speech && (
        <View style={s.speechBubble} pointerEvents="none">
          <Ionicons name="chatbubble-ellipses" size={14} color={colors.cyan} />
          <Text style={s.speechSender}>{speech.sender}:</Text>
          <Text style={s.speechText}>“{speech.text}”</Text>
        </View>
      )}
      {items.length === 0 && (
        <View style={s.empty} pointerEvents="none">
          <Ionicons name={editable ? 'arrow-down-circle' : 'hourglass'} size={34} color={colors.subtle} />
          <Text style={s.emptyText}>{editable ? 'Aşağıdan parça ekle' : 'Mimar parça ekliyor…'}</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- Salt okunur tuval (oylama / sonuç)

export function CanvasBoard({ ctx, side, size }: { ctx: Ctx; side: Side; size: number }) {
  const { data, catalog } = ctx;
  const items: BoardItem[] = data.canvas
    .filter((c) => c.side === side)
    .map((c) => {
      const tp = data.teamPieces.find((t) => t.id === c.team_piece_id);
      return { id: c.id, emoji: (tp && catalog[tp.piece_id]?.emoji) || '❔', tf: tfOf(c) };
    });
  return <Board side={side} size={size} items={items} editable={false} />;
}

// ---------------------------------------------------------------- Mimar stüdyosu (inşa fazı)

export function CanvasStudio({ ctx, size }: { ctx: Ctx; size: number }) {
  const { data, me, catalog } = ctx;
  const side = me.team_side as Side;
  const editable = me.is_architect && data.room.phase === 'building';
  const rows = useMemo(() => data.canvas.filter((c) => c.side === side), [data.canvas, side]);
  const architectId = data.players.find((p) => p.team_side === side && p.is_architect)?.id;
  const architectRef = useRef(architectId);
  useEffect(() => {
    architectRef.current = architectId;
  }, [architectId]);

  const [live, setLive] = useState<Record<string, Partial<TF> & { ts: number }>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [floating, setFloating] = useState<Floating[]>([]);
  const active = useRef<string | null>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const send = useRef<{ last: number; timer: ReturnType<typeof setTimeout> | null; pending: { id: string; tf: TF } | null }>({ last: 0, timer: null, pending: null });
  const counter = useRef(0);
  const { toast, show } = useToast();

  const items: BoardItem[] = useMemo(
    () =>
      rows.map((r) => {
        const { ts: _ts, ...ov } = live[r.id] ?? ({} as Partial<TF> & { ts?: number });
        const tp = data.teamPieces.find((t) => t.id === r.team_piece_id);
        return { id: r.id, emoji: (tp && catalog[tp.piece_id]?.emoji) || '❔', tf: { ...tfOf(r), ...ov } };
      }),
    [rows, live, data.teamPieces, catalog],
  );
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const latest = (id: string) => itemsRef.current.find((i) => i.id === id)?.tf;

  const pushReaction = (emoji: string) => {
    const id = ++counter.current;
    setFloating((f) => [...f, { id, emoji, x: Math.random() }]);
  };
  const dropFloating = React.useCallback((id: number) => setFloating((f) => f.filter((x) => x.id !== id)), []);

  // Yayın geçersiz kılmaları kısa süre sonra veritabanındaki gerçek duruma bırakır
  useEffect(() => {
    const id = setInterval(() => {
      setLive((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (active.current === k || now - v.ts < 1500) next[k] = v;
        }
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 700);
    return () => clearInterval(id);
  }, []);

  const flush = () => {
    const sd = send.current;
    if (sd.timer) { clearTimeout(sd.timer); sd.timer = null; }
    if (!sd.pending) return;
    channel.current?.send({ type: 'broadcast', event: 'move', payload: { from: me.id, ...sd.pending } });
    sd.pending = null;
    sd.last = Date.now();
  };
  const sendMove = (id: string, tf: TF) => {
    const sd = send.current;
    sd.pending = { id, tf };
    const wait = 70 - (Date.now() - sd.last);
    if (wait <= 0) flush();
    else if (!sd.timer) sd.timer = setTimeout(flush, wait);
  };

  const persist = (id: string, tf: TF) => {
    supabase.from('canvas_items').update(tf).eq('id', id).then(({ error }) => {
      if (error) show('Kaydedilemedi: ' + error.message, 'error');
    });
  };

  const onChange = (id: string, p: Partial<TF>) => {
    const cur = latest(id);
    if (!cur) return;
    active.current = id;
    const tf = { ...cur, ...p };
    setLive((prev) => ({ ...prev, [id]: { ...tf, ts: Date.now() } }));
    sendMove(id, tf);
  };
  const onCommit = (id: string) => {
    active.current = null;
    const tf = latest(id);
    if (!tf) return;
    sendMove(id, tf);
    flush();
    persist(id, tf);
  };
  const apply = (mutate: (tf: TF) => Partial<TF>) => {
    if (!selected) return;
    const cur = latest(selected);
    if (!cur) return;
    const tf = { ...cur, ...mutate(cur) };
    setLive((prev) => ({ ...prev, [selected]: { ...tf, ts: Date.now() } }));
    sendMove(selected, tf);
    flush();
    persist(selected, tf);
  };

  const [speech, setSpeech] = useState<{ sender: string; text: string } | null>(null);
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSpeech = (sender: string, text: string) => {
    setSpeech({ sender, text });
    if (speechTimer.current) clearTimeout(speechTimer.current);
    speechTimer.current = setTimeout(() => setSpeech(null), 2500);
  };

  const zs = items.map((i) => i.tf.z_index);
  const placedIds = new Set(rows.map((r) => r.team_piece_id));
  const unplaced = data.teamPieces.filter((t: TeamPiece) => t.side === side && !placedIds.has(t.id));

  // Takım kanalı: canlı hareket + emoji & sesli yönlendirme
  useEffect(() => {
    const ch = supabase.channel(`canvas-${data.room.id}-${side}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.from !== architectRef.current) return;
      setLive((prev) => ({ ...prev, [payload.id]: { ...payload.tf, ts: Date.now() } }));
    });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => {
      pushReaction(payload.emoji);
      if (payload.sound) soundFx.playByName(payload.sound);
      haptic.light();
    });
    ch.on('broadcast', { event: 'soundboard' }, ({ payload }) => {
      if (payload.sound) soundFx.playByName(payload.sound);
      haptic.medium();
      triggerSpeech(payload.sender, payload.text);
    });
    ch.subscribe();
    channel.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channel.current = null;
    };
  }, [data.room.id, side]);

  const add = async (tp: TeamPiece) => {
    soundFx.pop();
    haptic.medium();
    const z = Math.max(0, ...zs) + 1;
    const j = () => 0.5 + (Math.random() - 0.5) * 0.2;
    const { data: row, error } = await supabase
      .from('canvas_items')
      .insert({ room_id: data.room.id, side, team_piece_id: tp.id, x: j(), y: j(), z_index: z })
      .select('id')
      .single();
    if (error) show(error.message, 'error');
    else if (row) setSelected(row.id as string);
  };
  const remove = async () => {
    if (!selected) return;
    soundFx.wrong();
    haptic.medium();
    const id = selected;
    setSelected(null);
    const { error } = await supabase.from('canvas_items').delete().eq('id', id);
    if (error) show(error.message, 'error');
  };

  const sendReaction = (item: { emoji: string; sound: string }) => {
    pushReaction(item.emoji);
    soundFx.playByName(item.sound);
    haptic.light();
    channel.current?.send({ type: 'broadcast', event: 'react', payload: { emoji: item.emoji, sound: item.sound } });
  };

  const sendSoundboard = (item: { text: string; sound: string }) => {
    soundFx.playByName(item.sound);
    haptic.medium();
    triggerSpeech(me.nickname, item.text);
    channel.current?.send({
      type: 'broadcast',
      event: 'soundboard',
      payload: { text: item.text, sound: item.sound, sender: me.nickname },
    });
  };

  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <Board
        side={side} size={size} items={items} editable={editable}
        selected={selected} onSelect={setSelected} onChange={onChange} onCommit={onCommit}
        floating={floating} onFloatDone={dropFloating}
        speech={speech}
      />

      {editable ? (
        <>
          <Hint id="canvas_gestures" text="Sürükle • iki parmakla büyüt/döndür • düğmeler hassas ayar için." />
          <View style={[s.toolbar, { width: size }]}>
            <Tool icon="refresh" flip onPress={() => apply((t) => ({ rotation: t.rotation - 15 }))} disabled={!selected} />
            <Tool icon="refresh" onPress={() => apply((t) => ({ rotation: t.rotation + 15 }))} disabled={!selected} />
            <Tool icon="remove" onPress={() => apply((t) => ({ scale: clamp(t.scale * 0.85, 0.2, 6) }))} disabled={!selected} />
            <Tool icon="add" onPress={() => apply((t) => ({ scale: clamp(t.scale * 1.18, 0.2, 6) }))} disabled={!selected} />
            <Tool icon="swap-horizontal" onPress={() => apply((t) => ({ flip_x: !t.flip_x }))} disabled={!selected} />
            <Tool icon="arrow-up" onPress={() => apply(() => ({ z_index: Math.max(0, ...zs) + 1 }))} disabled={!selected} />
            <Tool icon="arrow-down" onPress={() => apply(() => ({ z_index: Math.min(0, ...zs) - 1 }))} disabled={!selected} />
            <Tool icon="trash" onPress={remove} disabled={!selected} danger />
          </View>
          <View style={{ width: size }}>
            {unplaced.length === 0 ? (
              <View style={s.allPlaced}>
                <Ionicons name="checkmark-circle" size={18} color={colors.mint} />
                <Muted>Tüm parçalar tuvalde</Muted>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {unplaced.map((tp) => (
                  <Pressable key={tp.id} onPress={() => add(tp)} style={({ pressed }) => [s.tray, pressed && { transform: [{ scale: 0.94 }] }]}>
                    <Text style={{ fontSize: 30 }}>{catalog[tp.piece_id]?.emoji}</Text>
                    <Text style={s.trayName} numberOfLines={1}>{catalog[tp.piece_id]?.name_tr}</Text>
                    <View style={s.trayAdd}><Ionicons name="add" size={12} color="#05281A" /></View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : (
        <View style={{ gap: 12, width: size, alignItems: 'center' }}>
          <Hint id="watcher" text="Mimarı yönlendirmek için sesli butonlara veya emojilere dokun!" />

          {/* Sesli Yönlendirme Çipleri (Soundboard) */}
          <View style={s.soundboardSection}>
            <View style={s.soundboardHead}>
              <Ionicons name="megaphone" size={13} color={colors.subtle} />
              <Text style={s.soundboardLabel}>MİMARA SESLİ YÖNLENDİRME</Text>
            </View>
            <View style={s.phraseGrid}>
              {SOUNDBOARD_PHRASES.map((item) => (
                <Pressable
                  key={item.text}
                  onPress={() => sendSoundboard(item)}
                  style={({ pressed }) => [s.phraseBtn, pressed && { opacity: 0.75, transform: [{ scale: 0.95 }] }]}
                >
                  <Ionicons name={item.icon} size={14} color={colors.cyan} />
                  <Text style={s.phraseText}>{item.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Canlı Emoji Reaksiyonları */}
          <View style={{ width: size, gap: 6, marginVertical: 4 }}>
            <View style={s.soundboardHead}>
              <Ionicons name="sparkles" size={13} color={colors.cyan} />
              <Text style={s.soundboardLabel}>CANLI TEPKİLER</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.reactScroll}
            >
              {REACTIONS.map((item) => (
                <Pressable
                  key={item.emoji}
                  onPress={() => sendReaction(item)}
                  style={({ pressed }) => [
                    s.react,
                    pressed && { transform: [{ scale: 0.88 }], backgroundColor: alpha(colors.cyan, 0.25) },
                  ]}
                >
                  <Text style={{ fontSize: 26 }}>{item.emoji}</Text>
                  <Text style={s.reactLabel}>{item.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
      {toast}
    </View>
  );
}

function Tool({ icon, onPress, disabled, danger, flip }: { icon: IconName; onPress: () => void; disabled?: boolean; danger?: boolean; flip?: boolean }) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={({ pressed }) => [
        s.tool,
        danger && { backgroundColor: alpha(colors.red, 0.18), borderColor: alpha(colors.red, 0.5) },
        { opacity: disabled ? 0.3 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={20} color={danger ? colors.red : colors.textSoft} style={flip ? { transform: [{ scaleX: -1 }] } : undefined} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  board: {
    borderWidth: 1.5,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#08111F',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(120,190,255,0.07)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(120,190,255,0.07)' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyText: { color: colors.muted, fontWeight: '600', fontSize: 14 },
  toolbar: { flexDirection: 'row', gap: 7, justifyContent: 'space-between', marginVertical: 4 },
  tool: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allPlaced: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  tray: {
    width: 86,
    alignItems: 'center',
    backgroundColor: colors.glass,
    borderRadius: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  trayName: { color: colors.muted, fontSize: 11, fontWeight: '600', marginTop: 4, maxWidth: 74 },
  trayAdd: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  react: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(8, 20, 38, 0.85)',
    borderWidth: 1.2,
    borderColor: alpha(colors.cyan, 0.28),
    minWidth: 52,
    gap: 2,
  },
  reactLabel: {
    color: colors.textSoft,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  speechBubble: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: 'rgba(8, 16, 32, 0.95)',
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.5),
    borderRadius: 100,
    paddingHorizontal: 14,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 9999,
  },
  speechSender: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
  speechText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  soundboardSection: { width: '100%', gap: 8, alignItems: 'center', marginVertical: 2 },
  soundboardHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundboardLabel: { color: colors.subtle, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  phraseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  phraseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: alpha(colors.cyan, 0.08),
    borderWidth: 1,
    borderColor: alpha(colors.cyan, 0.35),
    borderRadius: 100,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  phraseText: { color: colors.text, fontSize: 12, fontWeight: '700' },
});
