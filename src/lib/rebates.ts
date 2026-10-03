import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { Lawn, Units } from './app-state';
import { formatDollars } from './format';
import { formatPricePerArea } from './units';

// Rebates for the lawn's area, from two sources:
// 1. Lawn-replacement ("cash for grass") programs from the big water agencies, checked on
//    each agency's own site in September 2026. Nothing national lists these.
// 2. EPA WaterSense's rebate list (api.epa.gov/watersense): utilities' rebates for smart
//    irrigation controllers, efficient sprinklers and irrigation checkups, matched by the
//    lawn's state and city/county. It has no dollar amounts.
// The lawn's county comes from the FCC's free Census block lookup, or the Census Bureau's
// geocoder if that's down, or (offline) the lawn's city.

/** Replacing lawn, better watering, catching rain or reusing graywater, and checkups. */
export type RebateKind = 'lawn' | 'irrigation' | 'reuse' | 'survey';

export type Rebate = {
  id: string;
  name: string;
  provider: string;
  kind: RebateKind;
  url: string;
  /** What you'd get, e.g. "Up to $1,300" for this lawn, "$2 per sq ft" or "$200". */
  amount: string | null;
  /** Rebate dollars for this lawn (for ranking); 0 when the program doesn't say. */
  dollars: number;
  note: string;
};

type Program = {
  id: string;
  name: string;
  provider: string;
  kind: RebateKind;
  url: string;
  state: string;
  /** County names without "County"; or cities, when an agency serves only part of a county. */
  counties?: string[];
  cities?: string[];
  /** $ per sq ft of lawn replaced: `rate` for the first `upTo` sq ft, then `thenRate`; at most `max`. */
  perSqFt?: { rate: number; upTo?: number; thenRate?: number; max?: number };
  /**
   * A set amount; `more` pays its `dollars` in the cities listed instead, and to some homes in
   * the `someIn` cities (those on a particular water company), shown as a range there.
   */
  pays?: { dollars: number; more?: { dollars: number; cities: string[]; someIn?: string[] } };
  note: string;
};

// Valley Water's programs, as on their site in October 2026 (landscape-rebates, and the
// laundry-to-landscape page): the landscape ones need approval before any work starts.
const VALLEY_WATER = 'https://www.valleywater.org/saving-water/rebates-surveys/landscape-rebates';
const VALLEY_WATER_PORTAL = 'https://valleywater.dropletportal.com';

