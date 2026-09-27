// Gooey ("metaball") pill shapes for the tab bar: pills that come close grow a smooth,
// waisted bridge between their rounded ends, so they melt together and pull apart like
// liquid. Returns SVG path data; everything is in pixels.

export type Pill = { left: number; right: number };

type Point = { x: number; y: number };

const at = (c: Point, r: number, angle: number): Point => ({ x: c.x + r * Math.cos(angle), y: c.y + r * Math.sin(angle) });
const f = (n: number) => n.toFixed(2);

/** A pill (stadium) of the given height; narrower than its height it shrinks to a dot. */
function pillPath({ left, right }: Pill, height: number): string {
  const width = right - left;
  if (width <= 0.5) return '';
  const r = Math.min(height, width) / 2;
  const cy = height / 2;
  const top = cy - r;
  const bottom = cy + r;
  return (
    `M${f(left + r)},${f(top)}H${f(right - r)}` +
    `A${f(r)},${f(r)} 0 0 1 ${f(right - r)},${f(bottom)}` +
    `H${f(left + r)}A${f(r)},${f(r)} 0 0 1 ${f(left + r)},${f(top)}Z`
  );
}

/**
 * Liquid bridge between the right end of pill `a` and the left end of pill `b`: a waist
 * that is thick when the ends touch and thins to nothing as they pull `reach` apart.
 */
function bridgePath(a: Pill, b: Pill, height: number, reach: number): string {
  const r = height / 2;
  if (a.right - a.left < r || b.right - b.left < r) return ''; // too small to bridge nicely
  const gap = b.left - a.right;
  if (gap >= reach) return '';

  const t = Math.min(1, Math.max(0, gap / reach)); // 0 touching .. 1 snapped
  // Half-thickness at the middle: stays fat most of the way, then pinches off quickly,
  // so it reads as a blob of liquid rather than a string.
  const waist = r * 0.8 * Math.pow(1 - t, 0.6);
  if (waist < 0.4) return '';
  const spread = 1.15 - 0.55 * t; // attachment angle from the tip; slides toward the tips as it stretches

  const c1 = { x: a.right - r, y: r };
  const c2 = { x: b.left + r, y: r };
  const p1 = at(c1, r, -spread); // upper attachment on a's end (y grows downward)
  const p2 = at(c2, r, Math.PI + spread); // upper attachment on b's end
  const mid = { x: (p1.x + p2.x) / 2, y: r - waist };
  const reachTo = (p: Point) => Math.max(1, Math.abs(mid.x - p.x));

  // Upper edge: leave each end along the circle's tangent, meet flat at the waist.
  const t1 = { x: Math.sin(spread), y: Math.cos(spread) };
  const l1 = reachTo(p1) * 0.55;
  const l2 = reachTo(p1) * 0.45;
  const upper =
    `M${f(p1.x)},${f(p1.y)}` +
    `C${f(p1.x + t1.x * l1)},${f(p1.y + t1.y * l1)} ${f(mid.x - l2)},${f(mid.y)} ${f(mid.x)},${f(mid.y)}` +
    `C${f(mid.x + l2)},${f(mid.y)} ${f(p2.x - t1.x * l1)},${f(p2.y + t1.y * l1)} ${f(p2.x)},${f(p2.y)}`;
  // Lower edge mirrors the upper one about the centre line.
  const m = (y: number) => f(2 * r - y);
  const lower =
    `L${f(p2.x)},${m(p2.y)}` +
    `C${f(p2.x - t1.x * l1)},${m(p2.y + t1.y * l1)} ${f(mid.x + l2)},${m(mid.y)} ${f(mid.x)},${m(mid.y)}` +
    `C${f(mid.x - l2)},${m(mid.y)} ${f(p1.x + t1.x * l1)},${m(p1.y + t1.y * l1)} ${f(p1.x)},${m(p1.y)}Z`;
  return upper + lower;
}

/** All pills plus the bridges between neighbours (pills given left to right). */
export function gooeyPath(pills: Pill[], height: number, reach: number): string {
  const sorted = [...pills].sort((p, q) => p.left - q.left);
  const parts = sorted.map((pill) => pillPath(pill, height));
  for (let i = 0; i < sorted.length - 1; i++) parts.push(bridgePath(sorted[i], sorted[i + 1], height, reach));
  return parts.join('');
}
