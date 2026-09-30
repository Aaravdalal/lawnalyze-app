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
// The lookup under way, if any, and whether it may ask for permission.
let finding: { spot: Promise<LatLng | null>; asks: boolean } | null = null;

/**
 * Where the phone is, as fast as it can be had: null if it can't be (location off, or not
 * allowed). `ask`: ask for permission (and on Android, to turn location on) if needed;
 * otherwise only look if the app is already allowed to.
 */
export function findDevice(ask = true): Promise<LatLng | null> {
  if (found && Date.now() - found.at < REUSE_MS) return Promise.resolve(found.spot);
  if (finding && (finding.asks || !ask)) return finding.spot;
  // A lookup that couldn't ask may still come back with nothing: then look again, asking.
  const before = finding?.spot ?? Promise.resolve(null);
  const spot = before.then((earlier) => earlier ?? locate(ask));
  finding = { spot, asks: ask };
  spot.then((result) => {
    if (finding?.spot === spot) finding = null;
    if (result) found = { spot: result, at: Date.now() };
  });
  return spot;
}

/**
 * Finds the phone, and the street address there, ahead of time if the app is already allowed to
 * (it never asks from here), so the Locate screen has both the moment it opens.
 */
export function warmUpLocation() {
  findDevice(false)
    .then((spot) => spot && reverseGeocode(spot))
    .catch(() => {});
}

async function locate(ask: boolean): Promise<LatLng | null> {
  try {
    const { granted } = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
    if (!granted) return null;
    const { coords } =
      // (Not supported everywhere, e.g. some browsers.)
      (await Location.getLastKnownPositionAsync(LAST_KNOWN).catch(() => null)) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: ask }));
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
