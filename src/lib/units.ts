import type { Units } from './app-state';

// Everything is calculated in US customary units (gallons, square feet, feet, °F, inches) and
// converted only for display, when Settings is on the metric system. Exact conversion factors.

const LITERS_PER_US_GALLON = 3.785411784;
const SQ_M_PER_SQ_FT = 0.09290304;
const METERS_PER_FOOT = 0.3048;
const MM_PER_INCH = 25.4;

const withCommas = (n: number) => Math.round(n).toLocaleString('en-US');
const metric = (units: Units) => units === 'metric';

/** Water: "1,234 gallons" or "4,671 liters". */
export const formatWater = (usGallons: number, units: Units) =>
  metric(units) ? `${withCommas(usGallons * LITERS_PER_US_GALLON)} liters` : `${withCommas(usGallons)} gallons`;

/** An area's number alone: "9,233" (sq ft) or "858" (m²). */
export const formatAreaNumber = (squareFeet: number, units: Units) =>
  withCommas(metric(units) ? squareFeet * SQ_M_PER_SQ_FT : squareFeet);

/** "sq ft" / "m²", or spelled out: "square feet" / "square meters". */
export const areaUnit = (units: Units, long = false) =>
  metric(units) ? (long ? 'square meters' : 'm²') : long ? 'square feet' : 'sq ft';

/** "9,233 sq ft" or "858 m²". */
export const formatArea = (squareFeet: number, units: Units) => `${formatAreaNumber(squareFeet, units)} ${areaUnit(units)}`;

/** A side length: "32 ft" / "9.8 m" (one decimal for short sides). */
export function formatLength(feet: number, units: Units): string {
  const value = metric(units) ? feet * METERS_PER_FOOT : feet;
  const unit = metric(units) ? 'm' : 'ft';
  return value < 10 ? `${value.toFixed(1)} ${unit}` : `${withCommas(value)} ${unit}`;
}

/** A temperature given in °F, as a whole number in the chosen units. */
export const temperature = (fahrenheit: number, units: Units) =>
  Math.round(metric(units) ? ((fahrenheit - 32) * 5) / 9 : fahrenheit);

/** "72°F" or "22°C". */
export const formatTemperature = (fahrenheit: number, units: Units) =>
  `${temperature(fahrenheit, units)}°${metric(units) ? 'C' : 'F'}`;

/** Rain: "0.3 in." or "8 mm". */
export const formatRain = (inches: number, units: Units) =>
  metric(units) ? `${Math.round(inches * MM_PER_INCH)} mm` : `${inches.toFixed(1)} in.`;

/** A price per area of lawn: "$2 per sq ft" or "$21.53 per m²". */
export function formatPricePerArea(dollarsPerSqFt: number, units: Units): string {
  if (!metric(units)) return `$${dollarsPerSqFt} per sq ft`;
  const perSqM = dollarsPerSqFt / SQ_M_PER_SQ_FT;
  return `$${Number.isInteger(perSqM) ? perSqM : perSqM.toFixed(2)} per m²`;
}
