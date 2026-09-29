import { useSegments } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TabNav } from '@/ui/TabNav';

// The Figma nav bar is drawn over the tab screens (see TabNav) so it can animate between tabs.
export default function TabsLayout() {
  // The tab showing (e.g. "home"): the others stay mounted underneath it, and since the
  // screens are see-through now, they're hidden rather than covered.
  const segments = useSegments();
  const current = segments[segments.length - 1];

  return (
    <Tabs
      tabBar={(props) => <TabNav {...props} />}
      // Keep every tab mounted and attached, so switching tabs is instant and nothing reloads.
      detachInactiveScreens={false}
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'none',
        lazy: false,
        freezeOnBlur: false,
        // See-through, so the shared green chin behind every screen shows (see app/_layout.tsx).
        sceneStyle: [{ backgroundColor: 'transparent' }, route.name !== current && { opacity: 0 }],
      })}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="usage" />
      <Tabs.Screen name="rebates" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
