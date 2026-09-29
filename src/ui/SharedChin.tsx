import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { GREEN, useFrameMetrics } from './Artboard';
import { CARD_BOTTOM_H, chinPath } from './chin';

/** Onboarding screens' card edge (design pts); tab screens put theirs in the same place. */
const CARD_BOTTOM = 548;

/**
 * The white page and the green chin below the card, drawn once behind every screen (see
 * app/_layout.tsx). Screens are transparent, so moving between them (like finishing setup
 * and landing on Home) only fades their contents; the chin itself never moves or redraws.
 */
export function SharedChin() {
  const frame = useFrameMetrics(true);
  // On Android the window height can exclude the gesture bar, so measure what's really drawn.
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null);
  const bottom = drawnHeight ?? frame.height;
  const cardTop = frame.top(CARD_BOTTOM - CARD_BOTTOM_H, 'footer');
  const path = useMemo(
    () => chinPath(frame.width, 0, frame.scale, bottom - cardTop + 2),
    [frame.width, frame.scale, bottom, cardTop],
  );

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.page]}
      onLayout={(e) => setDrawnHeight(e.nativeEvent.layout.height)}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: cardTop, bottom: -2 }}>
        <Svg width={frame.width} height={bottom - cardTop + 2}>
          <Path d={path} fill={GREEN} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: '#fff' },
});
