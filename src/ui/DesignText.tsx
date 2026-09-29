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
  color?: string;
  /** Shrink by the width estimate below (default); off for short labels known to fit, since the
   * estimate runs wide. Either way the text still never clips (adjustsFontSizeToFit). */
  fit?: boolean;
  children: ReactNode;
};

// Approximate Google Sans Flex advance widths (in ems), to shrink long values to fit their box.
export function textWidthEm(text: string): number {
  let em = 0;
  for (const ch of text) {
    if (/[0-9$]/.test(ch)) em += 0.57;
    else if (/[.,:;' ]/.test(ch)) em += 0.26;
    else if (ch === '%') em += 0.86;
    else if (/[il|]/.test(ch)) em += 0.23;
    else if (/[mwMW]/.test(ch)) em += 0.8;
    else if (/[A-Z]/.test(ch)) em += 0.64;
    else em += 0.52;
  }
  return em;
}

/** Largest font size (up to `size`) at which one line of `text` fits in `width`. */
export const fitFontSize = (text: string, size: number, width: number) =>
  Math.min(size, (width * 0.98) / Math.max(0.1, textWidthEm(text)));

/** Live text (in the Figma font) placed in a design-space box, vertically centered. Plain
 * string content shrinks as needed to fit the box's width (so large numbers never clip). */
export function DesignText({ x, y, w, h, anchor, size, align = 'left', weight = 'regular', color, fit = true, children }: Props) {
  const rect = useRect({ x, y, anchor }, w, h);
  const { scale } = useFrame();
  const text = Array.isArray(children) ? children.join('') : typeof children === 'string' || typeof children === 'number' ? String(children) : null;
  const fontSize = text && fit ? fitFontSize(text, size, w) : size;
  // Room above and below the box, centered on it: Android shrinks text (adjustsFontSizeToFit)
  // that's taller than its box, and a tight Figma box plus the font's line height is just over,
  // so live text came out smaller than the Figma text beside it. Only the width should shrink it.
  const room = fontSize * scale;
  return (
    <View
      pointerEvents="none"
      style={[
        rect,
        styles.box,
        { top: rect.top - room, height: rect.height + 2 * room, alignItems: align === 'center' ? 'center' : 'flex-start' },
      ]}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={1.2}
        style={[styles.text, weight === 'medium' && styles.medium, { fontSize: fontSize * scale }, color ? { color } : null]}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { justifyContent: 'center' },
  text: { fontFamily: 'GoogleSansFlex_400Regular', color: '#000', includeFontPadding: false },
  medium: { fontFamily: 'GoogleSansFlex_500Medium' },
});
