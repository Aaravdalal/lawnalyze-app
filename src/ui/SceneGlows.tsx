import { memo, useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Artboard, Gradient, Layer, type Glow } from './Artboard';

/** One screen's background: its soft green glows, and on intro screens the gradient at the top. */
export type Backdrop = { glows: Glow[]; gradientY?: number };

/** The glows move this share of the way the screens do, so they read as the background. */
const DRIFT = 0.3;

type Props = {
  /** Each screen's backdrop, in the order the screens slide in. */
  backdrops: Backdrop[];
  /** The screen showing (an index into `backdrops`): in between mid-swipe or mid-slide. */
  at: Animated.Value | Animated.AnimatedAddition<number>;
  /** The screens' width (dp). */
  width: number;
  /** The screens' Artboard layout, so the glows land where the screens would draw them. */
  cardBottom: number;
  compactChin: boolean | number;
};

/**
 * Several screens' backgrounds, drawn once behind all of them. The screens slide over it while
 * it cross-fades from one screen's backdrop to the next (the glows drifting a little the same
 * way), so the background never shows an edge where two screens meet. (Memo: whatever moves
 * between screens re-renders around it, and nothing here changes with that.)
 */
export const SceneGlows = memo(function SceneGlows({ backdrops, at, width, cardBottom, compactChin }: Props) {
  const looks = useMemo(() => {
    const last = backdrops.length - 1;
    const scene = at.interpolate({ inputRange: [0, last], outputRange: [0, last], extrapolate: 'clamp' });
    return backdrops.map((_, i) => ({
      opacity: scene.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
      transform: [{ translateX: scene.interpolate({ inputRange: [i - 1, i + 1], outputRange: [DRIFT * width, -DRIFT * width] }) }],
    }));
  }, [at, width, backdrops]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Artboard cardBottom={cardBottom} compactChin={compactChin}>
        {backdrops.map((backdrop, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: looks[i].opacity }]}>
            {/* The gradient spans the screen, so it only fades: drifting would show its ends. */}
            {backdrop.gradientY !== undefined && <Gradient y={backdrop.gradientY} />}
            <Animated.View style={[StyleSheet.absoluteFill, { transform: looks[i].transform }]}>
              {backdrop.glows.map((glow, k) => (
                <Layer key={k} asset={glow.asset} x={glow.x} y={glow.y} />
              ))}
            </Animated.View>
          </Animated.View>
        ))}
      </Artboard>
    </View>
  );
});
