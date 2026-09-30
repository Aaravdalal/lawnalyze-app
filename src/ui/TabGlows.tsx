import { useMemo } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Artboard, Layer, TAB_CHIN_DROP, type Glow } from './Artboard';
import { ui } from './assets';

const { common } = ui;

/** Where the tab screens' card ends (design pts). */
const CARD_BOTTOM = 568;
/** Each tab's soft green glows (design pts), in the nav bar's order. */
const GLOWS: Glow[][] = [
  // Home
  [
    { asset: common.glowWide, x: 18, y: 135 },
    { asset: common.glow, x: -121, y: 33 },
    { asset: common.glow, x: -42, y: 207 },
    { asset: common.glow, x: -115, y: -114 },
    { asset: common.glow, x: -110, y: -107 },
  ],
  // Usage
  [
    { asset: common.glowWide, x: -59, y: 182 },
    { asset: common.glow, x: 32, y: -99 },
    { asset: common.glow, x: -128, y: 4 },
    { asset: common.glow, x: -38, y: -109 },
    { asset: common.glow, x: 62, y: 135 },
  ],
  // Rebates
  [
    { asset: common.glow, x: 31, y: -112 },
    { asset: common.glowTall, x: -105, y: -108 },
    { asset: common.glow, x: -45, y: 192 },
  ],
  // Settings
  [
    { asset: common.glow, x: -284, y: -15 },
    { asset: common.glowTall, x: -17, y: 79 },
  ],
];
/** The glows move this share of the way the screens do, so they read as the background. */
const DRIFT = 0.3;

type Props = {
  /** The tab showing, 0 (Home) to 3 (Settings): in between mid-swipe or mid-slide. */
  at: Animated.AnimatedAddition<number>;
  /** The screens' width (dp). */
  width: number;
};

/**
 * The tab screens' soft green glows, drawn once behind all of them. The screens slide over it
 * while it crossfades from one tab's glows to the next (drifting a little the same way), so the
 * background never shows an edge where two screens meet.
 */
export function TabGlows({ at, width }: Props) {
  const tabs = useMemo(() => {
    const tab = at.interpolate({
      inputRange: [0, GLOWS.length - 1],
      outputRange: [0, GLOWS.length - 1],
      extrapolate: 'clamp',
    });
    return GLOWS.map((_, i) => ({
      opacity: tab.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
      transform: [{ translateX: tab.interpolate({ inputRange: [i - 1, i + 1], outputRange: [DRIFT * width, -DRIFT * width] }) }],
    }));
  }, [at, width]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Artboard cardBottom={CARD_BOTTOM} compactChin={TAB_CHIN_DROP}>
        {GLOWS.map((glows, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, tabs[i]]}>
            {glows.map((glow, k) => (
              <Layer key={k} asset={glow.asset} x={glow.x} y={glow.y} />
            ))}
          </Animated.View>
        ))}
      </Artboard>
    </View>
  );
}
