import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { LatLng } from './location';

export type Lawn = LatLng & { address: string; city: string; state: string };
/** US customary (gallons, sq ft, °F) or metric (liters, m², °C). */
export type Units = 'customary' | 'metric';
/** The three sections of the Home screen, which can be put in any order (Settings > Edit Placement). */
export type HomeSection = 'weather' | 'lawns' | 'cost';
export const HOME_SECTIONS: HomeSection[] = ['weather', 'lawns', 'cost'];
export type Preferences = {
  units: Units;
  weatherAlerts: boolean;
  /** Side lengths and areas drawn on the lawn maps (Home and Settings). */
  showDimensions: boolean;
  /** Home's sections, top to bottom. */
  homeOrder: HomeSection[];
};
/** A marked lawn area: its corner points in order. */
export type Outline = LatLng[];

type StoredState = {
  onboarded: boolean;
  lawn: Lawn | null;
  /** Lawn areas marked on the map (a property can have several). */
  outlines: Outline[];
  preferences: Preferences;
};

const STORAGE_KEY = 'lawnalyze/state/v1';

const INITIAL_STATE: StoredState = {
  onboarded: false,
  lawn: null,
  outlines: [],
  preferences: { units: 'customary', weatherAlerts: true, showDimensions: false, homeOrder: HOME_SECTIONS },
};

type AppState = StoredState & {
  ready: boolean;
  setLawn: (lawn: Lawn) => void;
  setOutlines: (outlines: Outline[]) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setPreferences: (preferences: Preferences) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoredState>(INITIAL_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        const stored = { ...INITIAL_STATE, ...(JSON.parse(raw) as Partial<StoredState>) };
        // Settings added since this was saved get their defaults.
        const preferences = { ...INITIAL_STATE.preferences, ...stored.preferences };
        // The second units option used to be "imperial" (only the gallon differed); it's metric now.
        if ((preferences.units as string) === 'imperial') preferences.units = 'metric';
        const order = preferences.homeOrder;
        if (order.length !== HOME_SECTIONS.length || !HOME_SECTIONS.every((s) => order.includes(s))) {
          preferences.homeOrder = HOME_SECTIONS;
        }
        setState({ ...stored, preferences });
      })
      .catch(() => {
        // Unreadable storage: start fresh rather than blocking the app.
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (ready) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const update = useCallback((patch: Partial<StoredState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const value = useMemo<AppState>(
    () => ({
      ...state,
      ready,
      // Moving the lawn to a different spot invalidates the outlines marked around the old one.
      setLawn: (lawn) =>
        setState((previous) => {
          const moved =
            !previous.lawn ||
            previous.lawn.latitude !== lawn.latitude ||
            previous.lawn.longitude !== lawn.longitude;
          return { ...previous, lawn, outlines: moved ? [] : previous.outlines };
        }),
      setOutlines: (outlines) => update({ outlines }),
      completeOnboarding: () => update({ onboarded: true }),
      resetOnboarding: () => setState(INITIAL_STATE),
      setPreferences: (preferences) => update({ preferences }),
    }),
    [state, ready, update],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppStateContext);
  if (!value) throw new Error('useAppState must be used inside <AppStateProvider>');
  return value;
}
