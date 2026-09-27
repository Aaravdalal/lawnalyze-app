import type { Outline } from './app-state';

// Lawn measurements from the corner points marked on the map (latitude/longitude, WGS84 — the
// same system GPS and the satellite map use).
//
// Method: flatten the corners onto a local flat plane in metres east/north of the lawn, using
// the Earth's actual (WGS84 ellipsoid) curvature at the lawn's latitude, then use the shoelace
// formula for the area and straight-line distances for the sides. Over a yard-sized area the
// flattening error is far below a millionth, so the result matches a survey-grade geodesic
// calculation (checked against GeographicLib).

const WGS84_A = 6378137; // equatorial radius, m
const WGS84_E2 = 0.00669437999014; // eccentricity squared
const FEET_PER_METRE = 3.28083989501; // 1 ft = 0.3048 m exactly
const SQ_FT_PER_SQ_M = FEET_PER_METRE * FEET_PER_METRE;
const RAD = Math.PI / 180;

type Point = { x: number; y: number };

/** Corners in metres east (x) and north (y) of the outline's middle. */
function toLocalMetres(outline: Outline): Point[] {
  const lat0 = outline.reduce((sum, p) => sum + p.latitude, 0) / outline.length;
  const lng0 = outline.reduce((sum, p) => sum + p.longitude, 0) / outline.length;
  const sin = Math.sin(lat0 * RAD);
  const w = 1 - WGS84_E2 * sin * sin;
  const metresPerRadNorth = (WGS84_A * (1 - WGS84_E2)) / Math.pow(w, 1.5); // meridian radius
  const metresPerRadEast = (WGS84_A / Math.sqrt(w)) * Math.cos(lat0 * RAD); // parallel radius
  return outline.map((p) => ({
    x: (p.longitude - lng0) * RAD * metresPerRadEast,
    y: (p.latitude - lat0) * RAD * metresPerRadNorth,
  }));
}

/** Area of a lawn outline in square feet. */
export function outlineSquareFeet(outline: Outline): number {
  if (outline.length < 3) return 0;
  const points = toLocalMetres(outline);
  let twiceArea = 0; // shoelace formula
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return (Math.abs(twiceArea) / 2) * SQ_FT_PER_SQ_M;
}

/** Length of each side in feet: side i runs from corner i to the next corner (wrapping around). */
export function sideLengthsFeet(outline: Outline): number[] {
  if (outline.length < 2) return [];
  const points = toLocalMetres(outline);
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return Math.hypot(b.x - a.x, b.y - a.y) * FEET_PER_METRE;
  });
}

export function totalSquareFeet(outlines: Outline[]): number {
  return outlines.reduce((total, outline) => total + outlineSquareFeet(outline), 0);
}
