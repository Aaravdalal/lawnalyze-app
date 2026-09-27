import { useId } from 'react';
import Svg, { ClipPath, Defs, Path } from 'react-native-svg';

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

/** Water surface with the gentle wave from the design (high on the left, dipping right). */
function waterPath(level: number): string {
  const y = BOTTOM_Y - level * (BOTTOM_Y - TIP_Y);
  // Flatten the wave near empty/full so it never pokes out of the drop's narrow ends.
  const a = 5 * Math.min(1, level / 0.15, (1 - level) / 0.15);
  return (
    `M20 ${y - a}` +
    `C42 ${y - 1.3 * a} 58 ${y + 1.2 * a} 80 ${y + a}` +
    `S102 ${y + 0.6 * a} 115 ${y + 0.6 * a}` +
    `L115 ${BOTTOM_Y + 5}L20 ${BOTTOM_Y + 5}Z`
  );
}

type Props = { x: number; y: number; size: number; level: number };

/** The Usage screen's water drop; `level` (0–1) is how full it is. */
export function WaterDrop({ x, y, size, level }: Props) {
  const rect = useRect({ x, y }, size, size);
  const clipId = `drop-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const fill = Math.min(1, Math.max(0, level));

  return (
    <Svg style={rect} viewBox="0 0 132 132" pointerEvents="none">
      <Defs>
        <ClipPath id={clipId}>
          <Path d={DROP} />
        </ClipPath>
      </Defs>
      <Path d={waterPath(fill)} fill="#03A7FE" clipPath={`url(#${clipId})`} />
      <Path d={DROP} fill="none" stroke="#2D2C2C" strokeWidth={2.33} strokeLinejoin="round" />
    </Svg>
  );
}
