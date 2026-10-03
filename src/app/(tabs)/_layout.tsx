import { router, useSegments } from 'expo-router';
import { Tabs, type BottomTabNavigationOptions } from 'expo-router/js-tabs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';

import { TAB_CHIN_DROP, useFrameMetrics } from '@/ui/Artboard';
import { PAGE_SLIDE as SLIDE } from '@/ui/motion';
import { Reveal } from '@/ui/Reveal';
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
/** A swipe that doesn't change tab springs back. */
const SNAP_BACK = { stiffness: 400, damping: 38, mass: 1 };
/**
 * A swipe let go toward a tab slides on by itself until the navigator starts its own slide; if
 * that hasn't happened after this long (ms), it goes back instead.
 */
const HANDOFF_MS = 1000;
/** Same as the navigator's own slide, which the swipe runs in step with. */
const useNativeDriver = Platform.OS !== 'web';
const EPSILON = 1e-3;
/** The tabs show once Home is all loaded, or after this long (ms) anyway (e.g. offline). */
const REVEAL_MAX_MS = 2500;

type SceneInterpolator = NonNullable<BottomTabNavigationOptions['sceneStyleInterpolator']>;
/** How far (dp) a swipe has moved the screens; negative is toward the next tab. */
type Drag = Animated.AnimatedAddition<number>;

/** Extra room (dp) off screen for tab `i` while tab `current` shows: none for its neighbours. */
const parkFor = (i: number, current: number, width: number) => Math.max(0, Math.abs(i - current) - 1) * width;

/**
 * Where a tab's screen sits. The navigator moves each screen between -1 (off to the left),
 * 0 (showing) and 1 (off to the right): here that's a full screen width, plus however far a
 * swipe has dragged the screens. Waiting off screen (exactly ±1), tabs more than one away also
 * get `park`, so only the neighbours sit right at the edge, ready for a swipe to pull them in,
 * and the rest never pile up behind them.
 */
function slideScene(width: number, drag: Drag, park: Animated.Value): SceneInterpolator {
  return ({ current: { progress } }) => {
    const waiting = progress.interpolate({ inputRange: [-1, -1 + EPSILON, 1 - EPSILON, 1], outputRange: [-1, 0, 0, 1] });
    const slid = progress.interpolate({ inputRange: [-1, 1], outputRange: [-width, width] });
    return {
      sceneStyle: { transform: [{ translateX: Animated.add(Animated.add(slid, drag), Animated.multiply(waiting, park)) }] },
    };
  };
}

