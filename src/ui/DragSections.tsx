import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { useFrame } from './Artboard';

/** A section's spot in the Figma layout: its top and height (design pts). */
export type SectionFrame = { top: number; h: number };

type Props<K extends string> = {
  /** Every section's Figma spot; their order in Figma is top to bottom. */
  frames: Record<K, SectionFrame>;
  /** Current order, top to bottom. */
  order: K[];
  onReorder: (order: K[]) => void;
  /** Each section's content, laid out at its Figma position. */
  children: Record<K, ReactNode>;
};

/** Hold this long (ms) without moving to pick a section up. */
const HOLD_MS = 350;
/** Moving further than this (px) before then is a normal touch, not a drag. */
const SLOP = 8;

/** The finger's screen y (web only reports positions on the touch list). */
const touchY = (e: GestureResponderEvent) => e.nativeEvent.touches?.[0]?.pageY ?? e.nativeEvent.pageY;

/**
 * Sections stacked in a chosen order, in the space the Figma sections cover (the gaps between
 * them stay the same). Press and hold a section to pick it up, drag it up or down, and the
 * others slide out of its way; letting go drops it in its new place.
 */
export function DragSections<K extends string>({ frames, order, onReorder, children }: Props<K>) {
  const frame = useFrame();
  const s = frame.scale;
  const keys = Object.keys(frames) as K[];
  const first = Math.min(...keys.map((k) => frames[k].top));
  const last = Math.max(...keys.map((k) => frames[k].top + frames[k].h));
  const gap = (last - first - keys.reduce((sum, k) => sum + frames[k].h, 0)) / Math.max(1, keys.length - 1);

  /** How far each section sits from its Figma spot for an order (design pts). */
  const offsetsFor = (o: K[]) => {
    let top = first;
    const result = {} as Record<K, number>;
    for (const k of o) {
      result[k] = top - frames[k].top;
      top += frames[k].h + gap;
    }
    return result;
  };

  // The order being shown: follows `order`, and changes live while dragging.
  const [shown, setShown] = useState(order);
  const [dragging, setDragging] = useState<K | null>(null);
  const [positions] = useState(() => {
    const offsets = offsetsFor(order);
    return Object.fromEntries(keys.map((k) => [k, new Animated.Value(offsets[k] * s)])) as Record<K, Animated.Value>;
  });
  const [lift] = useState(() => new Animated.Value(0));
  const drag = useRef<{ key: K; startY: number; startOffset: number; order: K[] } | null>(null);
  const touch = useRef<{ y: number; timer: ReturnType<typeof setTimeout> } | null>(null);

  // A new saved order (e.g. Reset Placement in Settings) while not dragging.
  const orderKey = order.join();
  useEffect(() => {
    if (!drag.current) setShown(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  // Slide every section that isn't held into its spot for the shown order.
  const shownKey = shown.join();
  useEffect(() => {
    const offsets = offsetsFor(shown);
    for (const k of keys) {
      if (k === drag.current?.key) continue;
      Animated.timing(positions[k], {
        toValue: offsets[k] * s,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, s]);

  /** Design y of a screen point. */
  const designY = (pageY: number) => (pageY - frame.top(0)) / s;

  function sectionAt(y: number): K | null {
    const offsets = offsetsFor(shown);
    return keys.find((k) => y >= frames[k].top + offsets[k] && y <= frames[k].top + offsets[k] + frames[k].h) ?? null;
  }

  function pickUp(key: K, pageY: number) {
    drag.current = { key, startY: pageY, startOffset: offsetsFor(shown)[key], order: shown };
    setDragging(key);
    Animated.timing(lift, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function move(pageY: number) {
    const d = drag.current;
    if (!d) return;
    const offset = d.startOffset + (pageY - d.startY) / s;
    // Keep it within the sections' area.
    const clamped = Math.min(last - frames[d.key].h - frames[d.key].top, Math.max(first - frames[d.key].top, offset));
    positions[d.key].setValue(clamped * s);
    // Where it would sit best: the order whose spot for it is closest to where it's held.
    const center = frames[d.key].top + clamped + frames[d.key].h / 2;
    const others = d.order.filter((k) => k !== d.key);
    let best = d.order;
    let bestDistance = Infinity;
    for (let i = 0; i <= others.length; i++) {
      const candidate = [...others.slice(0, i), d.key, ...others.slice(i)];
      const spot = frames[d.key].top + offsetsFor(candidate)[d.key] + frames[d.key].h / 2;
      if (Math.abs(spot - center) < bestDistance) {
        bestDistance = Math.abs(spot - center);
        best = candidate;
      }
    }
    if (best.join() !== d.order.join()) {
      d.order = best;
      setShown(best);
      Haptics.selectionAsync().catch(() => {});
    }
  }

  function drop() {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    Animated.parallel([
      Animated.timing(positions[d.key], {
        toValue: offsetsFor(d.order)[d.key] * s,
        duration: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(lift, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => setDragging(null));
    if (d.order.join() !== order.join()) onReorder(d.order);
  }

  function cancelHold() {
    if (touch.current) clearTimeout(touch.current.timer);
    touch.current = null;
  }

  const onTouchStart = (e: GestureResponderEvent) => {
    if (e.nativeEvent.touches && e.nativeEvent.touches.length > 1) return cancelHold();
    const pageY = touchY(e);
    const key = sectionAt(designY(pageY));
    cancelHold();
    if (!key) return;
    touch.current = { y: pageY, timer: setTimeout(() => pickUp(key, touch.current?.y ?? pageY), HOLD_MS) };
  };
  const onTouchMove = (e: GestureResponderEvent) => {
    const pageY = touchY(e);
    if (drag.current) return move(pageY);
    if (touch.current && Math.abs(pageY - touch.current.y) > SLOP) cancelHold();
  };
  const onTouchEnd = () => {
    cancelHold();
    drop();
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      // While a section is held, take the touch from the buttons inside it (so letting go
      // doesn't also tap one), and don't give it up.
      onStartShouldSetResponderCapture={() => !!drag.current}
      onMoveShouldSetResponderCapture={() => !!drag.current}
      onResponderTerminationRequest={() => !drag.current}
    >
      {keys.map((k) => {
        const held = dragging === k;
        const scale = held ? lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) : 1;
        return (
          <Animated.View
            key={k}
            pointerEvents="box-none"
            style={[
              StyleSheet.absoluteFill,
              held && styles.held,
              {
                transform: [{ translateY: positions[k] }, { scale }],
                // Scale around the section's middle rather than the screen's.
                transformOrigin: `50% ${frame.top(frames[k].top + frames[k].h / 2)}px 0px`,
              },
            ]}
          >
            {children[k]}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  held: { zIndex: 10, opacity: 0.92 },
});
