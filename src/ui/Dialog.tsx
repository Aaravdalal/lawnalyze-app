import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { DESIGN_WIDTH } from './Artboard';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onClose: () => void;
  buttonLabel?: string;
};

/** A rounded in-app message with the app's blue pill button (styled like "Mark My Lawn"). */
export function Dialog({ visible, title, message, onClose, buttonLabel = 'Okay' }: Props) {
  const { width } = useWindowDimensions();
  const s = Math.min(width, 480) / DESIGN_WIDTH;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: 280 * s, borderRadius: 26 * s, padding: 20 * s, gap: 8 * s }]}>
          <Text style={[styles.title, { fontSize: 18 * s }]}>{title}</Text>
          <Text style={[styles.message, { fontSize: 14 * s, lineHeight: 20 * s }]}>{message}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.button,
              { height: 44 * s, borderRadius: 22 * s, marginTop: 10 * s, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Text style={[styles.buttonLabel, { fontSize: 16 * s }]}>{buttonLabel}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  card: { backgroundColor: '#fff' },
  title: { fontFamily: 'GoogleSansFlex_500Medium', color: '#111', textAlign: 'center' },
  message: { fontFamily: 'GoogleSansFlex_400Regular', color: '#555', textAlign: 'center' },
  // Same blue, outline and shape as the Figma "Mark My Lawn" button.
  button: { backgroundColor: '#0086FF', borderWidth: 1.5, borderColor: '#6DC8FD', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
});
