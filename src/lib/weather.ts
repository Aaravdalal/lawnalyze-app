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

export type Weather = {
  temperature: number;
  condition: string;
  icon: WeatherIconKind;
  /** Next few hours, with sunrise/sunset slotted in when they fall inside the window. */
  hourly: ForecastSlot[];
};

type ForecastResponse = {
  current: { time: string; temperature_2m: number; weather_code: number; is_day: number };
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; is_day: number[] };
  daily: { sunrise: string[]; sunset: string[] };
};

/** WMO weather code -> condition name and icon (https://open-meteo.com/en/docs). */
function describe(code: number, isDay: boolean): { condition: string; icon: WeatherIconKind } {
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

// Open-Meteo returns local times ("2026-09-26T21:00") in the location's timezone; compare
// and format them as plain wall-clock values so the phone's own timezone doesn't matter.
const hourOf = (time: string) => Number(time.slice(11, 13));
const minuteOf = (time: string) => Number(time.slice(14, 16));
function hourLabel(time: string) {
  const h = hourOf(time);
  return `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'AM' : 'PM'}`;
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
      temperature: Math.round(data.hourly.temperature_2m[at]),
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
      temperature: nearest?.temperature ?? Math.round(data.current.temperature_2m),
    });
  }

  return {
    temperature: Math.round(data.current.temperature_2m),
    condition: now.condition,
    icon: now.icon,
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

/** Current weather + next hours at a location, refreshed every 30 minutes. */
export function useWeather(spot: LatLng | null): Weather | null {
  const [weather, setWeather] = useState<Weather | null>(null);
  const latitude = spot?.latitude;
  const longitude = spot?.longitude;

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    let active = true;
    const load = () =>
      fetchWeather({ latitude, longitude })
        .then((next) => {
          if (active) setWeather(next);
        })
        .catch(() => {
          // Keep showing the last forecast; the next refresh will try again.
        });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [latitude, longitude]);

  return weather;
}