const PROGRAMS: Program[] = [
  {
    id: 'valley-water-landscape',
    name: 'Landscape Conversion Rebate',
    provider: 'Valley Water',
    kind: 'lawn',
    url: VALLEY_WATER,
    state: 'CA',
    counties: ['Santa Clara'],
    perSqFt: { rate: 2, max: 3000 },
    note: '$2 per sq ft to replace lawn with low-water plants.',
  },
  {
    id: 'valley-water-irrigation',
    name: 'Irrigation Upgrade Rebate',
    provider: 'Valley Water',
    kind: 'irrigation',
    url: `${VALLEY_WATER_PORTAL}/irrigation-equipment-requirements`,
    state: 'CA',
    counties: ['Santa Clara'],
    note: 'For weather-based sprinkler controllers, rain sensors and more.',
  },
  {
    id: 'valley-water-drip',
    name: 'Drip Irrigation Rebate',
    provider: 'Valley Water',
    kind: 'irrigation',
    url: `${VALLEY_WATER_PORTAL}/in-line-drip-conversion-requirements`,
    state: 'CA',
    counties: ['Santa Clara'],
    note: 'For switching the sprinklers in your planting beds to drip tubing.',
  },
  {
    id: 'valley-water-graywater',
    name: 'Laundry to Landscape Rebate',
    provider: 'Valley Water',
    kind: 'reuse',
    url: 'https://www.valleywater.org/saving-water/rebates-surveys/laundry-to-landscape-rebate',
    state: 'CA',
    counties: ['Santa Clara'],
    // $400 for customers of these cities' own water utilities (in San Jose, only San Jose
    // Municipal Water's: most of the city is on San Jose Water).
    pays: { dollars: 200, more: { dollars: 400, cities: ['Milpitas', 'Morgan Hill', 'Palo Alto', 'Santa Clara'], someIn: ['San Jose'] } },
    note: "For a simple graywater system that waters your plants with your washing machine's rinse water.",
  },
  {
    id: 'valley-water-rainwater',
    name: 'Rainwater Capture Rebate',
    provider: 'Valley Water',
    kind: 'reuse',
    url: `${VALLEY_WATER_PORTAL}/cistern-and-rain-barrel-rebate-requirements`,
    state: 'CA',
    counties: ['Santa Clara'],
    note: 'For rain barrels, cisterns and rain gardens that catch the water off your roof.',
  },
  {
    id: 'valley-water-survey',
    name: 'Water Wise Outdoor Survey',
    provider: 'Valley Water',
    kind: 'survey',
    url: 'https://www.valleywater.org/saving-water/rebates-surveys/water-wise-irrigation-survey',
    state: 'CA',
    counties: ['Santa Clara'],
    note: 'An expert checks your sprinklers and sets up a watering schedule for your yard.',
  },
  {
    id: 'mwd-turf',
    name: 'Turf Replacement Rebate',
    provider: 'SoCal Water$mart (Metropolitan Water District)',
    kind: 'lawn',
    url: 'https://socalwatersmart.com/en/residential/rebates/available-rebates/turf-replacement-program/',
    state: 'CA',
    counties: ['Los Angeles', 'Orange', 'San Diego', 'Riverside', 'San Bernardino', 'Ventura'],
    perSqFt: { rate: 2, upTo: 5000, thenRate: 0 },
    note: '$2 per sq ft, and your local water agency may add more.',
  },
  {
    id: 'snwa-wsl',
    name: 'Water Smart Landscapes Rebate',
    provider: 'Southern Nevada Water Authority',
    kind: 'lawn',
    url: 'https://www.snwa.com/rebates/wsl/index.html',
    state: 'NV',
    counties: ['Clark'],
    perSqFt: { rate: 5, upTo: 10000, thenRate: 2.5 },
    note: '$5 per sq ft to replace grass with desert landscaping.',
  },
  {
    id: 'ebmud-lawn',
    name: 'Lawn Conversion Rebate',
    provider: 'East Bay MUD',
    kind: 'lawn',
    url: 'https://www.ebmud.com/water/conservation-and-rebates/rebates/lawn-conversion-rebate',
    state: 'CA',
    cities: [
      'Alameda', 'Albany', 'Berkeley', 'Emeryville', 'Oakland', 'Piedmont', 'San Leandro', 'Castro Valley',
      'San Lorenzo', 'El Cerrito', 'Kensington', 'Richmond', 'San Pablo', 'El Sobrante', 'Pinole', 'Hercules',
      'Lafayette', 'Moraga', 'Orinda', 'Walnut Creek', 'Danville', 'Alamo', 'San Ramon',
    ],
    perSqFt: { rate: 1, max: 2000 },
    note: 'For EBMUD customers: $1 per sq ft, or $2 per sq ft with the Super Rebate.',
  },
];

// ---------- what each program pays this lawn ----------

function lawnRebateDollars({ rate, upTo = Infinity, thenRate = rate, max = Infinity }: NonNullable<Program['perSqFt']>, squareFeet: number) {
  const dollars = rate * Math.min(squareFeet, upTo) + thenRate * Math.max(0, squareFeet - upTo);
  return Math.min(max, dollars);
}

function fromProgram(program: Omit<Program, 'state'>, squareFeet: number, city: string, units: Units): Rebate {
  let amount: string | null = null;
  let dollars = 0;
  if (program.perSqFt) {
    dollars = squareFeet > 0 ? lawnRebateDollars(program.perSqFt, squareFeet) : 0;
    amount = dollars > 0 ? `Up to ${formatDollars(dollars)}` : formatPricePerArea(program.perSqFt.rate, units);
  } else if (program.pays) {
    const { more } = program.pays;
    dollars = more?.cities.some((c) => same(c, city)) ? more.dollars : program.pays.dollars;
    amount = formatDollars(dollars);
    // Only some of the city's homes get the higher amount (it depends on their water company).
    if (more?.someIn?.some((c) => same(c, city))) amount = `${formatDollars(dollars)}–${formatDollars(more.dollars)}`;
  }
  const { id, name, provider, kind, url } = program;
  // Program notes quote "$2 per sq ft" rates: shown per m² on the metric setting.
  const note = program.note.replace(/\$(\d+(?:\.\d+)?) per sq ft/g, (_, rate: string) => formatPricePerArea(Number(rate), units));
  return { id, name, provider, kind, url, amount, dollars, note };
}

// ---------- where the lawn is ----------

type Place = { state: string; county: string; city: string };

/** GETs JSON, giving up after 8 s. Throws on a network failure or a non-OK response. */
async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

const countyName = (name: string) => name.replace(/ (County|Parish|Borough|Census Area)$/, '');

async function fccCounty({ latitude, longitude }: Lawn): Promise<string> {
  const data = await getJson<{ County?: { name?: string } }>(
    `https://geo.fcc.gov/api/census/block/find?latitude=${latitude}&longitude=${longitude}&censusYear=2020&format=json`,
  );
  if (!data.County?.name) throw new Error('FCC lookup found no county');
  return countyName(data.County.name);
}

