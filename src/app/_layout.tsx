import {
  GoogleSansFlex_300Light,
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  useFonts,
} from '@expo-google-fonts/google-sans-flex';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppStateProvider, useAppState } from '@/lib/app-state';
import { KC_COOL_SEASON, prefetchClimate, useLawnEstimate } from '@/lib/estimate';
import { prefetchWeather } from '@/lib/weather';
import { requestWeatherAlertPermission, syncWeatherAlerts, weatherAlertsSupported } from '@/lib/weather-alerts';
import { prefetchUiImages } from '@/ui/assets';
import { Reveal } from '@/ui/Reveal';
import { SharedChin } from '@/ui/SharedChin';

SplashScreen.preventAutoHideAsync();

/**
 * The splash screen stays up until the first screen is all there (every picture in), so it
 * appears all at once: at most this long (ms) though...
 */
const SPLASH_MAX_MS = 4000;
/** ...and once nothing is loading, this long (ms) with nothing new starting (the first screen comes a moment after the app). */
const SPLASH_SETTLE_MS = 250;

// Screens are see-through, so the page and green chin drawn behind them (SharedChin) show.
const THEME = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: 'transparent' } };

export default function RootLayout() {
  return (
    // Gesture handler: native drag gestures (e.g. rearranging Home's sections).
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStateProvider>
        <RootNavigator />
      </AppStateProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  // Google Sans Flex matches the Figma type; used for live text (inputs, weather, areas).
  const [fontsLoaded, fontError] = useFonts({ GoogleSansFlex_300Light, GoogleSansFlex_400Regular, GoogleSansFlex_500Medium });
  const { ready, lawn } = useAppState();
  useDailyWeatherAlerts();
  const loaded = ready && (fontsLoaded || !!fontError);

  // The first screen is all there: off with the splash screen, and start loading the pictures
  // for the screens further on.
  const firstScreenShown = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
    prefetchUiImages();
  }, []);

  // Start loading the weather as soon as the lawn's location is known (at launch, or right
  // after it's found during onboarding), so Home's widget and estimates are ready on arrival.
  const latitude = lawn?.latitude;
  const longitude = lawn?.longitude;
  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    prefetchWeather({ latitude, longitude });
    prefetchClimate({ latitude, longitude });
  }, [latitude, longitude]);

  if (!loaded) return null;

  return (
    // Behind the splash screen (so not hidden here): the first screen loads, then shows.
    <Reveal hide={false} maxWait={SPLASH_MAX_MS} settle={SPLASH_SETTLE_MS} onReveal={firstScreenShown}>
      <View style={{ flex: 1 }}>
        <StatusBar style="dark" />
        {/* One green chin for every screen: it stays put while screens fade in and out. */}
        <SharedChin />
        <ThemeProvider value={THEME}>
          <Stack
            screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }}
          />
        </ThemeProvider>
      </View>
    </Reveal>
  );
}

/**
 * Keeps the daily weather notifications in step with Settings and the lawn: asks for
 * permission once alerts are on (they are by default), then schedules the next two weeks of
 * morning updates, again whenever the lawn, its outlines or the units change.
 */
function useDailyWeatherAlerts() {
  const { ready, onboarded, lawn, outlines, preferences, setPreferences } = useAppState();
  const estimate = useLawnEstimate(lawn, outlines);
  const kc = estimate?.kc;
  const wantsAlerts = ready && onboarded && preferences.weatherAlerts;

  // Alerts are on but the phone hasn't allowed notifications yet: ask. If the answer is no,
  // switch the setting to "No thanks" so Settings shows what's really happening.
  useEffect(() => {
    if (!wantsAlerts || !weatherAlertsSupported) return;
    let active = true;
    requestWeatherAlertPermission()
      .then((granted) => {
        if (active && !granted) setPreferences({ ...preferences, weatherAlerts: false });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
    // Only when alerts get switched on (not on every preferences change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsAlerts]);

  const outlinesKey = JSON.stringify(outlines);
  useEffect(() => {
    // No lawn (e.g. Settings > Reset Place): no more updates for the old one.
    if (ready && !lawn) {
      syncWeatherAlerts({ enabled: false, lawn: null, outlines: [], units: preferences.units, kc: KC_COOL_SEASON });
      return;
    }
    if (!ready || !onboarded || kc === undefined) return;
    syncWeatherAlerts({ enabled: preferences.weatherAlerts, lawn, outlines, units: preferences.units, kc });
    // outlinesKey stands in for outlines (same content, new array after every load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, onboarded, preferences.weatherAlerts, preferences.units, lawn, outlinesKey, kc]);
}
