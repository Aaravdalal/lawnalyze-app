import type { Outline, Units } from './app-state';
import { outlineSquareFeet, sideLengthsFeet } from './area';
import type { LatLng } from './location';
import { formatArea, formatLength } from './units';

/** A tag pinned to the map: a side's length (with the side's two ends), or a lawn's area. */
export type MapLabel = LatLng & { text: string } & ({ kind: 'side'; ends: [LatLng, LatLng] } | { kind: 'area' });

/** "Show dimensions": a tag in the middle of every side ("32 ft") and each lawn's area in its middle. */
export function dimensionLabels(outlines: Outline[], units: Units): MapLabel[] {
  return outlines.flatMap((outline) => {
    const sides = sideLengthsFeet(outline).map((feet, i): MapLabel => {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      return {
        latitude: (a.latitude + b.latitude) / 2,
        longitude: (a.longitude + b.longitude) / 2,
        text: formatLength(feet, units),
        kind: 'side',
        ends: [a, b],
      };
    });
    const middle = {
      latitude: outline.reduce((sum, p) => sum + p.latitude, 0) / outline.length,
      longitude: outline.reduce((sum, p) => sum + p.longitude, 0) / outline.length,
    };
    const area: MapLabel = { ...middle, text: formatArea(outlineSquareFeet(outline), units), kind: 'area' };
    return [...sides, area];
  });
}
