import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { TAB_CHIN_DROP, useFrameMetrics } from './Artboard';
import { ui } from './assets';
import { gooeyPath } from './gooey';

// Geometry of the Figma nav bar exports (design pts, relative to the bar's left edge):
// each tab's pill cell, 26pt tall. The active tab gets its own pill; the tabs before and
// after it merge into one pill each. Order matches app/(tabs)/_layout.tsx.
const TABS = [
  { route: 'home', label: 'Home', cell: [0, 65] },
  { route: 'usage', label: 'Usage', cell: [80, 145] },
  { route: 'rebates', label: 'Rebates', cell: [159, 224] },
  { route: 'settings', label: 'Settings', cell: [238, 303] },
] as const;
const BAR = { x: 18, w: 303, h: 26 };
const DOT = { gap: 4, size: ui.common.navDot.w };
const GROUP_H = BAR.h + DOT.gap + DOT.size; // pills + dot, centered in the green chin
const CARD_BOTTOM = 568;
/** Pills closer than this (design pts) grow a liquid bridge; the resting gaps are ~14. */
const BRIDGE_REACH = 10;
/** A touch on the bar held longer than this before lifting counts as press-and-drag. */
const HOLD_MS = 300;

type Edges = { activeLeft: number; activeRight: number; beforeRight: number; afterLeft: number };
type EdgeKey = keyof Edges;
const EDGE_KEYS: EdgeKey[] = ['activeLeft', 'activeRight', 'beforeRight', 'afterLeft'];

/** Pill edges for a given active tab. An empty side group collapses to zero width at its end. */
function layoutFor(index: number): Edges {
  const [activeLeft, activeRight] = TABS[index].cell;
  return {
    activeLeft,
    activeRight,
    beforeRight: index > 0 ? TABS[index - 1].cell[1] : 0,
    afterLeft: index < TABS.length - 1 ? TABS[index + 1].cell[0] : BAR.w,
  };
}

type Spring = { stiffness: number; damping: number };
// Critically damped springs (damping = 2 * sqrt(stiffness)): smooth, no bounce or overshoot.
// The leading edge is stiffer than the trailing one, so the pill still stretches as it moves.
const critical = (stiffness: number): Spring => ({ stiffness, damping: 2 * Math.sqrt(stiffness) });
const FAST = critical(150);
const SLOW = critical(60);
const MEDIUM = critical(95);

/**
 * The Home / Usage / Rebates / Settings bar with a liquid morph: when switching tabs the
 * active pill's leading edge springs ahead of its trailing edge, so it stretches toward the
 * new tab; the neighbouring pills flow to their new edges; and pills that come close grow a
 * waisted liquid bridge (see gooey.ts) so they melt together and pull apart.
 */
