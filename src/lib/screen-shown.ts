import { useNavigation } from 'expo-router';
import type { StackNavigationProp } from 'expo-router/js-stack';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * If the stack never says the screen is in, go ahead this long (ms) after it's navigated to. On
 * a phone it always does; in a browser the native stack never does, and nothing there is slow.
 */
const FALLBACK_MS = Platform.OS === 'web' ? 300 : 3000;

/**
 * Resolves once this screen has finished coming in: built, on screen and done with its
 * transition. On a phone that can be well after the screen's code has run (building it takes a
 * while, the first map most of all), and a screen built ahead of time (see the intro) can sit
 * off to the side for a while before it's shown at all, so something meant to be seen happening,
 * like a glow, waits for this rather than playing out where no one sees it.
 */
export function useScreenShown(): Promise<void> {
  // Native and JS stacks both report the end of a transition (`transitionEnd`).
  const navigation = useNavigation<StackNavigationProp<Record<string, object | undefined>>>();
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
