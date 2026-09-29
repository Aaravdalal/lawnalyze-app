import { useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';

import { useFrame } from './Artboard';
import type { UiAsset } from './assets';
import { fitFontSize } from './DesignText';

export type SwapBox = {
  /** Accessibility name, e.g. "Water cost per week". */
  label: string;
  /** The number shown in the box; null while it loads (the box stays empty). */
  value: string | null;
  /** Figma text size and where the number sits in the box (design pts from its top-left). */
  size: number;
  valueX: number;
  valueY: number;
  valueH: number;
  /** The "per week" / "per year" label under the number. */
  caption: UiAsset;
  captionX: number;
  captionY: number;
};

type Props = {
  x: number;
  y: number;
  h: number;
  /** Figma widths of the two boxes (one wide, one narrow) and the space between them. */
  widths: [number, number];
  gap: number;
  boxes: [SwapBox, SwapBox];
};

const BORDER = '#CCCDCE';
const RADIUS = 23; // the Figma boxes' corner radius
const TEXT_MARGIN = 10; // room kept between the number and the box's right edge
const BORDER_W = 1; // children are placed inside the border, Figma offsets include it

/**
 * Two boxes side by side, one wide and one narrow (like the Figma exports). Tapping the
 * narrow one swaps their sizes, so the number you tapped gets the big box.
 */
export function SwapRow({ x, y, h, widths, gap, boxes }: Props) {
  const { scale: s, left, top } = useFrame();
  const [progress] = useState(() => new Animated.Value(0));
  const [swapped, setSwapped] = useState(false);

  // Box widths at rest (swapped = 1) and in between.
  const width = [
    progress.interpolate({ inputRange: [0, 1], outputRange: [widths[0] * s, widths[1] * s] }),
    progress.interpolate({ inputRange: [0, 1], outputRange: [widths[1] * s, widths[0] * s] }),
  ];
  const lefts = [left(x), Animated.add(left(x) + gap * s, width[0])];

  function grow(i: number) {
    // Only the narrow box reacts: it takes the wide spot, the other one shrinks.
    const current = swapped ? widths[1 - i] : widths[i];
    if (current >= Math.max(...widths)) return;
    const next = !swapped;
    setSwapped(next);
    // A spring that overshoots a little, so the boxes bounce into their new sizes.
    Animated.spring(progress, {
      toValue: next ? 1 : 0,
      stiffness: 260,
      damping: 19,
      mass: 1,
      useNativeDriver: false, // animates layout (left/width/fontSize)
    }).start();
  }

  return (
    <>
      {boxes.map((box, i) => {
        const [from, to] = i === 0 ? widths : [widths[1], widths[0]];
        const fit = (w: number) => (box.value ? fitFontSize(box.value, box.size, w - box.valueX - TEXT_MARGIN) : box.size);
        return (
          <Animated.View
            key={box.label}
            style={[
              styles.box,
              {
                left: lefts[i],
                top: top(y),
                width: width[i],
                height: h * s,
                borderRadius: RADIUS * s,
                borderWidth: s,
              },
            ]}
          >
            {box.value !== null && (
              <>
                <View
                  style={[
                    styles.valueRow,
                    { left: (box.valueX - BORDER_W) * s, top: (box.valueY - BORDER_W) * s, height: box.valueH * s },
                  ]}
                >
                  <Animated.Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    style={[
                      styles.value,
                      {
                        fontSize: progress.interpolate({
                          inputRange: [0, 1],
                          outputRange: [fit(from) * s, fit(to) * s],
                        }),
                      },
                    ]}
                  >
                    {box.value}
                  </Animated.Text>
                </View>
                <Image
                  source={box.caption.source}
                  resizeMode="stretch"
                  style={{
                    position: 'absolute',
                    left: (box.captionX - BORDER_W) * s,
                    top: (box.captionY - BORDER_W) * s,
                    width: box.caption.w * s,
                    height: box.caption.h * s,
                  }}
                />
              </>
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={box.label}
              accessibilityHint="Makes this box the big one"
              onPress={() => grow(i)}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', backgroundColor: '#fff', borderColor: BORDER, overflow: 'hidden' },
  valueRow: { position: 'absolute', right: 0, justifyContent: 'center' },
  value: { fontFamily: 'GoogleSansFlex_400Regular', color: '#000' },
});
