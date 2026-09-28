import { useEffect, useState } from 'react';

import type { Outline } from './app-state';
import { totalSquareFeet } from './area';
import type { LatLng } from './location';

// Lawn watering estimates from local weather, using the standard evapotranspiration method
// irrigation designers use (the same formula as California's Model Water Efficient Landscape
// Ordinance, MWELO: gallons = ET₀ × 0.62 × plant factor × area ÷ irrigation efficiency),
// run day by day so rain can be credited:
// - grass uses reference evapotranspiration (ET₀, FAO-56 Penman-Monteith: driven by heat,
//   sun, wind and humidity) times a turf coefficient;
// - rain refills the soil; the root zone stores about an inch of water;
// - sprinklers lose some of what they apply.
//
// Weather data: Open-Meteo (free, no key) — the last year of daily history for the yearly
// figure, and the recent days + 7-day forecast for this week. Note: gridded weather data
// tends to put ET₀ 10–20% above what California's CIMIS stations measure near the Bay.

/** Root-zone water a lawn can draw on: ~6 in of roots × ~0.17 in of water per inch of soil. */
const ROOT_ZONE_MM = 25;
/** Water when half of it is used up (standard turf practice). */
const REFILL_AT = 0.5;
/**
 * Share of sprinkler water that reaches the roots (the rest is lost to evaporation, wind and
 * runoff): MWELO's average irrigation efficiency.
 */
export const SPRINKLER_EFFICIENCY = 0.71;
/** Rain lighter than this (0.1 in) mostly evaporates off the grass before reaching roots. */
const MIN_USEFUL_RAIN_MM = 2.5;
/** Share of real rain that soaks into the root zone. */
const RAIN_SOAK_IN = 0.8;
/** Turf coefficients (University of California turfgrass research; MWELO plant factors). */
export const KC_COOL_SEASON = 0.8; // tall fescue, bluegrass, ryegrass
const KC_WARM_SEASON = 0.6; // bermuda, zoysia, St. Augustine
/** Warm-season grasses dominate where the average temperature is above ~64°F. */
const WARM_SEASON_MEAN_C = 18;

/** 1 inch of water over 1 sq ft = 144 in³ = 0.623 US gallons (MWELO's "0.62"). */
export const GALLONS_PER_SQFT_INCH = 0.623;
export const MM_PER_INCH = 25.4;

/**
 * US average residential water price: $7.74 per 1,000 gallons (EPA WaterSense's 2024 national
 * estimate, epa.gov/watersense/data-and-information-used-watersense). Water only: most
 * utilities don't charge sewer fees on outdoor watering.
 */
const PRICE_PER_GALLON = 7.74 / 1000;
/**
 * National average water per square foot of lawn, per year (≈ 4.0 gal/sq ft, 163 L/m²):
 * - the average household's outdoor water: "The average American family uses more than 300
 *   gallons of water per day at home", and "outdoor water use accounts for 30 percent"
 *   (epa.gov/watersense/how-we-use-water) → 90 gallons a day;
 * - spread over the median US lawn, 8,186 sq ft (satellite measurements of 1,017 US homes,
 *   measurelawn.com/average-lawn-size, 2026).
 */
const NATIONAL_GALLONS_PER_SQFT_YEAR = (90 * 365) / 8186;

type Day = { et0: number; rain: number; meanTempC: number };

type Climate = {
  lastYear: Day[];
  lastWeek: Day[];
  nextWeek: Day[];
  meanAnnualTempC: number;
};

export type Rating = 'Great' | 'Fair' | 'Bad';

export type Estimate = {
  /** US gallons (converted to liters for display when Settings is on metric). */
  weeklyGallons: number;
  yearlyGallons: number;
  weeklyCost: number;
  yearlyCost: number;
  /** This lawn's water per square foot vs the national average lawn's (100 = average). */
  percentOfNational: number;
  rating: Rating;
  grass: 'cool-season' | 'warm-season';
  /** Turf coefficient used (0.8 cool-season, 0.6 warm-season). */
  kc: number;
};

// ---------- model ----------

/** Grass slows below 50°F and goes dormant (no water needed) below ~41°F. */
export const growth = (meanTempC: number) => Math.min(1, Math.max(0, (meanTempC - 5) / 5));
const usefulRain = (mm: number) => (mm < MIN_USEFUL_RAIN_MM ? 0 : mm * RAIN_SOAK_IN);
const lawnUse = (day: Day, kc: number) => day.et0 * kc * growth(day.meanTempC);

/** Water to apply over a year (mm, before sprinkler losses), with a daily soil-water balance. */
function yearlyNeedMm(days: Day[], kc: number): number {
  let used = 0; // how much of the root zone's water has been used up
  let applied = 0;
  for (const day of days) {
    used = Math.min(ROOT_ZONE_MM, Math.max(0, used + lawnUse(day, kc) - usefulRain(day.rain)));
    if (used >= ROOT_ZONE_MM * REFILL_AT) {
      applied += used; // water back to full
      used = 0;
    }
  }
  return applied;
}

/** Water to apply over the next 7 days (mm), credited for rain still in the soil. */
function weeklyNeedMm(lastWeek: Day[], nextWeek: Day[], kc: number): number {
  // Recent rain: start from a typically half-used root zone and see if rain refilled it.
  let used = ROOT_ZONE_MM * REFILL_AT;
  for (const day of lastWeek) {
    used = Math.min(ROOT_ZONE_MM, Math.max(0, used + lawnUse(day, kc) - usefulRain(day.rain)));
  }
  const rainCredit = Math.max(0, ROOT_ZONE_MM * REFILL_AT - used);
  const need = nextWeek.reduce((sum, day) => sum + lawnUse(day, kc) - usefulRain(day.rain), 0);
  return Math.max(0, need - rainCredit);
}

