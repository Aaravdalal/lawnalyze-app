import { memo } from 'react';
import type { Animated } from 'react-native';

import { TAB_CHIN_DROP } from './Artboard';
import { ui } from './assets';
import { SceneGlows, type Backdrop } from './SceneGlows';

const { common } = ui;

/** Where the tab screens' card ends (design pts). */
const CARD_BOTTOM = 568;
/** Each tab's soft green glows (design pts), in the nav bar's order. */
const BACKDROPS: Backdrop[] = [
  // Home
  {
    glows: [
      { asset: common.glowWide, x: 18, y: 135 },
      { asset: common.glow, x: -121, y: 33 },
      { asset: common.glow, x: -42, y: 207 },
      { asset: common.glow, x: -115, y: -114 },
      { asset: common.glow, x: -110, y: -107 },
    ],
  },
  // Usage
  {
    glows: [
      { asset: common.glowWide, x: -59, y: 182 },
      { asset: common.glow, x: 32, y: -99 },
      { asset: common.glow, x: -128, y: 4 },
      { asset: common.glow, x: -38, y: -109 },
      { asset: common.glow, x: 62, y: 135 },
    ],
  },
  // Rebates
  {
    glows: [
      { asset: common.glow, x: 31, y: -112 },
      { asset: common.glowTall, x: -105, y: -108 },
      { asset: common.glow, x: -45, y: 192 },
    ],
  },
  // Settings
  {
    glows: [
      { asset: common.glow, x: -284, y: -15 },
      { asset: common.glowTall, x: -17, y: 79 },
    ],
  },
];

type Props = {
  /** The tab showing, 0 (Home) to 3 (Settings): in between mid-swipe or mid-slide. */
  at: Animated.AnimatedAddition<number>;
  /** The screens' width (dp). */
  width: number;
};

/**
 * The tab screens' soft green glows, drawn once behind all of them (see SceneGlows). (Memo:
 * switching tab re-renders the tabs' layout, and nothing here changes with it.)
 */
export const TabGlows = memo(function TabGlows({ at, width }: Props) {
  return <SceneGlows backdrops={BACKDROPS} at={at} width={width} cardBottom={CARD_BOTTOM} compactChin={TAB_CHIN_DROP} />;
});
