import {
  GoogleSansFlex_300Light,
  GoogleSansFlex_400Regular,
  GoogleSansFlex_500Medium,
  useFonts,
} from '@expo-google-fonts/google-sans-flex';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AppStateProvider, useAppState } from '@/lib/app-state';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <AppStateProvider>
      <RootNavigator />
    </AppStateProvider>
  );
}

function RootNavigator() {
  // Google Sans Flex matches the Figma type; used for live text (inputs, weather, areas).
  const [fontsLoaded, fontError] = useFonts({ GoogleSansFlex_300Light, GoogleSansFlex_400Regular, GoogleSansFlex_500Medium });
  const { ready } = useAppState();
  const loaded = ready && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </>
  );
}