/** At or under the national average is Great; up to twice it, Fair; more, Bad. */
function ratingFor(percent: number): Rating {
  if (percent <= 100) return 'Great';
  if (percent <= 200) return 'Fair';
  return 'Bad';
}

/** Turf coefficient for the local climate: warm-season grasses where it's warm year-round. */
export const turfCoefficient = (meanAnnualTempC: number) =>
  meanAnnualTempC >= WARM_SEASON_MEAN_C ? KC_WARM_SEASON : KC_COOL_SEASON;

export function estimateLawn(squareFeet: number, climate: Climate): Estimate {
  const kc = turfCoefficient(climate.meanAnnualTempC);
  const toUsGallons = (mm: number) => (mm / MM_PER_INCH / SPRINKLER_EFFICIENCY) * GALLONS_PER_SQFT_INCH * squareFeet;

  const weeklyUs = toUsGallons(weeklyNeedMm(climate.lastWeek, climate.nextWeek, kc));
  const yearlyUs = toUsGallons(yearlyNeedMm(climate.lastYear, kc));
  // Baseline: what an average American lawn uses per year
  const baselineYearlyUs = NATIONAL_GALLONS_PER_SQFT_YEAR * squareFeet;
  const percentOfNational = (yearlyUs / baselineYearlyUs) * 100;

  return {
    weeklyGallons: weeklyUs,
    yearlyGallons: yearlyUs,
    weeklyCost: weeklyUs * PRICE_PER_GALLON,
    yearlyCost: yearlyUs * PRICE_PER_GALLON,
    percentOfNational,
    rating: ratingFor(percentOfNational),
    grass: kc === KC_WARM_SEASON ? 'warm-season' : 'cool-season',
    kc,
  };
}

// ---------- weather data ----------

type Daily = {
  time: string[];
  et0_fao_evapotranspiration: (number | null)[];
  precipitation_sum: (number | null)[];
  temperature_2m_mean?: (number | null)[];
  temperature_2m_max?: (number | null)[];
  temperature_2m_min?: (number | null)[];
};

function toDays(daily: Daily): Day[] {
  return daily.time.map((_, i) => {
    const mean =
      daily.temperature_2m_mean?.[i] ??
      ((daily.temperature_2m_max?.[i] ?? 15) + (daily.temperature_2m_min?.[i] ?? 15)) / 2;
    return { et0: daily.et0_fao_evapotranspiration[i] ?? 0, rain: daily.precipitation_sum[i] ?? 0, meanTempC: mean };
  });
}

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  return (await response.json()) as T;
}

async function fetchClimate({ latitude, longitude }: LatLng): Promise<Climate> {
  const where = `latitude=${latitude}&longitude=${longitude}&timezone=auto`;
  // The history archive lags a few days behind, so the year ends 6 days ago.
  const end = new Date(Date.now() - 6 * 86_400_000);
  const start = new Date(end.getTime() - 364 * 86_400_000);
  const [archive, forecast] = await Promise.all([
    getJson<{ daily: Daily }>(
      `https://archive-api.open-meteo.com/v1/archive?${where}&start_date=${isoDate(start)}&end_date=${isoDate(end)}` +
        '&daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_mean',
    ),
    getJson<{ daily: Daily }>(
      `https://api.open-meteo.com/v1/forecast?${where}&past_days=7&forecast_days=7` +
        '&daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max,temperature_2m_min',
    ),
  ]);
  const lastYear = toDays(archive.daily);
  const recent = toDays(forecast.daily); // 7 past days, then today + 6 days ahead
  return {
    lastYear,
    lastWeek: recent.slice(0, 7),
    nextWeek: recent.slice(7, 14),
    meanAnnualTempC: lastYear.reduce((sum, day) => sum + day.meanTempC, 0) / Math.max(1, lastYear.length),
  };
}

// One request per place, shared by every screen, refreshed every few hours.
const REFRESH_MS = 3 * 60 * 60_000;
const climateCache = new Map<string, { at: number; climate: Promise<Climate> }>();

function climateFor(spot: LatLng): Promise<Climate> {
  const key = `${spot.latitude.toFixed(3)},${spot.longitude.toFixed(3)}`;
  const cached = climateCache.get(key);
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.climate;
  const climate = fetchClimate(spot);
  climateCache.set(key, { at: Date.now(), climate });
  climate.catch(() => climateCache.delete(key)); // let the next render retry
  return climate;
}

/** Start loading the weather history for the estimates early (e.g. at launch). */
export function prefetchClimate(spot: LatLng | null) {
  if (spot) climateFor(spot).catch(() => {});
}

/** Water/cost estimates for the marked lawn; null until there's a marked area and data. */
export function useLawnEstimate(spot: LatLng | null, outlines: Outline[]): Estimate | null {
  const [climate, setClimate] = useState<Climate | null>(null);
  const latitude = spot?.latitude;
  const longitude = spot?.longitude;

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    let active = true;
    const load = () =>
      climateFor({ latitude, longitude })
        .then((next) => {
          if (active) setClimate(next);
        })
        .catch(() => {
          // Keep the last numbers; the next refresh will try again.
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [latitude, longitude]);

  const squareFeet = totalSquareFeet(outlines);
  if (!climate || squareFeet <= 0) return null;
  return estimateLawn(squareFeet, climate);
}
