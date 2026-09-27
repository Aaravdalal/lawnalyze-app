import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { Lawn, Units } from './app-state';
import type { Estimate } from './estimate';
import { formatDollars } from './format';
import { formatPricePerArea, formatWater } from './units';

// Rebates for the lawn's area, from two sources:
// 1. Lawn-replacement ("cash for grass") programs from the big water agencies, checked on
//    each agency's own site in September 2026. Nothing national lists these.
// 2. EPA WaterSense's rebate list (api.epa.gov/watersense): utilities' rebates for smart
//    irrigation controllers, efficient sprinklers and irrigation checkups, matched by the
//    lawn's state and city/county. It has no dollar amounts.
// The lawn's county comes from the FCC's free Census block lookup.

export type RebateKind = 'lawn' | 'irrigation' | 'survey';

export type Rebate = {
  id: string;
  name: string;
  provider: string;
  kind: RebateKind;
  url: string;
  /** What you'd get, e.g. "Up to $1,300" for this lawn, "$2 per sq ft" or "Free". */
  amount: string | null;
  /** Rebate dollars for this lawn (for ranking); 0 when the program doesn't say. */
  dollars: number;
  /** Water and money saved each year, e.g. "Saves about 24,300 gallons ($188) a year". */
  savings: string | null;
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
  amount?: string;
  note: string;
};

const VALLEY_WATER = 'https://www.valleywater.org/saving-water/rebates-surveys/landscape-rebates';

const PROGRAMS: Program[] = [
  {
    id: 'valley-water-landscape',
    name: 'Landscape Rebate',
    provider: 'Valley Water',
    kind: 'lawn',
    url: VALLEY_WATER,
    state: 'CA',
    counties: ['Santa Clara'],
    perSqFt: { rate: 2, max: 3000 },
    note: '$2 per sq ft to replace lawn with low-water plants. Get approved before removing any grass.',
  },
  {
    id: 'valley-water-irrigation',
    name: 'Irrigation Upgrade Rebate',
    provider: 'Valley Water',
    kind: 'irrigation',
    url: VALLEY_WATER,
    state: 'CA',
    counties: ['Santa Clara'],
    note: 'For weather-based sprinkler controllers, rain sensors and more. Get approved first.',
  },
  {
    id: 'valley-water-survey',
    name: 'Water Wise Outdoor Survey',
    provider: 'Valley Water',
    kind: 'survey',
    url: VALLEY_WATER,
    state: 'CA',
    counties: ['Santa Clara'],
    amount: 'Free',
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
    note: '$2 per sq ft, and your local water agency may add more. Reserve funds before you start.',
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
    note: '$5 per sq ft to replace grass with desert landscaping. A site visit is required first.',
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
    note: 'For EBMUD customers: $1 per sq ft, or $2 per sq ft with the Super Rebate. Get approval first.',
  },
];

// ---------- the lawn's water savings ----------

/** Low-water plants use ~0.2 × ET₀ (MWELO's "low water use" plant factor is 0.1–0.3). */
const LOW_WATER_PLANT_FACTOR = 0.2;
/** EPA: a WaterSense controller "can reduce an average home's irrigation water use by up to 30 percent". */
const SMART_CONTROLLER_SAVINGS = 0.3;

function lawnRebateDollars({ rate, upTo = Infinity, thenRate = rate, max = Infinity }: NonNullable<Program['perSqFt']>, squareFeet: number) {
  const dollars = rate * Math.min(squareFeet, upTo) + thenRate * Math.max(0, squareFeet - upTo);
  return Math.min(max, dollars);
}

function savingsText(estimate: Estimate | null, share: number, units: Units, upTo: boolean) {
  if (!estimate) return null;
  const water = formatWater(Math.round((estimate.yearlyGallons * share) / 100) * 100, units);
  return `${upTo ? 'Could save up to' : 'Saves about'} ${water} (${formatDollars(estimate.yearlyCost * share)}) a year`;
}

