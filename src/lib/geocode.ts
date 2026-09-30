import { Platform } from 'react-native';

import type { LatLng } from './location';

// OpenStreetMap's public geocoder. Its usage policy allows light, user-initiated lookups
// (max 1 request/second) from an identifiable app: https://operations.osmfoundation.org/policies/nominatim/
const NOMINATIM = 'https://nominatim.openstreetmap.org';

export type AddressQuery = { address: string; city: string; state: string };

/** The form's text without stray spaces at either end. */
export const trimmedQuery = (form: AddressQuery): AddressQuery => ({
  address: form.address.trim(),
  city: form.city.trim(),
  state: form.state.trim(),
});

/** The same address, ignoring capitals. */
export const sameQuery = (a: AddressQuery, b: AddressQuery) =>
  a.address.toLowerCase() === b.address.toLowerCase() &&
  a.city.toLowerCase() === b.city.toLowerCase() &&
  a.state.toLowerCase() === b.state.toLowerCase();

function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/** GETs a Nominatim endpoint as JSON; null on a non-OK response. Throws on network failure. */
async function nominatim<T>(path: 'search' | 'reverse', params: Record<string, string>): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': 'en' };
    // Browsers send their own User-Agent/Referer; native apps must identify themselves.
    if (Platform.OS !== 'web') headers['User-Agent'] = 'Lawnalyze/1.0 (lawn water estimator app)';

    const response = await fetch(`${NOMINATIM}/${path}?${toQueryString({ format: 'jsonv2', ...params })}`, {
      headers,
      signal: controller.signal,
    });
    return response.ok ? ((await response.json()) as T) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function search(params: Record<string, string>): Promise<LatLng | null> {
  const results = await nominatim<{ lat: string; lon: string }[]>('search', { limit: '1', ...params });
  if (!results || results.length === 0) return null;
  return { latitude: Number(results[0].lat), longitude: Number(results[0].lon) };
}

/** Looks up the coordinates of a street address. Throws on network failure. */
export async function geocodeAddress({ address, city, state }: AddressQuery): Promise<LatLng | null> {
  // The form is US-shaped (city + state), so try a structured US lookup first,
  // then a free-form search in case the parts don't split cleanly.
  const structured = await search({ street: address, city, state, countrycodes: 'us' });
  if (structured) return structured;
  return search({ q: [address, city, state].filter(Boolean).join(', ') });
}

type ReverseResult = {
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    state?: string;
    'ISO3166-2-lvl4'?: string;
  };
};

/** The street address at a position, split into the form's fields. Throws on network failure. */
export async function reverseGeocode({ latitude, longitude }: LatLng): Promise<AddressQuery | null> {
  const result = await nominatim<ReverseResult>('reverse', {
    lat: String(latitude),
    lon: String(longitude),
    addressdetails: '1',
    zoom: '18', // building level
  });
  const parts = result?.address;
  if (!parts) return null;

  // "US-CA" -> "CA"; the State box is sized for the two-letter code.
  const stateCode = parts['ISO3166-2-lvl4']?.split('-')[1];
  return {
    address: [parts.house_number, parts.road].filter(Boolean).join(' '),
    city: parts.city ?? parts.town ?? parts.village ?? parts.hamlet ?? parts.suburb ?? '',
    state: stateCode ?? parts.state ?? '',
  };
}
