import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

/** How many times the current screen has been focused (starts at 1 once it's shown). */
export function useFocusCount(): number {
  const [count, setCount] = useState(0);
  useFocusEffect(useCallback(() => setCount((c) => c + 1), []));
  return count;
}
