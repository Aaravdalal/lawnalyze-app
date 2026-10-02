import { useSegments } from 'expo-router';
import Stack, { type StackCardStyleInterpolator } from 'expo-router/js-stack';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';

import { ui } from '@/ui/assets';
import { PAGE_SLIDE } from '@/ui/motion';
import { SceneGlows, type Backdrop } from '@/ui/SceneGlows';

const { common } = ui;

/** The setup screens (route names), in the order they slide in. */
const SCREENS = ['index', 'locate', 'mark', 'footage'] as const;
type Screen = (typeof SCREENS)[number];
/**
 * Each setup screen's glows (design pts), drawn once behind all of them like the tabs' (see
 * SceneGlows), so they cross-fade while the screens slide instead of sliding along with them.
 */
const BACKDROPS: Backdrop[] = [
  // Intro
  {
    gradientY: 0,
    glows: [
      { asset: common.glow, x: 67, y: 46 },
      { asset: common.glow, x: 58, y: 68 },
      { asset: common.glow, x: -40, y: -451 },
      { asset: common.glow, x: -77, y: 46 },
      { asset: common.glow, x: -135, y: 59 },
    ],
  },
  // Locate
  {
    glows: [
      { asset: common.glow, x: -169, y: 0 },
      { asset: common.glow, x: 8, y: 21 },
      { asset: common.glow, x: 26, y: -133 },
    ],
  },
  // Mark
  {
    glows: [
      { asset: common.glow, x: 221, y: -148 },
      { asset: common.glow, x: -38, y: -137 },
      { asset: common.glow, x: 19, y: 49 },
    ],
  },
  // Square footage
  {
    glows: [
      { asset: common.glow, x: 18, y: 48 },
      { asset: common.glow, x: 50, y: -28 },
      { asset: common.glow, x: -145, y: -150 },
    ],
  },
];
/** Where the setup screens' card ends (design pts). */
const CARD_BOTTOM = 548;
const useNativeDriver = Platform.OS !== 'web';

/**
 * Like the tabs: the next screen slides in from the right as the one before slides out to the
 * left, all the way across, and the other way going back. (The white page and green chin behind
 * them stay put: see SharedChin.)
 */
const pageSlide: StackCardStyleInterpolator = ({ current, next, layouts: { screen } }) => {
  const coming = current.progress.interpolate({ inputRange: [0, 1], outputRange: [screen.width, 0], extrapolate: 'clamp' });
  const going = next?.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -screen.width], extrapolate: 'clamp' });
  return { cardStyle: { transform: [{ translateX: going ? Animated.add(coming, going) : coming }] } };
};
const SLIDE_SPEC = { animation: 'timing', config: PAGE_SLIDE } as const;

// The setup screens: Intro, Locate, Mark and Square Footage (Mark and Square Footage are also
// Settings > Edit Lawn).
export default function OnboardingLayout() {
  const segments = useSegments();
  const screen = Math.max(0, SCREENS.indexOf(segments[segments.length - 1] as Screen));
  const { width } = useWindowDimensions();

  // The screen showing, for the glows: glides over with each slide, as it starts.
  const [at] = useState(() => new Animated.Value(screen));
  const showing = useRef(screen);
  useLayoutEffect(() => {
    showing.current = screen;
  }, [screen]);
  const glide = useCallback(
    () => Animated.timing(at, { toValue: showing.current, ...PAGE_SLIDE, useNativeDriver }).start(),
    [at],
  );

  return (
    <View style={styles.fill}>
      <SceneGlows backdrops={BACKDROPS} at={at} width={width} cardBottom={CARD_BOTTOM} compactChin />
      {/* Screens not showing (one built ahead of time, like Locate from the intro, or one left
          behind) are detached, so their full-screen layers can't catch touches meant for the
          screen that is. */}
      <Stack
        screenListeners={{ transitionStart: glide }}
        screenOptions={{
          headerShown: false,
          // Slides on every platform (the stack's own default is none in a browser).
          animation: 'default',
          // The maps take sideways drags.
          gestureEnabled: false,
          // See-through, so the glows and the shared page and chin show behind.
          cardStyle: { backgroundColor: 'transparent' },
          cardOverlayEnabled: false,
          cardShadowEnabled: false,
          cardStyleInterpolator: pageSlide,
          transitionSpec: { open: SLIDE_SPEC, close: SLIDE_SPEC },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Cards parked off to the side are clipped (in a browser they'd otherwise widen the page).
  fill: { flex: 1, overflow: 'hidden' },
});
