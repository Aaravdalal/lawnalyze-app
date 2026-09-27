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

  // A recent cached fix is instant; fall back to asking for a fresh one.
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 });
    if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
  } catch {
    // Not supported everywhere (e.g. some browsers).
  }
  try {
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: current.coords.latitude, longitude: current.coords.longitude };
  } catch {
    return null;
  }
}
