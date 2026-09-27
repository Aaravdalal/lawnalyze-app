// The local-notification parts of expo-notifications, imported one by one.
//
// Importing the package itself (`from 'expo-notifications'`) also loads its push-token
// auto-registration, which throws on Android in Expo Go ("push notifications were removed from
// Expo Go") and takes the whole app down with it. Local, scheduled notifications (all
// Lawnalyze uses) work fine in Expo Go, so only those modules are loaded.
export { cancelAllScheduledNotificationsAsync } from 'expo-notifications/build/cancelAllScheduledNotificationsAsync';
export { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
export { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
export { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
export { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
export { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync';
export { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync';
