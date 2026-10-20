import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, GestureResponderEvent, PanResponder, PanResponderGestureState, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { Hint } from './Hint';
import { Muted, useToast } from './ui';
import { supabase } from '../lib/supabase';
import { colors, radius, teamColor } from '../lib/theme';
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
const REACTIONS = ['😂', '🤯', '👏', '🔥', '😱', '🤌'];

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
  P.current = props;
  const g = useRef({ base: props.item.tf, n: 1, dx0: 0, dy0: 0, pinch: null as null | { dist: number; ang: number } });

  const pr = useRef(
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
  ).current;

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
          width: glyph, height: glyph, alignItems: 'center', justifyContent: 'center', borderRadius: 10,
          borderWidth: selected ? 2 : 0, borderColor: colors.yellow, borderStyle: 'dashed',
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
  const v = useRef(new Animated.Value(0)).current;
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
  side, size, items, editable, selected, onSelect, onChange, onCommit, floating, onFloatDone,
}: {
  side: Side; size: number; items: BoardItem[]; editable: boolean; selected?: string | null;
  onSelect?: (id: string | null) => void; onChange?: (id: string, p: Partial<TF>) => void; onCommit?: (id: string) => void;
  floating?: Floating[]; onFloatDone?: (id: number) => void;
}) {
  const sorted = useMemo(() => [...items].sort((a, b) => a.tf.z_index - b.tf.z_index), [items]);
  return (
    <View style={[s.board, { width: size, height: size, borderColor: teamColor(side), backgroundColor: teamColor(side) + '14' }]}>
      {/* Hafif ızgara */}
      {[1, 2, 3].map((i) => (
        <View key={`v${i}`} style={[s.gridV, { left: (size / 4) * i }]} />
      ))}
      {[1, 2, 3].map((i) => (
        <View key={`h${i}`} style={[s.gridH, { top: (size / 4) * i }]} />
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
      {items.length === 0 && (
        <View style={s.empty} pointerEvents="none"><Text style={s.emptyText}>{editable ? 'Aşağıdan parça ekle ⬇️' : 'Mimar parça ekliyor…'}</Text></View>
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
  architectRef.current = architectId;

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
  itemsRef.current = items;
  const latest = (id: string) => itemsRef.current.find((i) => i.id === id)?.tf;

  const pushReaction = (emoji: string) => {
    const id = ++counter.current;
    setFloating((f) => [...f, { id, emoji, x: Math.random() }]);
  };
  const dropFloating = React.useCallback((id: number) => setFloating((f) => f.filter((x) => x.id !== id)), []);

  // Takım kanalı: canlı hareket + emoji tepkileri
  useEffect(() => {
    const ch = supabase.channel(`canvas-${data.room.id}-${side}`, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.from !== architectRef.current) return; // yalnız Mimar'ın hareketleri geçerli
      setLive((prev) => ({ ...prev, [payload.id]: { ...payload.tf, ts: Date.now() } }));
    });
    ch.on('broadcast', { event: 'react' }, ({ payload }) => pushReaction(payload.emoji));
    ch.subscribe();
    channel.current = ch;
    return () => {
      supabase.removeChannel(ch);
      channel.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.room.id, side]);

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
      if (error) show('Kaydedilemedi: ' + error.message);
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

  const zs = items.map((i) => i.tf.z_index);
  const placedIds = new Set(rows.map((r) => r.team_piece_id));
  const unplaced = data.teamPieces.filter((t: TeamPiece) => t.side === side && !placedIds.has(t.id));

  const add = async (tp: TeamPiece) => {
    const z = Math.max(0, ...zs) + 1;
    const j = () => 0.5 + (Math.random() - 0.5) * 0.2;
    const { data: row, error } = await supabase
      .from('canvas_items')
      .insert({ room_id: data.room.id, side, team_piece_id: tp.id, x: j(), y: j(), z_index: z })
      .select('id')
      .single();
    if (error) show(error.message);
    else if (row) setSelected(row.id as string);
  };
  const remove = async () => {
    if (!selected) return;
    const id = selected;
    setSelected(null);
    const { error } = await supabase.from('canvas_items').delete().eq('id', id);
    if (error) show(error.message);
  };

  const react = (emoji: string) => {
    pushReaction(emoji);
    channel.current?.send({ type: 'broadcast', event: 'react', payload: { emoji } });
  };

  return (
    <View style={{ gap: 10, alignItems: 'center' }}>
      <Board
        side={side} size={size} items={items} editable={editable}
        selected={selected} onSelect={setSelected} onChange={onChange} onCommit={onCommit}
        floating={floating} onFloatDone={dropFloating}
      />

      {editable ? (
        <>
          <Hint id="canvas_gestures" text="Sürükle • iki parmakla büyüt/döndür • düğmeler hassas ayar için." />
          <View style={[s.toolbar, { width: size }]}>
            <Tool label="⟲" onPress={() => apply((t) => ({ rotation: t.rotation - 15 }))} disabled={!selected} />
            <Tool label="⟳" onPress={() => apply((t) => ({ rotation: t.rotation + 15 }))} disabled={!selected} />
            <Tool label="➖" onPress={() => apply((t) => ({ scale: clamp(t.scale * 0.85, 0.2, 6) }))} disabled={!selected} />
            <Tool label="➕" onPress={() => apply((t) => ({ scale: clamp(t.scale * 1.18, 0.2, 6) }))} disabled={!selected} />
            <Tool label="↔️" onPress={() => apply((t) => ({ flip_x: !t.flip_x }))} disabled={!selected} />
            <Tool label="⬆️" onPress={() => apply(() => ({ z_index: Math.max(0, ...zs) + 1 }))} disabled={!selected} />
            <Tool label="⬇️" onPress={() => apply(() => ({ z_index: Math.min(0, ...zs) - 1 }))} disabled={!selected} />
            <Tool label="🗑️" onPress={remove} disabled={!selected} danger />
          </View>
          <View style={{ width: size }}>
            {unplaced.length === 0 ? (
              <Muted style={{ textAlign: 'center' }}>Tüm parçalar tuvalde 👏</Muted>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {unplaced.map((tp) => (
                  <Pressable key={tp.id} onPress={() => add(tp)} style={s.tray}>
                    <Text style={{ fontSize: 30 }}>{catalog[tp.piece_id]?.emoji}</Text>
                    <Text style={s.trayName} numberOfLines={1}>{catalog[tp.piece_id]?.name_tr}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </>
      ) : (
        <>
          <Hint id="watcher" text="Mimarı sesli yönlendir ve emojilerle destekle!" />
          <View style={[s.toolbar, { width: size, justifyContent: 'space-around' }]}>
            {REACTIONS.map((e) => (
              <Pressable key={e} onPress={() => react(e)} style={s.react}><Text style={{ fontSize: 28 }}>{e}</Text></Pressable>
            ))}
          </View>
        </>
      )}
      {toast}
    </View>
  );
}

function Tool({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable
      onPress={onPress} disabled={disabled}
      style={({ pressed }) => [s.tool, danger && { backgroundColor: colors.red + '55' }, { opacity: disabled ? 0.3 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] }]}
    >
      <Text style={{ fontSize: 20, color: colors.text, fontWeight: '900' }}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  board: { borderWidth: 3, borderRadius: radius.md, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: '#FFFFFF10' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#FFFFFF10' },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.muted, fontWeight: '800', fontSize: 15 },
  toolbar: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  tool: { flex: 1, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  tray: { width: 78, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 8, borderWidth: 1, borderColor: colors.surface2 },
  trayName: { color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 2 },
  react: { padding: 6, borderRadius: radius.sm, backgroundColor: colors.surface },
});