async function censusCounty({ latitude, longitude }: Lawn): Promise<string> {
  const data = await getJson<{ result?: { geographies?: { Counties?: { NAME?: string }[] } } }>(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${longitude}&y=${latitude}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties&format=json`,
  );
  const name = data.result?.geographies?.Counties?.[0]?.NAME;
  if (!name) throw new Error('Census lookup found no county');
  return countyName(name);
}

/** Cities in the counties programs are listed by, for when the county can't be looked up. */
const COUNTY_OF_CITY: Record<string, string> = Object.fromEntries(
  [
    'Campbell', 'Cupertino', 'Gilroy', 'Los Altos', 'Los Altos Hills', 'Los Gatos', 'Milpitas', 'Monte Sereno',
    'Morgan Hill', 'Mountain View', 'Palo Alto', 'San Jose', 'Santa Clara', 'Saratoga', 'Sunnyvale',
  ].map((city) => [city.toLowerCase(), 'Santa Clara']),
);

/** Where the lawn is; `known` is false when the county had to be guessed from the city. */
async function countyOf(lawn: Lawn): Promise<Place & { known: boolean }> {
  const city = (lawn.city ?? '').trim();
  const state = (lawn.state ?? '').trim().toUpperCase();
  for (const lookup of [fccCounty, censusCounty]) {
    try {
      return { state, county: await lookup(lawn), city, known: true };
    } catch (error) {
      console.warn(`Rebates: ${lookup.name} failed`, error); // then try the next one
    }
  }
  return guessedPlace(lawn);
}

/** Where the lawn is going by its city alone (offline, or the lookups failed). */
function guessedPlace(lawn: Lawn): Place & { known: false } {
  const city = (lawn.city ?? '').trim();
  const state = (lawn.state ?? '').trim().toUpperCase();
  return { state, county: COUNTY_OF_CITY[city.toLowerCase()] ?? '', city, known: false };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function programsFor(place: Place): Program[] {
  return PROGRAMS.filter(
    (program) =>
      program.state === place.state &&
      ((program.counties?.some((county) => same(county, place.county)) ?? false) ||
        (program.cities?.some((city) => same(city, place.city)) ?? false)),
  );
}

// ---------- EPA WaterSense rebate list ----------

// api.data.gov key: DEMO_KEY works without signing up (a few requests an hour per phone,
// plenty with the week-long cache below); set EXPO_PUBLIC_DATA_GOV_API_KEY for a real one.
const EPA_API_KEY = process.env.EXPO_PUBLIC_DATA_GOV_API_KEY || 'DEMO_KEY';

const EPA_OUTDOOR_TYPES: Record<string, { kind: RebateKind; name: string }> = {
  'Weather-Based Irrigation Controllers': { kind: 'irrigation', name: 'Smart Sprinkler Controller Rebate' },
  'Soil Moisture-Based Irrigation Controllers': { kind: 'irrigation', name: 'Soil Moisture Sensor Rebate' },
  'Spray Sprinkler Bodies': { kind: 'irrigation', name: 'Efficient Sprinkler Rebate' },
  'Irrigation Professional Services': { kind: 'survey', name: 'Irrigation Checkup' },
};

type EpaRow = { id: number; partnerName: string; state: string; rebateType: string; buildingType: string; rebateWebsite: string };

async function epaRebates(place: Place): Promise<Omit<Program, 'state'>[]> {
  const keywords = [place.city, place.county].filter((k) => k.length > 1);
  const rows: EpaRow[] = [];
  let answered = false;
  for (const keyword of keywords) {
    const response = await fetch(
      `https://api.epa.gov/watersense/rebates/?offset=0&limit=50&state=${encodeURIComponent(place.state)}&keyword=${encodeURIComponent(keyword)}`,
      { headers: { 'X-Api-Key': EPA_API_KEY } },
    );
    if (!response.ok) continue; // e.g. rate limited
    answered = true;
    rows.push(...((await response.json()) as { rows: EpaRow[] }).rows);
  }
  if (!answered) throw new Error('EPA rebate list unavailable');
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const type = EPA_OUTDOOR_TYPES[row.rebateType];
    const url = row.rebateWebsite.match(/href="([^"]+)"/)?.[1];
    const key = `${row.partnerName}|${row.rebateType}`;
    if (!type || !url || !row.buildingType.includes('Residential') || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        id: `epa-${row.id}`,
        name: type.name,
        provider: row.partnerName,
        kind: type.kind,
        url,
        note: `Listed by EPA WaterSense for ${row.partnerName} customers. Check the site for amounts.`,
      },
    ];
  });
}

// ---------- putting it together (lookups cached for a week per place) ----------

