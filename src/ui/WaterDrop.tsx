import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useRect } from './Artboard';

// A vector copy of the Figma water drop (measured from its 3x export, on its 132×132 canvas):
// teardrop with a 2.3pt dark outline and blue water whose level can change.
const TIP_Y = 12.3;
const CENTER_X = 65.85;
const BULB_Y = 79; // center of the round bottom
const R = 33.7;
const BOTTOM_Y = BULB_Y + R;
const DROP =
  `M${CENTER_X} ${TIP_Y}` +
  `C${CENTER_X + 17.4} ${TIP_Y + 21.3} ${CENTER_X + R} ${TIP_Y + 43.5} ${CENTER_X + R} ${BULB_Y}` +
  `A${R} ${R} 0 0 1 ${CENTER_X - R} ${BULB_Y}` +
  `C${CENTER_X - R} ${TIP_Y + 43.5} ${CENTER_X - 17.4} ${TIP_Y + 21.3} ${CENTER_X} ${TIP_Y}Z`;
/** Everything around the drop, for the white cover over the water (the drop is its hole). */
const AROUND_DROP = `M-1 -1H133V133H-1Z ${DROP}`;

/**
 * The strip (canvas x) the water shows through: the drop plus a margin. Its edges sit under
 * the solid part of the white cover, so no sliver of water can show at them (even mid-slide).
 */
const STRIP_LEFT = CENTER_X - R - 6;
const STRIP_WIDTH = 2 * (R + 6);

/** One wave (canvas units), how high its crests rise above the surface, and how long it takes to roll by (ms). */
const WAVE = 66;
const CREST = 3.5;
const ROLL_MS = 2800;

/**
 * Where the surface sits (canvas y) when the drop is full, empty, and drained between visits.
 * Full keeps the troughs above the tip and empty the crests below the bottom, so a full drop
 * is all water and an empty one has none. Drained is low enough that even the choppy waves of a
 * fill starting (see SWELL) stay out of sight.
 */
const FULL_Y = TIP_Y - CREST - 1.5;
const EMPTY_Y = BOTTOM_Y + CREST + 1.5;
const surfaceY = (level: number) => EMPTY_Y + (FULL_Y - EMPTY_Y) * level;
/** The water reaches this far below its surface (canvas units): past the bottom from the top. */
const DEPTH = 140;

/**
 * Filling: the water rises to its level, slowing as it gets there and settling with a little
 * slosh (a 4% overshoot). The waves start out this much taller and calm down as it settles. A
 * fill from empty to full takes FILL_MS (shorter ones go quicker).
 */
const FILL_MS = { least: 600, full: 1600 };
/** Filling up from empty always pours at least like this share of a full pour (~1.1 s, waves ×1.6). */
const FRESH_POUR_SHARE = 0.5;
const SLOSH = Easing.out(Easing.back(1.1));
const SWELL = 2.2;
/** Out of sight this long (ms, past the tabs' slide), the drop drains, ready to fill up again. */
const DRAIN_AFTER_MS = 400;
const DRAINED_Y = BOTTOM_Y + CREST * SWELL + 1.5;

// Native driver on the phone. (The web preview plays a native-driver loop only once.)
const useNativeDriver = Platform.OS !== 'web';

/**
 * The water: a gentle wave along the surface (at y = DEPTH, the middle, so it swells about its
 * own surface), repeating every WAVE and running one wave past each side, so sliding it left by
 * one wave loops seamlessly, with water below it down to 2 × DEPTH.
 */
const WATER = (() => {
  let d = `M${-WAVE} ${DEPTH}`;
  for (let x = -WAVE; x < 132 + WAVE; x += WAVE) {
    d += `Q${x + WAVE / 4} ${DEPTH - CREST} ${x + WAVE / 2} ${DEPTH}T${x + WAVE} ${DEPTH}`;
  }
  return d + `L${132 + WAVE} ${2 * DEPTH}L${-WAVE} ${2 * DEPTH}Z`;
})();

export type WaterDropHandle = {
  /** The drop is on screen: pour the water in (from empty, if it was drained) up to its level. */
  pour: () => void;
  /** The drop is going out of sight: drain it once it's gone, so it fills up again next time. */
  drain: () => void;
};

type Props = {
  x: number;
  y: number;
  size: number;
  /** How full the drop is (0–1). */
  level: number;
  ref?: Ref<WaterDropHandle>;
};

/**
 * The Usage screen's water drop. It starts out empty; when it's poured (see WaterDropHandle) it
 * fills up to its level, and a new level fills or drains to there, while the water's surface
 * gently rolls. The water moves in a plain view, all on the native driver, under a white cover
 * with a drop-shaped hole (the box behind the drop is white), so nothing in the SVGs is animated.
 * Pouring and draining go through the handle rather than props, so they never re-render anything.
 */
