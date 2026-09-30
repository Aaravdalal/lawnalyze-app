import { router, useSegments } from 'expo-router';
import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { TAB_CHIN_DROP, useFrameMetrics } from '@/ui/Artboard';
import { TabGlows } from '@/ui/TabGlows';
import { TabNav } from '@/ui/TabNav';

/** The tabs in order, left to right (same as the nav bar). */
const TABS = ['home', 'usage', 'rebates', 'settings'] as const;
type Tab = (typeof TABS)[number];
/** Where the card ends and the green chin with the nav bar begins (design pts). */
const CARD_BOTTOM = 568;
/**
 * A finger moves this far (dp) sideways before the screens start following it. More than the
 * hold-to-drag sections allow before giving up on a hold (the touch slop: 15 on the web, ~8 on
 * Android), so they've always let go of the touch by the time a swipe takes it.
 */
const SLOP = 16;
/** Let go past this share of the screen's width, or flick faster than this (dp/s), to change tab. */
const COMMIT_SHARE = 0.25;
const FLICK_VELOCITY = 450;
/** Past the first or last tab there's nothing to pull in, so the screen only gives a little. */
const EDGE_GIVE = 0.3;
/** How screens slide over to a new tab, swiped or tapped on the bar. */
const SLIDE = { duration: 280, easing: Easing.out(Easing.cubic) };
/** A swipe that doesn't change tab springs back. */
const SNAP_BACK = { stiffness: 400, damping: 38, mass: 1 };
/** Same as the navigator's own slide, which the swipe runs in step with. */
const useNativeDriver = Platform.OS !== 'web';
const EPSILON = 1e-3;

type SceneInterpolator = NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>;

/** Extra room (dp) off screen for tab `i` while tab `current` shows: none for its neighbours. */
const parkFor = (i: number, current: number, width: number) => Math.max(0, Math.abs(i - current) - 1) * width;

/**
 * Where a tab's screen sits. The navigator moves each screen between -1 (off to the left),
 * 0 (showing) and 1 (off to the right): here that's a full screen width, plus however far a
 * swipe has dragged the screens. Waiting off screen (exactly ±1), tabs more than one away also
 * get `park`, so only the neighbours sit right at the edge, ready for a swipe to pull them in,
 * and the rest never pile up behind them.
 */
function slideScene(width: number, drag: Animated.Value, park: Animated.Value): SceneInterpolator {
  return ({ current: { progress } }) => {
    const waiting = progress.interpolate({ inputRange: [-1, -1 + EPSILON, 1 - EPSILON, 1], outputRange: [-1, 0, 0, 1] });
    const slid = progress.interpolate({ inputRange: [-1, 1], outputRange: [-width, width] });
    return {
      sceneStyle: { transform: [{ translateX: Animated.add(Animated.add(slid, drag), Animated.multiply(waiting, park)) }] },
    };
  };
}

const snapBack = (drag: Animated.Value, velocity: number) =>
  Animated.spring(drag, { toValue: 0, velocity, ...SNAP_BACK, useNativeDriver }).start();

// The Figma nav bar is drawn over the tab screens (see TabNav) so it can animate between tabs.
export default function TabsLayout() {
  const segments = useSegments();
  const current = TABS.indexOf(segments[segments.length - 1] as Tab);
  const frame = useFrameMetrics(TAB_CHIN_DROP);
  const chinTop = frame.top(CARD_BOTTOM, 'footer');
  const [size, setSize] = useState({ width: frame.width, height: frame.height });

  // How far (dp) a swipe has dragged the screens; negative is toward the next tab.
  const [drag] = useState(() => new Animated.Value(0));
  const [parks] = useState(() => TABS.map((_, i) => new Animated.Value(parkFor(i, Math.max(0, current), frame.width))));

  // The tab showing, for the glows behind the screens: moves with the screens' slide, and
  // fractionally with a swipe.
  const [position] = useState(() => new Animated.Value(Math.max(0, current)));
  useEffect(() => {
    if (current >= 0) Animated.timing(position, { toValue: current, ...SLIDE, useNativeDriver }).start();
  }, [current, position]);
  const shown = useMemo(() => Animated.add(position, Animated.multiply(drag, -1 / size.width)), [position, drag, size.width]);

  // Swipe left or right anywhere on the card: the screens follow the finger, the next (or
  // previous) tab sliding in beside the current one. Let go far enough along, or flick, and it
  // carries on to that tab; otherwise it springs back. (Vertical drags, like rearranging
  // sections, don't count.) The green chin is left out: the nav bar there has its own swipes.
  const swipe = useMemo(() => {
    const hasNeighbour = (x: number) => (x < 0 ? current < TABS.length - 1 : current > 0);
    // The gesture measures from where it took over, so the screens start following from there.
    return Gesture.Pan()
      .enabled(current >= 0)
      .hitSlop({ bottom: -Math.max(0, size.height - chinTop) })
      .activeOffsetX([-SLOP, SLOP])
      .failOffsetY([-SLOP, SLOP])
      .runOnJS(true)
      .onUpdate((e) => {
        const x = e.translationX;
        drag.setValue(hasNeighbour(x) ? Math.max(-size.width, Math.min(size.width, x)) : x * EDGE_GIVE);
      })
      .onEnd((e, success) => {
        const x = e.translationX;
        const flick = Math.abs(e.velocityX) >= FLICK_VELOCITY;
        const onward = flick ? e.velocityX * x > 0 : Math.abs(x) >= size.width * COMMIT_SHARE;
        if (success && x !== 0 && hasNeighbour(x) && onward) router.navigate(`/${TABS[current + (x < 0 ? 1 : -1)]}`);
        else snapBack(drag, e.velocityX);
      });
  }, [current, size, chinTop, drag]);

  // Made once (and again only if the width changes): re-rendering the navigator restarts its
  // slide, which would cut a slide short, so changing tab mustn't re-render it from here.
  const tabs = useMemo(
    () => (
      <Tabs
        tabBar={(props) => <TabNav {...props} drag={drag} pageWidth={size.width} />}
        // Keep every tab mounted and attached, so switching tabs is instant and nothing reloads.
        detachInactiveScreens={false}
        screenListeners={({ route }) => ({
          // A swiped screen goes the rest of the way with the navigator's slide, in step (same
          // timing, started together), so the two never pull against each other.
          transitionStart: () => Animated.timing(drag, { toValue: 0, ...SLIDE, useNativeDriver }).start(),
          // Settled on the new tab: the ones more than a tab away move further out.
          transitionEnd: () => {
            const now = TABS.indexOf(route.name as Tab);
            parks.forEach((park, i) => park.setValue(parkFor(i, now, size.width)));
          },
        })}
        screenOptions={{
          headerShown: false,
          lazy: false,
          freezeOnBlur: false,
          // See-through, so the shared green chin behind every screen shows (see app/_layout.tsx).
          sceneStyle: { backgroundColor: 'transparent' },
          transitionSpec: { animation: 'timing', config: SLIDE },
        }}
      >
        {TABS.map((name, i) => (
          <Tabs.Screen key={name} name={name} options={{ sceneStyleInterpolator: slideScene(size.width, drag, parks[i]) }} />
        ))}
      </Tabs>
    ),
    [size.width, drag, parks],
  );

  return (
    <GestureDetector gesture={swipe}>
      <View
        collapsable={false}
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
        }}
      >
        <TabGlows at={shown} width={size.width} />
        {tabs}
      </View>
    </GestureDetector>
  );
}
