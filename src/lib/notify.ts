import { Alert, Platform } from 'react-native';

/** A simple OK dialog (React Native's Alert does nothing on web). */
export function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}