export function WaterDrop({ x, y, size, level, ref }: Props) {
  const rect = useRect({ x, y }, size, size);
  const k = rect.width / 132; // dp per canvas unit
  const fill = Math.min(1, Math.max(0, level));
  const [roll] = useState(() => new Animated.Value(0));
  const [surface] = useState(() => new Animated.Value(DRAINED_Y));
  const [swell] = useState(() => new Animated.Value(1));
  // Where the surface is headed (canvas y), so the next move knows how far it has to go.
  const headed = useRef(DRAINED_Y);

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(roll, { toValue: 1, duration: ROLL_MS, easing: Easing.linear, useNativeDriver }));
    loop.start();
    return () => loop.stop();
  }, [roll]);

  // Moves the water to a level (canvas y). A move already under way just carries on from
  // wherever it's got to (going out of sight doesn't stop it; draining does), so it can't be
  // left half full.
  const moveTo = useCallback(
    (to: number) => {
      const from = headed.current;
      // Filling up from empty: drained between visits, or with nothing to show before (no estimate yet).
      const fresh = from >= EMPTY_Y;
      if (fresh && to >= EMPTY_Y) return;
      // Share of a full pour this move is: it sets how long it takes and how choppy it gets.
      let share = Math.min(1, Math.abs(to - from) / (DRAINED_Y - FULL_Y));
      if (share < 0.005) return;
      headed.current = to;
      // Filling up from empty is a proper pour, however little goes in.
      if (fresh) share = Math.max(share, FRESH_POUR_SHARE);
      const duration = FILL_MS.least + (FILL_MS.full - FILL_MS.least) * share;
      Animated.parallel([
        Animated.timing(surface, { toValue: to, duration, easing: SLOSH, useNativeDriver }),
        Animated.sequence([
          Animated.timing(swell, { toValue: 1 + (SWELL - 1) * share, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver }),
          Animated.timing(swell, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver }),
        ]),
      ]).start();
    },
    [surface, swell],
  );

  // Poured: showing its level (or on the way there). And the latest level, for the next pour.
  const poured = useRef(false);
  const target = useRef(surfaceY(fill));
  const drainLater = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(drainLater.current), []);
  useImperativeHandle(
    ref,
    () => ({
      pour() {
        clearTimeout(drainLater.current);
        poured.current = true;
        moveTo(target.current);
      },
      drain() {
        poured.current = false;
        clearTimeout(drainLater.current);
        drainLater.current = setTimeout(() => {
          surface.stopAnimation();
          swell.stopAnimation();
          surface.setValue(DRAINED_Y);
          swell.setValue(1);
          headed.current = DRAINED_Y;
        }, DRAIN_AFTER_MS);
      },
    }),
    [moveTo, surface, swell],
  );
  // A new level: filled or drained to straight away if it's showing, else poured next time.
  useEffect(() => {
    target.current = surfaceY(fill);
    if (poured.current) moveTo(target.current);
  }, [fill, moveTo]);

  const water = useMemo(
    () => ({
      position: 'absolute' as const,
      left: (-WAVE - STRIP_LEFT) * k,
      // Laid out with its surface at the top of the drop's canvas; moved down to the level.
      top: -DEPTH * k,
      width: (132 + 2 * WAVE) * k,
      height: 2 * DEPTH * k,
      transform: [
        { translateX: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -WAVE * k] }) },
        { translateY: surface.interpolate({ inputRange: [0, 1], outputRange: [0, k] }) },
        // About the view's middle, which is the surface: the waves get taller, the water below
        // just reaches further down.
        { scaleY: swell },
      ],
    }),
    [k, roll, surface, swell],
  );

  return (
    <View pointerEvents="none" style={rect}>
      <View style={[styles.clip, { left: STRIP_LEFT * k, width: STRIP_WIDTH * k, height: rect.height }]}>
        <Animated.View style={water}>
          <Svg width={(132 + 2 * WAVE) * k} height={2 * DEPTH * k} viewBox={`${-WAVE} 0 ${132 + 2 * WAVE} ${2 * DEPTH}`}>
            <Path d={WATER} fill="#03A7FE" />
          </Svg>
        </Animated.View>
      </View>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 132 132">
        <Path d={AROUND_DROP} fill="#fff" fillRule="evenodd" />
        <Path d={DROP} fill="none" stroke="#2D2C2C" strokeWidth={2.33} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', top: 0, overflow: 'hidden' },
});
