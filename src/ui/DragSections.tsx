import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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
/** A distance (dp) no finger travels. */
const NEVER = 100_000;
/** Picked-up sections grow by this much. */
const LIFT_SCALE = 1.03;
// Sections glide into place on a bouncy spring: a little past their spot, then back (damping
// ratio ≈ 0.6). Driven from JS, not the native driver: on Android the native driver moves views
// behind React's back, so a re-render could put a section back at an old position. Three views
// are cheap to move from JS.
const GLIDE = { stiffness: 260, damping: 19, mass: 1, useNativeDriver: false } as const;

type Drag<K> = { key: K; startOffset: number; order: K[] };

/**
 * Sections stacked in a chosen order, in the space the Figma sections cover (the gaps between
 * them stay the same). Press and hold a section to pick it up, drag it up or down, and the
 * others slide out of its way; letting go drops it in its new place.
 *
 * The hold-then-drag is a native gesture (react-native-gesture-handler): once it starts, it
 * cancels any tap on the buttons underneath, and taps that end before the hold work as usual.
 */
export function DragSections<K extends string>({ frames, order, onReorder, children }: Props<K>) {
  const frame = useFrame();
  const s = frame.scale;
  const keys = useMemo(() => Object.keys(frames) as K[], [frames]);

  /** Design y of each section's top for an order, and helpers (design pts). */
  const layout = useMemo(() => {
    const first = Math.min(...keys.map((k) => frames[k].top));
    const last = Math.max(...keys.map((k) => frames[k].top + frames[k].h));
    const gap = (last - first - keys.reduce((sum, k) => sum + frames[k].h, 0)) / Math.max(1, keys.length - 1);
    const tops = (o: K[]) => {
      let top = first;
      const result = {} as Record<K, number>;
      for (const k of o) {
        result[k] = top;
        top += frames[k].h + gap;
      }
      return result;
    };
    return { first, last, tops };
  }, [keys, frames]);
  const offsetsFor = (o: K[]) => {
    const tops = layout.tops(o);
    return Object.fromEntries(keys.map((k) => [k, tops[k] - frames[k].top])) as Record<K, number>;
  };

  // One translate (design pts) and one scale per section.
  const [anim] = useState(() => {
    const offsets = offsetsFor(order);
    return Object.fromEntries(
      keys.map((k) => [k, { y: new Animated.Value(offsets[k]), scale: new Animated.Value(1) }]),
    ) as Record<K, { y: Animated.Value; scale: Animated.Value }>;
  });
  // The section drawn over the others: the one picked up most recently. It stays on top after
  // it's dropped, so nothing about the stacking changes while it slides into place.
  // The same values in screen dp, for the views.
  const translate = useMemo(
    () =>
      Object.fromEntries(keys.map((k) => [k, Animated.multiply(anim[k].y, s)])) as Record<
        K,
        Animated.AnimatedMultiplication<number>
      >,
    [anim, keys, s],
  );
  const [onTop, setOnTop] = useState<K | null>(null);
  const drag = useRef<Drag<K> | null>(null);
  // The order the sections are showing (or sliding to). A drop is saved only once the section
  // has settled (saving re-renders every screen, which would make the glide stutter), so until
  // then this is ahead of `order`.
  const shown = useRef(order);
  const saveOrder = useRef(onReorder);
  saveOrder.current = onReorder;

  // Slide every section that isn't held into its spot.
  function settle(o: K[], except?: K) {
    const offsets = offsetsFor(o);
    for (const k of keys) if (k !== except) Animated.spring(anim[k].y, { toValue: offsets[k], ...GLIDE }).start();
  }

  // A new saved order that didn't come from a drag here.
  const orderKey = order.join();
  useEffect(() => {
    if (drag.current || shown.current.join() === orderKey) return;
    shown.current = order;
    settle(order);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  function sectionAt(y: number): K | null {
    const tops = layout.tops(shown.current);
    return keys.find((k) => y >= tops[k] && y <= tops[k] + frames[k].h) ?? null;
  }

  function start(localY: number) {
    const key = sectionAt((localY - frame.top(0)) / s);
    if (!key) return;
    // Picked up where it is right now, even if it's still gliding in from a drop.
    let at = offsetsFor(shown.current)[key];
    anim[key].y.stopAnimation((value) => (at = value));
    drag.current = { key, startOffset: at, order: shown.current };
    setOnTop(key);
    Animated.timing(anim[key].scale, { toValue: LIFT_SCALE, duration: 150, useNativeDriver: false }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }

  function update(translationY: number) {
    const d = drag.current;
    if (!d) return;
    const { top, h } = frames[d.key];
    // Follow the finger, kept within the sections' area.
    const heldTop = Math.min(layout.last - h, Math.max(layout.first, top + d.startOffset + translationY / s));
    anim[d.key].y.setValue(heldTop - top);

    // Swap with a neighbour once the held section passes the middle of its spot. (Swapping
    // back needs it to pass the middle again, so it never flickers between two orders.)
    let next = d.order;
    for (;;) {
      const i = next.indexOf(d.key);
      const tops = layout.tops(next);
      const above = next[i - 1];
      const below = next[i + 1];
      if (above !== undefined && heldTop < tops[above] + frames[above].h / 2) {
        next = [...next.slice(0, i - 1), d.key, above, ...next.slice(i + 1)];
      } else if (below !== undefined && heldTop + h > tops[below] + frames[below].h / 2) {
        next = [...next.slice(0, i), below, d.key, ...next.slice(i + 2)];
      } else break;
    }
    if (next !== d.order) {
      d.order = next;
      settle(next, d.key);
      Haptics.selectionAsync().catch(() => {});
    }
  }

  /** `velocityY`: the finger's speed when it let go (dp per second), which the glide carries on. */
  function end(velocityY: number) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const changed = d.order.join() !== shown.current.join();
    shown.current = d.order;
    Animated.parallel([
      Animated.spring(anim[d.key].y, { toValue: offsetsFor(d.order)[d.key], velocity: velocityY / s / 1000, ...GLIDE }),
      Animated.spring(anim[d.key].scale, { toValue: 1, ...GLIDE }),
    ]).start(() => {
      if (changed) saveOrder.current(d.order);
    });
  }

  // Handlers change every render; the gesture reads the latest through a ref.
  const handlers = useRef({ start, update, end });
  handlers.current = { start, update, end };
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(HOLD_MS)
        // Only a hold picks a section up. (By default a pan also starts once the finger has
        // moved exactly the touch slop, the one distance that doesn't cancel the hold, which
        // could take a slow sideways swipe away from the tab swipe.)
        .minDistance(NEVER)
        .runOnJS(true)
        .onStart((e) => handlers.current.start(e.y))
        .onUpdate((e) => handlers.current.update(e.translationY))
        .onFinalize((e) => handlers.current.end(e.velocityY)),
    [],
  );

  return (
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={StyleSheet.absoluteFill}>
        {keys.map((k) => {
          // Each section's box covers just its Figma spot, so it grows around its own middle;
          // the content inside is shifted back up to lay out on the whole frame as usual.
          const boxTop = frame.top(frames[k].top);
          return (
            <Animated.View
              key={k}
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: boxTop,
                height: frames[k].h * s,
                zIndex: onTop === k ? 1 : 0,
                transform: [{ translateY: translate[k] }, { scale: anim[k].scale }],
              }}
            >
              <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: -boxTop, height: frame.height }}>
                {children[k]}
              </View>
            </Animated.View>
          );
        })}
      </View>
    </GestureDetector>
  );
}
