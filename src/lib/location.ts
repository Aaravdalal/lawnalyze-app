import * as Location from 'expo-location';

export type LatLng = { latitude: number; longitude: number };

/**
 * A position the phone already has is used straight away if it's this recent (ms) and accurate
 * to this (m): usually the phone is still there, and a new fix takes a second or more (several
 * indoors, waiting on GPS). Older than `confirm`, a new fix is found as well, in case the phone
 * has moved since.
 */
const RECENT = { maxAge: 10 * 60_000, confirm: 60_000, accuracy: 50 };
/** The new fix only counts as somewhere else if it's farther than this (m) from the recent one. */
const MOVED_M = 40;

type Fix = { spot: LatLng; accuracy: number; time: number };

const toFix = ({ coords, timestamp }: Location.LocationObject): Fix => ({
  spot: { latitude: coords.latitude, longitude: coords.longitude },
  accuracy: coords.accuracy ?? Infinity,
  time: timestamp,
});

/**
 * Finds the phone, asking for permission if needed. `onSpot` gets a recent position the phone
 * already has straight away, then a new fix once it's in, if that's somewhere else (or there
 * wasn't a recent one). It gets null if there's no position at all (location off, or not
 * allowed). Returns a function that stops any more calls.
 */
export function findDevice(onSpot: (spot: LatLng | null) => void): () => void {
  let active = true;
  const report = (spot: LatLng | null) => {
    if (active) onSpot(spot);
  };
  (async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return report(null);
    } catch {
      return report(null);
    }

    const recent = await lastKnownFix();
    if (recent) report(recent.spot);
    if (!active || (recent && Date.now() - recent.time < RECENT.confirm)) return;

    const now = await newFix();
    if (!now) {
      if (!recent) report(null);
      return;
    }
    // Still in the same place, as near as the new fix can tell.
    if (recent && distanceMeters(now.spot, recent.spot) <= Math.max(MOVED_M, now.accuracy)) return;
    report(now.spot);
  })();
  return () => {
    active = false;
  };
}

/**
 * Starts finding the phone ahead of time if the app is already allowed to (it never asks here),
 * so the Locate screen has a position the moment it opens.
 */
export function warmUpLocation() {
  Location.getForegroundPermissionsAsync()
    .then(({ granted }) => {
      // No "turn on location" prompt from here, before anything has been asked.
      if (granted) return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High, mayShowUserSettingsDialog: false });
    })
    .catch(() => {});
}

async function lastKnownFix(): Promise<Fix | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: RECENT.maxAge, requiredAccuracy: RECENT.accuracy });
    return last && toFix(last);
  } catch {
    // Not supported everywhere (e.g. some browsers).
    return null;
  }
}

async function newFix(): Promise<Fix | null> {
  try {
    return toFix(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
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