const CACHE_MS = 7 * 24 * 60 * 60_000;
/** Shorter when EPA's list couldn't be loaded, so it's tried again soon. */
const PARTIAL_CACHE_MS = 24 * 60 * 60_000;
// Only what was looked up is kept (where the lawn is, and EPA's list): the programs above come
// from here each time, so changes to them show up right away.
const STORAGE_PREFIX = 'lawnalyze/rebates/v3/';

type Found = { place: Place; programs: Omit<Program, 'state'>[] };
type Looked = { place: Place; epa: Omit<Program, 'state'>[] | null };

async function lookUp(lawn: Lawn): Promise<Looked> {
  const key = `${STORAGE_PREFIX}${lawn.latitude.toFixed(3)},${lawn.longitude.toFixed(3)}`;
  const saved = await AsyncStorage.getItem(key).catch(() => null);
  try {
    const cached = saved ? (JSON.parse(saved) as { at?: number; ttl?: number; looked?: Partial<Looked> }) : null;
    // Only a complete entry counts (one saved by an older version may be shaped differently).
    const { at = 0, ttl = 0, looked } = cached ?? {};
    if (looked?.place && Date.now() - at < ttl) return { place: looked.place, epa: looked.epa ?? null };
  } catch {
    // A damaged entry: look it up again.
  }
  const { known, ...place } = await countyOf(lawn);
  const looked = { place, epa: await epaRebates(place).catch(() => null) };
  // A guessed county isn't kept, so it's looked up properly next time.
  if (known) {
    const ttl = looked.epa ? CACHE_MS : PARTIAL_CACHE_MS;
    AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), ttl, looked })).catch(() => {});
  }
  return looked;
}

async function findPrograms(lawn: Lawn): Promise<Found> {
  // Whatever goes wrong looking things up, the programs for the lawn's city still show.
  const { place, epa } = await lookUp(lawn).catch((error) => {
    console.warn('Rebates: lookup failed', error);
    const { known, ...place } = guessedPlace(lawn);
    return { place, epa: null };
  });
  // Leave out EPA entries from agencies already covered above (EPA may use a longer name, like
  // "Santa Clara Valley Water District" for Valley Water).
  const verified = programsFor(place);
  const providers = verified.map((p) => p.provider.toLowerCase());
  const covered = (name: string) => providers.some((p) => name.toLowerCase().includes(p) || p.includes(name.toLowerCase()));
  const extra = (epa ?? []).filter((p) => typeof p.provider === 'string' && !covered(p.provider));
  return { place, programs: [...verified, ...extra] };
}

const KIND_ORDER: Record<RebateKind, number> = { lawn: 0, irrigation: 1, reuse: 2, survey: 3 };

export type RebatesResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; place: Place; rebates: Rebate[] };

/** After a failed search, it's tried again this often (ms) until it works. */
const RETRY_MS = 5_000;

/** Rebates near the lawn, best first (lawn replacement pays and saves the most). */
export function useRebates(lawn: Lawn | null, squareFeet: number, units: Units): RebatesResult {
  const [found, setFound] = useState<{ key: string; value: Found | 'error' } | null>(null);
  // Bumped to try again after a failure (the screen stays open, so it would never retry otherwise).
  const [attempt, setAttempt] = useState(0);
  const key = lawn ? `${lawn.latitude},${lawn.longitude},${lawn.city}` : null;

  useEffect(() => {
    if (!lawn || !key) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    findPrograms(lawn)
      .then((value) => active && setFound({ key, value }))
      .catch((error) => {
        console.warn('Rebates: could not be found', error);
        if (!active) return;
        setFound({ key, value: 'error' });
        retry = setTimeout(() => setAttempt((n) => n + 1), RETRY_MS);
      });
    return () => {
      active = false;
      clearTimeout(retry);
    };
    // `key` covers the parts of the lawn that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  if (!found || found.key !== key) return { status: 'loading' };
  if (found.value === 'error') return { status: 'error' };
  const { place, programs } = found.value;
  const rebates = programs
    .map((program) => fromProgram(program, squareFeet, place.city, units))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.dollars - a.dollars);
  return { status: 'ready', place, rebates };
}

/** EPA's rebate search, for areas without a listed program. */
export const REBATE_FINDER_URL = 'https://lookforwatersense.epa.gov/rebates/';

/** Fills an empty spot: EPA's search covers utilities this app doesn't list. */
export const MORE_REBATES: Rebate = {
  id: 'epa-rebate-finder',
  name: 'More rebates near you',
  provider: 'EPA WaterSense rebate finder',
  kind: 'survey',
  url: REBATE_FINDER_URL,
  amount: null,
  dollars: 0,
  note: 'Search your state for sprinkler, smart controller and irrigation checkup rebates.',
};
