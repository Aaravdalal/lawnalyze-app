import type { Outline } from './app-state';

const EARTH_RADIUS_M = 6378137;
const SQ_FT_PER_SQ_M = 10.7639104;

/** Area of a lawn outline in square feet (spherical polygon area; exact enough for yards). */
export function outlineSquareFeet(outline: Outline): number {
  if (outline.length < 3) return 0;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    sum += (b.longitude - a.longitude) * rad * (2 + Math.sin(a.latitude * rad) + Math.sin(b.latitude * rad));
  }
  return (Math.abs(sum) * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2 * SQ_FT_PER_SQ_M;
}

export function totalSquareFeet(outlines: Outline[]): number {
  return outlines.reduce((total, outline) => total + outlineSquareFeet(outline), 0);
}

export const formatSquareFeet = (squareFeet: number) => Math.round(squareFeet).toLocaleString('en-US');
