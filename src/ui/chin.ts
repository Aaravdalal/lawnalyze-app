import { DESIGN_WIDTH } from './Artboard';

/**
 * The white card's rounded bottom-left corner, traced from assets/ui/common/card-bottom.png
 * (design pts from that image's top-left; the image is 340 x 87 and the right corner mirrors
 * this one).
 */
const CORNER: readonly (readonly [number, number])[] = [
  [0, 47.17],
  [0.2, 47.5],
  [0.37, 49.5],
  [0.71, 51.5],
  [1.46, 54.83],
  [2.39, 57.83],
  [3.41, 60.5],
  [4.83, 63.5],
  [6.74, 66.83],
  [9.36, 70.5],
  [11.67, 73.17],
  [14.36, 75.83],
  [17.21, 78.17],
  [20.58, 80.5],
  [24.92, 82.83],
  [28.94, 84.5],
  [32.1, 85.5],
  [34.94, 86.17],
  [39.49, 86.83],
  [39.49, 87],
];

/** Height of the card-bottom export: its corners sit in the last 40 pts. */
export const CARD_BOTTOM_H = 87;

const f = (n: number) => n.toFixed(2);

/**
 * SVG path of the green chin: everything below the card's rounded bottom edge, down to
 * `bottom`. Matches the Figma layers exactly (the card-bottom image is stretched across the
 * screen's width, so the corners stretch with it).
 */
export function chinPath(width: number, cardTop: number, scale: number, bottom: number): string {
  const sx = width / DESIGN_WIDTH;
  const y = (designY: number) => f(cardTop + designY * scale);
  const left = CORNER.map(([x, cy]) => `${f(x * sx)},${y(cy)}`);
  const right = [...CORNER].reverse().map(([x, cy]) => `${f(width - x * sx)},${y(cy)}`);
  return `M${left.join('L')}L${right.join('L')}L${f(width)},${f(bottom)}L0,${f(bottom)}Z`;
}
