import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { LatLng } from './location';

// Open-Meteo: free weather forecasts, no API key (https://open-meteo.com).
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REFRESH_MS = 30 * 60_000;
const HOURS_SHOWN = 5;

export type WeatherIconKind =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'thunder'
  | 'sunrise'
  | 'sunset';

export type ForecastSlot = { label: string; icon: WeatherIconKind; temperature: number };

/** Which Apple-style background the widget shows. */
export type Sky = 'day' | 'sunset' | 'night' | 'rain';

export type Weather = {
  temperature: number;
  condition: string;
  icon: WeatherIconKind;
  sky: Sky;
  /** Next few hours, with sunrise/sunset slotted in when they fall inside the window. */
  hourly: ForecastSlot[];
};

type ForecastResponse = {
  current: { time: string; temperature_2m: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[] };
  daily: { sunrise: string[]; sunset: string[] };
};

/** WMO weather code -> condition name and icon (https://open-meteo.com/en/docs). */
export function describe(code: number, isDay: boolean): { condition: string; icon: WeatherIconKind } {
  if (code === 0) return { condition: 'Clear', icon: isDay ? 'clear-day' : 'clear-night' };
  if (code === 1 || code === 2) return { condition: 'Partly Cloudy', icon: isDay ? 'partly-day' : 'partly-night' };
  if (code === 3) return { condition: 'Cloudy', icon: 'cloudy' };
  if (code === 45 || code === 48) return { condition: 'Fog', icon: 'fog' };
  if (code >= 51 && code <= 57) return { condition: 'Drizzle', icon: 'rain' };
  if (code === 65 || code === 67 || code === 82) return { condition: 'Heavy Rain', icon: 'heavy-rain' };
  if ((code >= 61 && code <= 66) || code === 80 || code === 81) return { condition: 'Rain', icon: 'rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: 'Snow', icon: 'snow' };
  if (code >= 95) return { condition: 'Thunderstorms', icon: 'thunder' };
  return { condition: 'Cloudy', icon: 'cloudy' };
}

/** Rain, drizzle, showers and storms (WMO codes) get the rainy background. */
const isWet = (code: number) => (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95;

// Open-Meteo returns local times ("2026-09-26T21:00") in the location's timezone; compare
// and format them as plain wall-clock values so the phone's own timezone doesn't matter.
const hourOf = (time: string) => Number(time.slice(11, 13));
const minuteOf = (time: string) => Number(time.slice(14, 16));
function hourLabel(time: string) {
  const h = hourOf(time);
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'AM' : 'PM'}`;
}
/** Minutes since the epoch for a local wall-clock time string (only used for differences). */
const minutesOf = (time: string) =>
  Date.UTC(Number(time.slice(0, 4)), Number(time.slice(5, 7)) - 1, Number(time.slice(8, 10)), hourOf(time), minuteOf(time)) /
  60_000;

/** Rain > around sunrise/sunset > night > day. */
function skyFor(data: ForecastResponse): Sky {
  if (isWet(data.current.weather_code)) return 'rain';
  const now = minutesOf(data.current.time);
  const near = (times: string[], before: number, after: number) =>
    times.some((time) => now >= minutesOf(time) - before && now <= minutesOf(time) + after);
  if (near(data.daily.sunset, 45, 40) || near(data.daily.sunrise, 40, 30)) return 'sunset';
  return data.current.is_day === 1 ? 'day' : 'night';
}

function clockLabel(time: string) {
  const h = hourOf(time);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(minuteOf(time)).padStart(2, '0')}`;
}

function toWeather(data: ForecastResponse): Weather {
  const now = describe(data.current.weather_code, data.current.is_day === 1);
  // Hourly starts at the current hour; the next HOURS_SHOWN hours follow it.
  const start = Math.max(0, data.hourly.time.indexOf(data.current.time.slice(0, 13) + ':00'));
  const hours = data.hourly.time.slice(start + 1, start + 1 + HOURS_SHOWN).map((time, i) => {
    const at = start + 1 + i;
    return {
      time,
      label: hourLabel(time),
      temperature: data.hourly.temperature_2m[at],
      icon: describe(data.hourly.weather_code[at], data.hourly.is_day[at] === 1).icon,
    };
  });

  // Slot in a sunrise/sunset that happens before the last hour shown (like the iPhone widget).
  const slots: (ForecastSlot & { time: string })[] = [...hours];
  const last = hours[hours.length - 1]?.time;
  const events = [
    ...data.daily.sunrise.map((time) => ({ time, icon: 'sunrise' as const })),
    ...data.daily.sunset.map((time) => ({ time, icon: 'sunset' as const })),
  ];
  for (const event of events) {
    if (!last || event.time <= data.current.time || event.time > last) continue;
    const before = slots.findIndex((slot) => slot.time > event.time);
    const nearest = slots[Math.max(0, before - 1)];
    slots.splice(before === -1 ? slots.length : before, 0, {
      time: event.time,
      label: clockLabel(event.time),
      icon: event.icon,
      temperature: nearest?.temperature ?? data.current.temperature_2m,
    });
  }

  return {
    temperature: data.current.temperature_2m,
    condition: now.condition,
    icon: now.icon,
    sky: skyFor(data),
    hourly: slots.slice(0, HOURS_SHOWN).map(({ label, icon, temperature }) => ({ label, icon, temperature })),
  };
}

async function fetchWeather({ latitude, longitude }: LatLng): Promise<Weather> {
  const query = [
    `latitude=${latitude}`,
    `longitude=${longitude}`,
    'current=temperature_2m,weather_code,is_day',
    'hourly=temperature_2m,weather_code,is_day',
    'daily=sunrise,sunset',
    'temperature_unit=fahrenheit',
    'timezone=auto',
    'forecast_days=2',
  ].join('&');
  const response = await fetch(`${FORECAST_URL}?${query}`);
  if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  return toWeather((await response.json()) as ForecastResponse);
}

// ---------- caching: show a forecast instantly, refresh in the background ----------

/** A saved forecast younger than this is shown right away while a fresh one loads. */
const MAX_CACHED_AGE_MS = 3 * 60 * 60_000;
const STORAGE_PREFIX = 'lawnalyze/weather/';

type Cached = { at: number; weather: Weather };
const memory = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Weather>>();

const keyFor = ({ latitude, longitude }: LatLng) => `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
const fresh = (cached: Cached | undefined, maxAge: number) => !!cached && Date.now() - cached.at < maxAge;

/** One shared request per place; the result is remembered in memory and on the phone. */
function loadWeather(spot: LatLng): Promise<Weather> {
  const key = keyFor(spot);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const request = fetchWeather(spot)
    .then((weather) => {
      const cached = { at: Date.now(), weather };
      memory.set(key, cached);
      AsyncStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(cached)).catch(() => {});
      return weather;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

/** Start loading the forecast early (e.g. at launch), so Home can show it immediately. */
export function prefetchWeather(spot: LatLng | null) {
  if (!spot || fresh(memory.get(keyFor(spot)), REFRESH_MS)) return;
  loadWeather(spot).catch(() => {});
}

/** Current weather + next hours at a location, refreshed every 30 minutes. */
export function useWeather(spot: LatLng | null): Weather | null {
  const latitude = spot?.latitude;
  const longitude = spot?.longitude;
  const key = latitude === undefined || longitude === undefined ? null : keyFor({ latitude, longitude });
  // Whatever is already in memory shows on the very first frame.
  const [shown, setShown] = useState<{ key: string; weather: Weather } | null>(() => {
    const cached = key ? memory.get(key) : undefined;
    return key && cached ? { key, weather: cached.weather } : null;
  });

  useEffect(() => {
    if (key === null || latitude === undefined || longitude === undefined) return;
    let active = true;
    const show = (weather: Weather) => {
      if (active) setShown({ key, weather });
    };

    const inMemory = memory.get(key);
    if (inMemory) show(inMemory.weather);
    else {
      // Cold start: the forecast saved last time appears while the new one loads.
      AsyncStorage.getItem(STORAGE_PREFIX + key)
        .then((raw) => {
          const saved = raw ? (JSON.parse(raw) as Cached) : undefined;
          if (saved && fresh(saved, MAX_CACHED_AGE_MS) && !memory.has(key)) show(saved.weather);
        })
        .catch(() => {});
    }

    const load = () =>
      loadWeather({ latitude, longitude })
        .then(show)
        .catch(() => {
          // Keep showing the last forecast; the next refresh will try again.
        });
    if (!fresh(inMemory, REFRESH_MS)) load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [key, latitude, longitude]);

  return shown && shown.key === key ? shown.weather : null;
}