function fromProgram(program: Omit<Program, 'state'>, squareFeet: number, estimate: Estimate | null, units: Units): Rebate {
  let amount = program.amount ?? null;
  let dollars = 0;
  let savings: string | null = null;
  if (program.perSqFt) {
    dollars = squareFeet > 0 ? lawnRebateDollars(program.perSqFt, squareFeet) : 0;
    amount = dollars > 0 ? `Up to ${formatDollars(dollars)}` : formatPricePerArea(program.perSqFt.rate, units);
  }
  if (program.kind === 'lawn' && estimate) {
    savings = savingsText(estimate, 1 - LOW_WATER_PLANT_FACTOR / estimate.kc, units, false);
  } else if (program.kind === 'irrigation') {
    savings = savingsText(estimate, SMART_CONTROLLER_SAVINGS, units, true);
  }
  const { id, name, provider, kind, url } = program;
  // Program notes quote "$2 per sq ft" rates: shown per m² on the metric setting.
  const note = program.note.replace(/\$(\d+(?:\.\d+)?) per sq ft/g, (_, rate: string) => formatPricePerArea(Number(rate), units));
  return { id, name, provider, kind, url, amount, dollars, savings, note };
}

// ---------- where the lawn is ----------

type Place = { state: string; county: string; city: string };

async function countyOf(lawn: Lawn): Promise<Place> {
  const response = await fetch(
    `https://geo.fcc.gov/api/census/block/find?latitude=${lawn.latitude}&longitude=${lawn.longitude}&censusYear=2020&format=json`,
  );
  if (!response.ok) throw new Error(`County lookup failed (${response.status})`);
  const data = (await response.json()) as { County?: { name?: string }; State?: { code?: string } };
  return {
    state: data.State?.code ?? lawn.state.trim().toUpperCase(),
    county: (data.County?.name ?? '').replace(/ (County|Parish|Borough|Census Area)$/, ''),
    city: lawn.city.trim(),
  };
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

// ---------- putting it together (cached for a week per place) ----------

const CACHE_MS = 7 * 24 * 60 * 60_000;
/** Shorter when EPA's list couldn't be loaded, so it's tried again soon. */
const PARTIAL_CACHE_MS = 24 * 60 * 60_000;
const STORAGE_PREFIX = 'lawnalyze/rebates/v1/';

type Found = { place: Place; programs: Omit<Program, 'state'>[] };

async function findPrograms(lawn: Lawn): Promise<Found> {
  const key = `${STORAGE_PREFIX}${lawn.latitude.toFixed(3)},${lawn.longitude.toFixed(3)}`;
  const saved = await AsyncStorage.getItem(key).catch(() => null);
  if (saved) {
    const cached = JSON.parse(saved) as { at: number; ttl: number; found: Found };
    if (Date.now() - cached.at < cached.ttl) return cached.found;
  }
  const place = await countyOf(lawn);
  const epa = await epaRebates(place).catch(() => null);
  // Leave out EPA entries from agencies already covered above.
  const verified = programsFor(place);
  const providers = new Set(verified.map((p) => p.provider.toLowerCase()));
  const extra = (epa ?? []).filter((p) => !providers.has(p.provider.toLowerCase()));
  const found = { place, programs: [...verified, ...extra] };
  const ttl = epa ? CACHE_MS : PARTIAL_CACHE_MS;
  AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), ttl, found })).catch(() => {});
  return found;
}

const KIND_ORDER: Record<RebateKind, number> = { lawn: 0, irrigation: 1, survey: 2 };

export type RebatesResult =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; place: Place; rebates: Rebate[] };

/** Rebates near the lawn, best first (lawn replacement pays and saves the most). */
export function useRebates(lawn: Lawn | null, squareFeet: number, estimate: Estimate | null, units: Units): RebatesResult {
  const [found, setFound] = useState<{ key: string; value: Found | 'error' } | null>(null);
  const key = lawn ? `${lawn.latitude},${lawn.longitude},${lawn.city}` : null;

  useEffect(() => {
    if (!lawn || !key) return;
    let active = true;
    findPrograms(lawn)
      .then((value) => active && setFound({ key, value }))
      .catch(() => active && setFound({ key, value: 'error' }));
    return () => {
      active = false;
    };
    // `key` covers the parts of the lawn that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!found || found.key !== key) return { status: 'loading' };
  if (found.value === 'error') return { status: 'error' };
  const rebates = found.value.programs
    .map((program) => fromProgram(program, squareFeet, estimate, units))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.dollars - a.dollars);
  return { status: 'ready', place: found.value.place, rebates };
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
  savings: null,
  note: 'Search your state for sprinkler, smart controller and irrigation checkup rebates.',
};
