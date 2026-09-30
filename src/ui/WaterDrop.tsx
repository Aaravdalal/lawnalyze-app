import { useEffect, useState } from 'react';
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

/** One wave (canvas units), and how long it takes to roll by (ms). */
const WAVE = 66;
const ROLL_MS = 2800;

/**
 * The water: a gentle wave across the surface, repeating every WAVE and running one wave past
 * each side, so sliding it left by one wave loops seamlessly.
 */
function waterPath(level: number): string {
  const y = BOTTOM_Y - level * (BOTTOM_Y - TIP_Y);
  // Flatten the wave near empty/full so it never pokes out of the drop's narrow ends.
  const a = 3.5 * Math.min(1, level / 0.15, (1 - level) / 0.15);
  let d = `M${-WAVE} ${y}`;
  for (let x = -WAVE; x < 132 + WAVE; x += WAVE) d += `Q${x + WAVE / 4} ${y - a} ${x + WAVE / 2} ${y}T${x + WAVE} ${y}`;
  return d + `L${132 + WAVE} ${BOTTOM_Y + 5}L${-WAVE} ${BOTTOM_Y + 5}Z`;
}

type Props = { x: number; y: number; size: number; level: number };

/**
 * The Usage screen's water drop; `level` (0–1) is how full it is. The water's surface gently
 * rolls: it slides along in a plain view (on the native driver), under a white cover with a
 * drop-shaped hole (the box behind the drop is white), so nothing in the SVGs is animated.
 */
export function WaterDrop({ x, y, size, level }: Props) {
  const rect = useRect({ x, y }, size, size);
  const k = rect.width / 132; // dp per canvas unit
  const fill = Math.min(1, Math.max(0, level));
  const [roll] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Native driver on the phone. (The web preview plays a native-driver loop only once.)
    const useNativeDriver = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.timing(roll, { toValue: 1, duration: ROLL_MS, easing: Easing.linear, useNativeDriver }));
    loop.start();
    return () => loop.stop();
  }, [roll]);

  return (
    <View pointerEvents="none" style={rect}>
      <View style={[styles.clip, { left: STRIP_LEFT * k, width: STRIP_WIDTH * k, height: rect.height }]}>
        <Animated.View
          style={{
            position: 'absolute',
            left: (-WAVE - STRIP_LEFT) * k,
            top: 0,
            width: (132 + 2 * WAVE) * k,
            height: rect.height,
            transform: [{ translateX: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -WAVE * k] }) }],
          }}
        >
          <Svg width={(132 + 2 * WAVE) * k} height={rect.height} viewBox={`${-WAVE} 0 ${132 + 2 * WAVE} 132`}>
            <Path d={waterPath(fill)} fill="#03A7FE" />
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
