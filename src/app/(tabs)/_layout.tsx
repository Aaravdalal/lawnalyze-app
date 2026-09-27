import { Tabs } from 'expo-router/js-tabs';

import { TabNav } from '@/ui/TabNav';

// The Figma nav bar is drawn over the tab screens (see TabNav) so it can animate between tabs.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabNav {...props} />}
      // Keep every tab mounted and attached, so switching tabs is instant and nothing reloads.
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
