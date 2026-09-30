import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DESIGN_WIDTH } from './Artboard';

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  onClose: () => void;
  buttonLabel?: string;
  /** Card width in design pts (default 280). */
  width?: number;
  /** Extra content between the message and the button (e.g. a map). */
  children?: ReactNode;
  /** A second button above the main one, e.g. "Delete" (red when destructive). */
  action?: { label: string; onPress: () => void; destructive?: boolean };
};

/** A rounded in-app message with the app's blue pill button (styled like "Mark My Lawn"). */
export function Dialog({ visible, title, message, onClose, buttonLabel = 'Okay', width = 280, children, action }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const s = Math.min(windowWidth, 480) / DESIGN_WIDTH;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: width * s, borderRadius: 26 * s, padding: 20 * s, gap: 8 * s }]}>
          <Text style={[styles.title, { fontSize: 18 * s }]}>{title}</Text>
          {!!message && <Text style={[styles.message, { fontSize: 14 * s, lineHeight: 20 * s }]}>{message}</Text>}
          {children}
          {action && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.button,
                action.destructive && styles.destructive,
                { height: 44 * s, borderRadius: 22 * s, marginTop: 10 * s, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.buttonLabel, { fontSize: 16 * s }]}>{action.label}</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={buttonLabel}
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              action && styles.secondary,
              { height: 44 * s, borderRadius: 22 * s, marginTop: (action ? 2 : 10) * s, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.buttonLabel, action && styles.secondaryLabel, { fontSize: 16 * s }]}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

/** Design-pt scale used by Dialog, for sizing content placed inside one. */
export function useDialogScale() {
  const { width } = useWindowDimensions();
  return Math.min(width, 480) / DESIGN_WIDTH;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  card: { backgroundColor: '#fff' },
  title: { fontFamily: 'GoogleSansFlex_500Medium', color: '#111', textAlign: 'center' },
  message: { fontFamily: 'GoogleSansFlex_400Regular', color: '#555', textAlign: 'center' },
  // Same blue, outline and shape as the Figma "Mark My Lawn" button.
  button: { backgroundColor: '#0086FF', borderWidth: 1.5, borderColor: '#6DC8FD', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
  destructive: { backgroundColor: '#EF4444', borderColor: '#F8A5A5' },
  // Next to another button, the main one steps back to a plain grey "Cancel".
  secondary: { backgroundColor: '#F2F2F2', borderColor: '#E2E2E2' },
  secondaryLabel: { color: '#222' },
});
