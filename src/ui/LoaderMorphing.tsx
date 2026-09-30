import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useFrame } from './Artboard';

type Props = {
  size?: number;
  color?: string;
  /** One full cycle (ms). */
  duration?: number;
};

// The cycle's four quarters: square-ish → round → square-ish → round → back, a quarter turn
// and a swell with each.
const RADIUS = [0.2, 0.5, 0.2, 0.5, 0.2];
const ROTATE = ['0deg', '90deg', '180deg', '270deg', '360deg'];
const SCALE = [1, 1.2, 1, 1.2, 1];
const STEPS = [0, 1, 2, 3, 4];

/**
 * Loading indicator: a rounded square that morphs into a circle and back while turning and
 * gently swelling, easing in and out through each quarter of the cycle.
 */
export function LoaderMorphing({ size = 40, color = '#fff', duration = 2000 }: Props) {
  const [step] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const quarter = (to: number) =>
      Animated.timing(step, {
        toValue: to,
        duration: duration / 4,
        easing: Easing.inOut(Easing.ease),
        // Corner radius can't run on the native driver, and one view can't mix the two.
        useNativeDriver: false,
      });
    const loop = Animated.loop(Animated.sequence([quarter(1), quarter(2), quarter(3), quarter(4)]));
    loop.start();
    return () => loop.stop();
  }, [step, duration]);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        borderRadius: step.interpolate({ inputRange: STEPS, outputRange: RADIUS.map((r) => r * size) }),
        transform: [
          { rotate: step.interpolate({ inputRange: STEPS, outputRange: ROTATE }) },
          { scale: step.interpolate({ inputRange: STEPS, outputRange: SCALE }) },
        ],
      }}
    />
  );
}

/** While an address is being looked up: the white morphing loader, in a button's right end. */
export function ButtonSpinner() {
  const { scale } = useFrame();
  return (
    <View pointerEvents="none" style={[styles.spinner, { right: 16 * scale }]}>
      <LoaderMorphing size={17 * scale} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
});
