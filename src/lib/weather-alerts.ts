

import * as Notifications from './local-notifications';
import { Platform } from 'react-native';

import type { Lawn, Outline, Units } from './app-state';
import { totalSquareFeet } from './area';
import { GALLONS_PER_SQFT_INCH, MM_PER_INCH, growth } from './estimate';
import { formatRain, formatTemperature, formatWater } from './units';
import { describe } from './weather';

// "Get Notified For Weather Events": one notification each morning with that day's weather
// for the lawn and what it means for watering (rain → skip it, heat → water early, and how
// much water the lawn will use). Local notifications, scheduled from the 14-day forecast and
// refreshed every time the app opens.

const CHANNEL_ID = 'weather';
const SEND_AT_HOUR = 8; // 8 AM
const FORECAST_DAYS = 14;

/** Local notifications need the phone app (not the web preview). */
export const weatherAlertsSupported = Platform.OS !== 'web';

if (weatherAlertsSupported) {
  // Show the day's update even if the app happens to be open at 8 AM.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android: the "Daily weather for your lawn" notification channel, if it could be made. Expo
 * Go can refuse to create app channels; then notifications go to its default channel instead.
 */
async function ensureChannel(): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  try {
    const channel = await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Daily weather for your lawn',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    return channel ? CHANNEL_ID : undefined;
  } catch {
    return undefined;
  }
}

/** Asks for notification permission unless it's already allowed; true when allowed. */
export async function requestWeatherAlertPermission(): Promise<boolean> {
  if (!weatherAlertsSupported) return false;
  await ensureChannel();
  if ((await Notifications.getPermissionsAsync()).granted) return true;
  // Always ask (Android shows the prompt only if the user hasn't blocked it for good).
  return (await Notifications.requestPermissionsAsync()).granted;
}

// ---------- the forecast and the message for each day ----------

type DayForecast = {
  date: string; // YYYY-MM-DD in the lawn's timezone
  code: number;
  highF: number;
  lowF: number;
  meanF: number;
  rainIn: number;
  rainChance: number;
  et0Mm: number;
};

