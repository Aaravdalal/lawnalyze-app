import { useNavigation } from 'expo-router';
import type { StackNavigationProp } from 'expo-router/js-stack';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/**
 * If the stack never says the screen is in, go ahead this long (ms) after it's navigated to. On
 * a phone it always does; in a browser the native stack never does, and nothing there is slow.
 */
const FALLBACK_MS = Platform.OS === 'web' ? 300 : 3000;
/**
 * A screen that's switched to without a transition to wait for (e.g. it's where the app opened)
 * counts as shown this long (ms) after.
 */
const ARRIVED_MS = 600;

type ScreenNavigation = StackNavigationProp<Record<string, object | undefined>>;

/**
 * Resolves once this screen has finished coming in: built, on screen and done with its
 * transition. On a phone that can be well after the screen's code has run (building it takes a
 * while, the first map most of all), and a screen built ahead of time (see the intro) can sit
 * off to the side for a while before it's shown at all, so something meant to be seen happening,
 * like a glow, waits for this rather than playing out where no one sees it.
 */
export function useScreenShown(): Promise<void> {
  // Native and JS stacks both report the end of a transition (`transitionEnd`).
  const navigation = useNavigation<ScreenNavigation>();
  const [shown] = useState(() => {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  });
  useEffect(() => {
    let fallback: ReturnType<typeof setTimeout> | undefined;
    const navigatedTo = () => {
      clearTimeout(fallback);
      fallback = setTimeout(shown.resolve, FALLBACK_MS);
    };
    if (navigation.isFocused()) navigatedTo();
    const unsubscribeFocus = navigation.addListener('focus', navigatedTo);
    const unsubscribeEnd = navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) shown.resolve();
    });
    return () => {
      clearTimeout(fallback);
      unsubscribeFocus();
      unsubscribeEnd();
    };
  }, [navigation, shown]);
  return shown.promise;
}

/**
 * Calls `onShown` each time this screen has come all the way in (its transition done), and
 * `onHidden` each time it stops being the one showing. It never re-renders the screen: a screen
 * that re-renders as it's switched to holds up the switch (the slide only starts once that's done).
 */
export function useScreenVisits(onShown: () => void, onHidden: () => void) {
  const navigation = useNavigation<ScreenNavigation>();
  // The latest callbacks, for the listeners (which are added once).
  const latest = useRef({ onShown, onHidden });
  useEffect(() => {
    latest.current = { onShown, onHidden };
  });
  useEffect(() => {
    let showing = false;
    let later: ReturnType<typeof setTimeout> | undefined;
    const shown = () => {
      clearTimeout(later);
      if (showing || !navigation.isFocused()) return;
      showing = true;
      latest.current.onShown();
    };
    const focused = () => {
      clearTimeout(later);
      later = setTimeout(shown, ARRIVED_MS);
    };
    if (navigation.isFocused()) focused();
    const unsubscribe = [
      navigation.addListener('focus', focused),
      // Tabs say nothing more; a stack says whether this screen is the one leaving.
      navigation.addListener('transitionEnd', (e) => {
        if (!(e.data as { closing?: boolean } | undefined)?.closing) shown();
      }),
      navigation.addListener('blur', () => {
        clearTimeout(later);
        if (!showing) return;
        showing = false;
        latest.current.onHidden();
      }),
    ];
    return () => {
      clearTimeout(later);
      unsubscribe.forEach((off) => off());
    };
  }, [navigation]);
}
