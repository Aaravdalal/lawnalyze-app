import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFrame, useRect, type Anchor } from './Artboard';

type Props = {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor?: Anchor;
  /** Font size in design points (scaled with the frame). */
  size: number;
  align?: 'left' | 'center';
  weight?: 'regular' | 'medium';
  children: ReactNode;
};

/** Live text (in the Figma font) placed in a design-space box, vertically centered. */
export function DesignText({ x, y, w, h, anchor, size, align = 'left', weight = 'regular', children }: Props) {
  const rect = useRect({ x, y, anchor }, w, h);
  const { scale } = useFrame();
  return (
    <View pointerEvents="none" style={[rect, styles.box, { alignItems: align === 'center' ? 'center' : 'flex-start' }]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
        style={[styles.text, weight === 'medium' && styles.medium, { fontSize: size * scale }]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
  text: { fontFamily: 'GoogleSansFlex_400Regular', color: '#000' },
  medium: { fontFamily: 'GoogleSansFlex_500Medium' },
});