async function fetchDailyForecast({ latitude, longitude }: Lawn): Promise<DayForecast[]> {
  const query = [
    `latitude=${latitude}`,
    `longitude=${longitude}`,
    'daily=weather_code,temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration',
    'temperature_unit=fahrenheit',
    'timezone=auto',
    `forecast_days=${FORECAST_DAYS}`,
  ].join('&');
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
  if (!response.ok) throw new Error(`Forecast request failed (${response.status})`);
  const { daily } = (await response.json()) as {
    daily: {
      time: string[];
      weather_code: number[];
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      temperature_2m_mean: (number | null)[];
      precipitation_sum: (number | null)[];
      precipitation_probability_max: (number | null)[];
      et0_fao_evapotranspiration: (number | null)[];
    };
  };
  return daily.time.map((date, i) => ({
    date,
    code: daily.weather_code[i],
    highF: daily.temperature_2m_max[i],
    lowF: daily.temperature_2m_min[i],
    meanF: daily.temperature_2m_mean[i] ?? (daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2,
    rainIn: (daily.precipitation_sum[i] ?? 0) / MM_PER_INCH,
    rainChance: daily.precipitation_probability_max[i] ?? 0,
    et0Mm: daily.et0_fao_evapotranspiration[i] ?? 0,
  }));
}

type LawnFacts = { place: string; squareFeet: number; kc: number; units: Units };

function messageFor(day: DayForecast, { place, squareFeet, kc, units }: LawnFacts) {
  const high = formatTemperature(day.highF, units);
  const condition = describe(day.code, true).condition;
  // What the grass will use today: ET₀ × turf coefficient (less when it's cold), over the lawn.
  const meanC = ((day.meanF - 32) * 5) / 9;
  const usGallons = ((day.et0Mm * kc * growth(meanC)) / MM_PER_INCH) * GALLONS_PER_SQFT_INCH * squareFeet;
  const water = formatWater(usGallons, units);

  if (day.lowF <= 32) {
    return {
      title: `Frost in ${place} today`,
      body: `Low of ${formatTemperature(day.lowF, units)}. Skip watering today so ice doesn't form on your grass.`,
    };
  }
  if (day.rainIn >= 0.1 || (day.rainChance >= 60 && day.rainIn >= 0.04)) {
    return {
      title: `Rain in ${place} today`,
      body: `About ${formatRain(day.rainIn, units)} of rain expected (${Math.round(day.rainChance)}% chance). Skip watering and let the rain do it.`,
    };
  }
  if (squareFeet <= 0) {
    return { title: `${condition}, ${high} in ${place}`, body: 'Mark your lawn in Lawnalyze to see how much water it needs.' };
  }
  if (usGallons < 1) {
    return { title: `${condition}, ${high} in ${place}`, body: "It's too cold for your grass to grow. No watering needed today." };
  }
  if (day.highF >= 90) {
    return {
      title: `Hot day in ${place}: ${high}`,
      body: `Your lawn will use about ${water} of water today. If you water, do it before 10 AM so less of it evaporates.`,
    };
  }
  return { title: `${condition}, ${high} in ${place}`, body: `Your lawn will use about ${water} of water today.` };
}

// ---------- scheduling ----------

export type WeatherAlertOptions = {
  enabled: boolean;
  lawn: Lawn | null;
  outlines: Outline[];
  units: Units;
  /** Turf coefficient from the lawn's estimate. */
  kc: number;
};

let queue: Promise<void> = Promise.resolve();

/** Replaces the scheduled notifications with the next two weeks' (or clears them). */
export function syncWeatherAlerts(options: WeatherAlertOptions): Promise<void> {
  // One sync at a time, so two quick changes can't interleave their cancel/schedule calls.
  queue = queue.then(() => sync(options)).catch(() => {});
  return queue;
}

async function sync({ enabled, lawn, outlines, units, kc }: WeatherAlertOptions) {
  if (!weatherAlertsSupported) return;
  if (!enabled || !lawn) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const channelId = await ensureChannel();
  const days = await fetchDailyForecast(lawn);
  await Notifications.cancelAllScheduledNotificationsAsync();

  const facts = lawnFacts(lawn, outlines, units, kc);
  const now = Date.now();
  const at = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(year, month - 1, day, SEND_AT_HOUR, 0, 0);
  };
  for (const day of days) {
    const when = at(day.date);
    if (when.getTime() <= now + 60_000) continue; // today's 8 AM already passed
    await Notifications.scheduleNotificationAsync({
      content: messageFor(day, facts),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId },
    });
  }
  // The forecast only reaches two weeks out: after that, a nudge to open the app (which
  // schedules the next two weeks).
  const last = at(days[days.length - 1].date);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Your lawn weather updates are paused',
      body: 'Open Lawnalyze to keep getting a weather update for your lawn every morning.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(last.getTime() + 24 * 60 * 60_000),
      channelId,
    },
  });
}

const lawnFacts = (lawn: Lawn, outlines: Outline[], units: Units, kc: number): LawnFacts => ({
  place: lawn.city || 'your area',
  squareFeet: totalSquareFeet(outlines),
  kc,
  units,
});

/**
 * Sends today's weather update right now (what arrives each morning), e.g. when the user turns
 * the updates on in Settings. Needs notification permission already granted.
 */
export async function sendWeatherAlertNow({ lawn, outlines, units, kc }: Omit<WeatherAlertOptions, 'enabled'>) {
  if (!weatherAlertsSupported || !lawn) return;
  const channelId = await ensureChannel();
  const [today] = await fetchDailyForecast(lawn);
  await Notifications.scheduleNotificationAsync({
    content: messageFor(today, lawnFacts(lawn, outlines, units, kc)),
    trigger: channelId ? { channelId } : null, // right away
  });
}
