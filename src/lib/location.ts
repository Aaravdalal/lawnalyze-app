import * as Location from 'expo-location';

export type LatLng = { latitude: number; longitude: number };

/** The device's position, or null if permission is denied or no fix is available. */
export async function getDeviceLocation(): Promise<LatLng | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
  } catch {
    return null;
  }

  // A cached fix is instant, but only trust one from the last minute that's accurate to a
  // street: an older one can be somewhere you've since left (e.g. still at home).
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch {
    // Not supported everywhere (e.g. some browsers).
  }
  try {
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: current.coords.latitude, longitude: current.coords.longitude };
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
