import {
  GoogleSansFlex_300Light,
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  useFonts,
} from '@expo-google-fonts/google-sans-flex';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppStateProvider, useAppState } from '@/lib/app-state';
import { prefetchClimate, useLawnEstimate } from '@/lib/estimate';
import { prefetchWeather } from '@/lib/weather';
import { requestWeatherAlertPermission, syncWeatherAlerts, weatherAlertsSupported } from '@/lib/weather-alerts';
import { SharedChin } from '@/ui/SharedChin';

SplashScreen.preventAutoHideAsync();

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

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

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
    if (!ready || !onboarded || kc === undefined) return;
    syncWeatherAlerts({ enabled: preferences.weatherAlerts, lawn, outlines, units: preferences.units, kc });
    // outlinesKey stands in for outlines (same content, new array after every load).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, onboarded, preferences.weatherAlerts, preferences.units, lawn, outlinesKey, kc]);
}