export function TabNav({ state, navigation }: BottomTabBarProps) {
  const frame = useFrameMetrics(TAB_CHIN_DROP);
  const s = frame.scale;
  const index = state.index;
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null);

  // Spring simulation for the four pill edges (design pts); `edges` is what's drawn.
  const [edges, setEdges] = useState<Edges>(() => layoutFor(index));
  const position = useRef<Edges>(layoutFor(index));
  const velocity = useRef<Edges>({ activeLeft: 0, activeRight: 0, beforeRight: 0, afterLeft: 0 });
  const previous = useRef(index);
  const [dot] = useState(() => new Animated.Value(index));

  // Swipes on the bar change tabs: a quick flick right/left moves one tab forward/back;
  // pressing and dragging goes to whichever tab the finger lifts over. Uses plain touch
  // start/end positions (not a gesture responder), so taps on the tab buttons still work.
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const onTouchStart = (e: GestureResponderEvent) => {
    const touch = e.nativeEvent.touches?.[0] ?? e.nativeEvent;
    touchStart.current = { x: touch.pageX, y: touch.pageY, time: Date.now() };
  };
  const onTouchEnd = (e: GestureResponderEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    // The lifted finger's position (web only reports positions on the touch lists).
    const end = e.nativeEvent.changedTouches?.[0] ?? e.nativeEvent;
    const dx = end.pageX - start.x;
    const dy = end.pageY - start.y;
    if (!Number.isFinite(dx) || Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    let next: number;
    if (Date.now() - start.time > HOLD_MS) {
      // Held and dragged: the tab under the finger (nearest tab center).
      const barX = (end.pageX - frame.left(BAR.x)) / s;
      next = TABS.reduce(
        (best, tab, i) =>
          Math.abs(barX - (tab.cell[0] + tab.cell[1]) / 2) <
          Math.abs(barX - (TABS[best].cell[0] + TABS[best].cell[1]) / 2)
            ? i
            : best,
        0,
      );
    } else {
      next = Math.max(0, Math.min(TABS.length - 1, index + (dx > 0 ? 1 : -1)));
    }
    if (next !== index) navigation.navigate(state.routes[next].name);
  };

  useEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (from === index) return;

    const target = layoutFor(index);
    const movingRight = index > from;
    // Leading edge leads, trailing edge lags: the pill stretches in the direction of travel.
    const feel: Record<EdgeKey, Spring> = {
      activeRight: movingRight ? FAST : SLOW,
      activeLeft: movingRight ? SLOW : FAST,
      beforeRight: MEDIUM,
      afterLeft: MEDIUM,
    };
    Animated.spring(dot, { toValue: index, useNativeDriver: true, speed: 6, bounciness: 0 }).start();

    let frameId = 0;
    let last: number | null = null;
    const step = (now: number) => {
      const dt = last === null ? 1 / 60 : Math.min(1 / 30, (now - last) / 1000);
      last = now;
      let moving = false;
      const pos = { ...position.current };
      const vel = { ...velocity.current };
      for (const key of EDGE_KEYS) {
        const { stiffness, damping } = feel[key];
        const acceleration = -stiffness * (pos[key] - target[key]) - damping * vel[key];
        vel[key] += acceleration * dt;
        pos[key] += vel[key] * dt;
        if (Math.abs(pos[key] - target[key]) < 0.05 && Math.abs(vel[key]) < 0.05) {
          pos[key] = target[key];
          vel[key] = 0;
        } else {
          moving = true;
        }
      }
      // Keep every pill edge inside the bar: nothing may pass Home's left end or Settings' right end.
      for (const key of EDGE_KEYS) {
        if (pos[key] < 0 || pos[key] > BAR.w) {
          pos[key] = Math.min(BAR.w, Math.max(0, pos[key]));
          vel[key] = 0;
        }
      }
      if (pos.activeLeft > pos.activeRight) pos.activeLeft = pos.activeRight;
      position.current = pos;
      velocity.current = vel;
      setEdges(pos);
      if (moving) frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [index, dot]);

  const pillH = BAR.h * s;
  const path = useMemo(() => {
    // A side group that is emptying (moving to Home or to Settings) keeps full pill height
    // until the active pill has covered it, so it's absorbed at the bar's end instead of
    // shrinking into a little dot that pokes out past the active pill's curve.
    let beforeRight = edges.beforeRight;
    if (index === 0 && beforeRight > 0.01) beforeRight = Math.max(beforeRight, BAR.h);
    let afterLeft = edges.afterLeft;
    if (index === TABS.length - 1 && afterLeft < BAR.w - 0.01) afterLeft = Math.min(afterLeft, BAR.w - BAR.h);
    return gooeyPath(
      [
        { left: 0, right: beforeRight * s },
        { left: edges.activeLeft * s, right: edges.activeRight * s },
        { left: afterLeft * s, right: BAR.w * s },
      ],
      pillH,
      BRIDGE_REACH * s,
    );
  }, [edges, index, s, pillH]);
  const dotX = useMemo(
    () =>
      dot.interpolate({
        inputRange: TABS.map((_, i) => i),
        outputRange: TABS.map((tab) => ((tab.cell[0] + tab.cell[1]) / 2 - DOT.size / 2) * s),
      }),
    [dot, s],
  );

  // Center the pills + dot in the green area between the card and the bottom of the screen.
  const chinTop = frame.top(CARD_BOTTOM, 'footer');
  const top = ((drawnHeight ?? frame.height) + chinTop) / 2 - (GROUP_H * s) / 2;

  return (
    <View
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setDrawnHeight(e.nativeEvent.layout.height)}
    >
      <View
        pointerEvents="none"
        style={{ position: 'absolute', left: frame.left(BAR.x), top, width: BAR.w * s, height: GROUP_H * s }}
      >
        {/* Exactly the bar's width: the morph can never draw outside Home's and Settings' ends. */}
        <Svg width={BAR.w * s} height={pillH} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Path d={path} fill="#fff" />
        </Svg>

        {TABS.map((tab) => (
          <Text
            key={tab.route}
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
            style={[
              styles.label,
              {
                left: tab.cell[0] * s,
                width: (tab.cell[1] - tab.cell[0]) * s,
                height: pillH,
                lineHeight: pillH,
                fontSize: 12 * s,
              },
            ]}
          >
            {tab.label}
          </Text>
        ))}

        <Animated.Image
          source={ui.common.navDot.source}
          resizeMode="stretch"
          style={{
            position: 'absolute',
            left: 0,
            top: (BAR.h + DOT.gap) * s,
            width: DOT.size * s,
            height: DOT.size * s,
            transform: [{ translateX: dotX }],
          }}
        />
      </View>

      {/* Touch zone over the bar: tap a tab, or swipe left/right to change tabs. */}
      <View
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ position: 'absolute', left: 0, right: 0, top: top - 8 * s, height: (GROUP_H + 12) * s }}
      >
        {TABS.map((tab, i) => (
          <Pressable
          key={tab.route}
          accessibilityRole="tab"
          accessibilityLabel={tab.label}
          accessibilityState={{ selected: i === index }}
          onPress={() => {
            const route = state.routes[i];
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (i !== index && !event.defaultPrevented) navigation.navigate(route.name);
          }}
          style={{
            position: 'absolute',
            left: frame.left(BAR.x + tab.cell[0] - 6),
            top: 0,
            width: (tab.cell[1] - tab.cell[0] + 12) * s,
            height: (GROUP_H + 12) * s,
          }}
        />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    position: 'absolute',
    top: 0,
    textAlign: 'center',
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#202020',
  },
});
