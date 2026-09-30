import * as Location from 'expo-location';

import { reverseGeocode } from './geocode';

export type LatLng = { latitude: number; longitude: number };

/**
 * A position the phone already has is used straight away if it's this recent (ms) and accurate
 * to this (m). Otherwise a quick new fix comes from Wi-Fi and cell towers (Balanced accuracy),
 * which takes about a second, rather than waiting several on GPS.
 */
const LAST_KNOWN = { maxAge: 30 * 60_000, requiredAccuracy: 100 };
/** Once found, the phone's position is reused for this long (ms), e.g. from the intro screen. */
const REUSE_MS = 5 * 60_000;

let found: { spot: LatLng; at: number } | null = null;
// The lookup under way, if any: everyone who asks meanwhile gets the same one.
let finding: Promise<LatLng | null> | null = null;

/**
 * Where the phone is, as fast as it can be had, asking for permission (and on Android, to turn
 * location on) if needed: null if it can't be had (location off, or not allowed).
 */
export function findDevice(): Promise<LatLng | null> {
  if (found && Date.now() - found.at < REUSE_MS) return Promise.resolve(found.spot);
  if (!finding) {
    const spot = locate();
    finding = spot;
    spot.then((result) => {
      finding = null;
      if (result) found = { spot: result, at: Date.now() };
    });
  }
  return finding;
}

/**
 * Finds the phone and looks up the street address there ahead of time (asking for permission
 * first if needed), so the Locate screen has both the moment it opens.
 */
export function warmUpLocation() {
  findDevice()
    .then((spot) => spot && reverseGeocode(spot))
    .catch(() => {});
}

async function locate(): Promise<LatLng | null> {
  try {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const { coords } =
      // (Not supported everywhere, e.g. some browsers.)
      (await Location.getLastKnownPositionAsync(LAST_KNOWN).catch(() => null)) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: coords.latitude, longitude: coords.longitude };
  } catch {
    return null;
  }
}

/** Distance between two points on the ground (meters). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
