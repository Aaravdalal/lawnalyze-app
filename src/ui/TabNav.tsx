import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { TAB_CHIN_DROP, useFrameMetrics } from './Artboard';
import { ui } from './assets';

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
/** A touch on the bar held longer than this before lifting counts as press-and-drag. */
const HOLD_MS = 300;
/**
 * The pill's spring: it overshoots the tapped tab a little and bounces back (damping ratio
 * ≈ 0.6). At Home or Settings the overshoot presses it into the bar's rounded end.
 */
const BOUNCE = { stiffness: 320, damping: 22, mass: 1 };
/**
 * The overshoot grows with the distance travelled, so the long jump between Home and Settings
 * (three tabs) gets more damping (ratio ≈ 0.75): it bounces about as far as a one-tab move.
 */
const LONG_JUMP_DAMPING = 27;

/**
 * Where the pills sit for a given active tab: the active tab's pill, and the right end of the
 * pill before it / left end of the pill after it. On Home (or Settings) the empty side pill
 * rests under the active pill, so it slides out from underneath when the active pill leaves.
 */
function layoutFor(index: number) {
  const [activeLeft, activeRight] = TABS[index].cell;
  const last = TABS.length - 1;
  return {
    activeLeft,
    beforeRight: index > 0 ? TABS[index - 1].cell[1] : activeRight,
    afterLeft: index < last ? TABS[index + 1].cell[0] : activeLeft,
  };
}
const LAYOUTS = TABS.map((_, i) => layoutFor(i));
const PILL_W = TABS[0].cell[1] - TABS[0].cell[0]; // every tab's cell is the same width

type Props = BottomTabBarProps & {
  /** How far a swipe has dragged the tab screens (dp; negative is toward the next tab)... */
  drag?: Animated.Value;
  /** ...and how wide they are: a full width's drag is one tab along. */
  pageWidth?: number;
};

/**
 * The Home / Usage / Rebates / Settings bar. Tapping a tab slides the white pill over to it
 * (and the pills beside it follow), along with the dot underneath. Mid-swipe, the pill moves
 * along with the screens.
 */
export function TabNav({ state, navigation, drag, pageWidth }: Props) {
  const frame = useFrameMetrics(TAB_CHIN_DROP);
  const s = frame.scale;
  const index = state.index;
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null);

  // The bar's position as a tab index (fractional mid-slide, and a little past the tab while it
  // bounces). Runs on the native driver, so
  // the pill keeps sliding smoothly even while the new screen is busy mounting.
  const [position] = useState(() => new Animated.Value(index));

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

  const previousIndex = useRef(index);
  useEffect(() => {
    const jump = Math.abs(index - previousIndex.current);
    previousIndex.current = index;
    // Starts from wherever the pill is now, so quick taps just redirect it.
    Animated.spring(position, {
      toValue: index,
      ...BOUNCE,
      damping: jump >= TABS.length - 1 ? LONG_JUMP_DAMPING : BOUNCE.damping,
      useNativeDriver: true,
    }).start();
  }, [index, position]);

  const pillH = BAR.h * s;
  const slide = useMemo(() => {
    const at = drag && pageWidth ? Animated.add(position, Animated.multiply(drag, -1 / pageWidth)) : position;
    const along = (x: (i: number) => number) =>
      at.interpolate({ inputRange: TABS.map((_, i) => i), outputRange: TABS.map((_, i) => x(i) * s) });
    return {
      active: along((i) => LAYOUTS[i].activeLeft),
      // Side pills are full-bar-wide pills clipped by the bar's rounded ends (see below).
      before: along((i) => LAYOUTS[i].beforeRight - BAR.w),
      after: along((i) => LAYOUTS[i].afterLeft),
      dot: along((i) => (TABS[i].cell[0] + TABS[i].cell[1]) / 2 - DOT.size / 2),
    };
  }, [position, s, drag, pageWidth]);

  // Center the pills + dot in the green area between the card and the bottom of the screen.
  const bottom = drawnHeight ?? frame.height;
  const chinTop = frame.top(CARD_BOTTOM, 'footer');
  const top = (bottom + chinTop) / 2 - (GROUP_H * s) / 2;

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
        {/* Clipped to the bar's rounded ends: the side pills are the bar's own width, slid so
            that only their visible end moves, and nothing can show outside Home or Settings. */}
        <View style={[styles.track, { width: BAR.w * s, height: pillH, borderRadius: pillH / 2 }]}>
          <Animated.View style={[styles.pill, { width: BAR.w * s, borderRadius: pillH / 2, transform: [{ translateX: slide.before }] }]} />
          <Animated.View style={[styles.pill, { width: BAR.w * s, borderRadius: pillH / 2, transform: [{ translateX: slide.after }] }]} />
          <Animated.View style={[styles.pill, { width: PILL_W * s, borderRadius: pillH / 2, transform: [{ translateX: slide.active }] }]} />
        </View>

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
            transform: [{ translateX: slide.dot }],
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
  track: { position: 'absolute', left: 0, top: 0, overflow: 'hidden' },
  pill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#fff' },
  label: {
    position: 'absolute',
    top: 0,
    textAlign: 'center',
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#202020',
  },
});
