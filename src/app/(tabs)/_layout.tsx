import { Tabs } from 'expo-router/js-tabs';

import { TabNav } from '@/ui/TabNav';

// The Figma nav bar is drawn over the tab screens (see TabNav) so it can animate between tabs.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabNav {...props} />}
      // Keep every tab mounted and attached: re-attaching the map WebViews on Home/Settings
      // flashed white rectangles and stuttered the tab bar morph.
      detachInactiveScreens={false}
      screenOptions={{ headerShown: false, animation: 'none', lazy: false, freezeOnBlur: false }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="usage" />
      <Tabs.Screen name="rebates" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}