// The Figma nav bar is drawn over the tab screens (see TabNav) so it can animate between tabs.
export default function TabsLayout() {
  const segments = useSegments();
  const current = TABS.indexOf(segments[segments.length - 1] as Tab);
  const frame = useFrameMetrics(TAB_CHIN_DROP);
  const chinTop = frame.top(CARD_BOTTOM, 'footer');
  const [size, setSize] = useState({ width: frame.width, height: frame.height });
  // For the swipe's callbacks and the navigator's listeners, which are made once.
  const latest = useRef({ current, width: size.width });
  useEffect(() => {
    latest.current = { current, width: size.width };
  }, [current, size.width]);

  // How far (dp) the finger has moved sideways since the swipe took over. The swipe sets it on
  // the native side, with no JS in between, so the screens keep right up with the finger.
  const [finger] = useState(() => new Animated.Value(0));
  // Whether the screens follow it dragged back (right) and on (left): 1 toward a neighbouring
  // tab, 0 toward one that isn't there (before Home or after Settings), so they stay put. (A
  // swipe can't start that way, but a finger can turn round once it has.)
  const [follow] = useState(() => ({ back: new Animated.Value(1), on: new Animated.Value(1) }));
  const drag: Drag = useMemo(
    () =>
      Animated.add(
        Animated.multiply(finger.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: 'clamp' }), follow.back),
        Animated.multiply(finger.interpolate({ inputRange: [-1, 0], outputRange: [-1, 0], extrapolateRight: 'clamp' }), follow.on),
      ),
    [finger, follow],
  );
  const [parks] = useState(() => TABS.map((_, i) => new Animated.Value(parkFor(i, Math.max(0, current), frame.width))));

  // The finger's value is back at 0 with nothing moving it. How much the screens follow only
  // changes then: at any other time, changing it would move them.
  const resting = useRef(true);
  const followTab = useCallback(
    (tab: number) => {
      follow.back.setValue(tab > 0 ? 1 : 0);
      follow.on.setValue(tab < TABS.length - 1 ? 1 : 0);
    },
    [follow],
  );
  useEffect(() => {
    if (current >= 0 && resting.current) followTab(current);
  }, [current, followTab]);
  /** Runs an animation that brings the finger's value back to 0. */
  const release = useCallback(
    (animation: Animated.CompositeAnimation) =>
      animation.start(({ finished }) => {
        if (!finished) return;
        resting.current = true;
        if (latest.current.current >= 0) followTab(latest.current.current);
      }),
    [followTab],
  );
  // A swipe let go toward another tab, sliding on until the navigator's own slide takes over.
  const handoff = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(handoff.current), []);
  // The next tab change comes from a swipe (the nav bar's pill then slides with the screens).
  const swiped = useRef(false);
  // Switches tab the way tapping it does (see TabNav's switchToRef).
  const switchTab = useRef<((name: string) => void) | null>(null);
  const takeSwiped = useCallback(() => {
    const was = swiped.current;
    swiped.current = false;
    return was;
  }, []);

  // The tab showing, for the glows behind the screens: moves with the screens' slide, and
  // fractionally with a swipe.
  const [position] = useState(() => new Animated.Value(Math.max(0, current)));
  useEffect(() => {
    if (current >= 0) Animated.timing(position, { toValue: current, ...SLIDE, useNativeDriver }).start();
  }, [current, position]);
  const shown = useMemo(() => Animated.add(position, Animated.multiply(drag, -1 / size.width)), [position, drag, size.width]);

  // Swipe left or right anywhere on the card: the screens follow the finger, the next (or
  // previous) tab sliding in beside the current one. Let go far enough along, or flick, and it
  // carries on to that tab; otherwise it springs back. There's no tab before Home or after
  // Settings, so there a swipe only starts toward the one next door (left on Home, right on
  // Settings): the other way, the screen doesn't move at all. (Vertical drags, like rearranging
  // sections, don't count.) The green chin is left out: the nav bar there has its own swipes.
  // The gesture measures from where it took over, so the screens start following from there.
  const onSwipe = useMemo(() => Animated.event([{ nativeEvent: { translationX: finger } }], { useNativeDriver }), [finger]);
  const onSwipeState = useCallback(
    ({ nativeEvent: e }: PanGestureHandlerStateChangeEvent) => {
      if (e.state === State.ACTIVE) {
        resting.current = false;
        clearTimeout(handoff.current);
        return;
      }
      if (e.oldState !== State.ACTIVE) return;
      const { current: tab, width } = latest.current;
      const x = e.translationX;
      const to = tab + (x < 0 ? 1 : -1);
      const flick = Math.abs(e.velocityX) >= FLICK_VELOCITY;
      const onward = flick ? e.velocityX * x > 0 : Math.abs(x) >= width * COMMIT_SHARE;
      if (e.state === State.END && x !== 0 && to >= 0 && to < TABS.length && onward) {
        // The screens slide on at once, rather than sitting still while the app switches tab and
        // the navigator gets its own slide going (which then takes over, in step). Only with the
        // native driver: in a browser, the slide can't run until the switch is done anyway.
        if (useNativeDriver) {
          Animated.timing(finger, { toValue: x < 0 ? -width : width, ...SLIDE, useNativeDriver }).start();
          handoff.current = setTimeout(() => {
            swiped.current = false;
            release(Animated.spring(finger, { toValue: 0, ...SNAP_BACK, useNativeDriver }));
          }, HANDOFF_MS);
        }
        swiped.current = true;
        if (switchTab.current) switchTab.current(TABS[to]);
        else router.navigate(`/${TABS[to]}`);
      } else {
        release(Animated.spring(finger, { toValue: 0, velocity: e.velocityX, ...SNAP_BACK, useNativeDriver }));
      }
    },
    [finger, release],
  );

  // Made once (and again only if the width changes): re-rendering the navigator restarts its
  // slide, which would cut a slide short, so changing tab mustn't re-render it from here.
  const tabs = useMemo(
    () => (
      <Tabs
        tabBar={(props) => (
          <TabNav {...props} drag={drag} pageWidth={size.width} takeSwiped={takeSwiped} swipeSlide={SLIDE} switchToRef={switchTab} />
        )}
        // Keep every tab mounted and attached, so switching tabs is instant and nothing reloads.
        detachInactiveScreens={false}
        screenListeners={({ route }) => ({
          // A swiped screen goes the rest of the way with the navigator's slide, in step (same
          // timing, started together), so the two never pull against each other.
          transitionStart: () => {
            clearTimeout(handoff.current);
            release(Animated.timing(finger, { toValue: 0, ...SLIDE, useNativeDriver }));
          },
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
    [size.width, drag, parks, finger, release, takeSwiped],
  );

  return (
    <PanGestureHandler
      enabled={current >= 0}
      hitSlop={{ bottom: -Math.max(0, size.height - chinTop) }}
      // A single offset arms one side only: -SLOP starts on a move left, SLOP on a move right.
      activeOffsetX={current === 0 ? -SLOP : current === TABS.length - 1 ? SLOP : [-SLOP, SLOP]}
      failOffsetY={[-SLOP, SLOP]}
      onGestureEvent={onSwipe}
      onHandlerStateChange={onSwipeState}
    >
      {/* Animated, so the swipe can move `finger` natively. */}
      <Animated.View
        collapsable={false}
        style={{ flex: 1 }}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((was) => (was.width === width && was.height === height ? was : { width, height }));
        }}
      >
        {/* Arriving (from Welcome, or the end of setup), Home shows all at once: the glows, its
            pictures, map, weather and costs. The other tabs are built just after, out of sight
            (see Reveal, and Artboard's loadsLater). */}
        <Reveal maxWait={REVEAL_MAX_MS}>
          <TabGlows at={shown} width={size.width} />
          {tabs}
        </Reveal>
      </Animated.View>
    </PanGestureHandler>
  );
}
