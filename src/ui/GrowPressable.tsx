import { useState } from 'react';
import { Animated, Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/** A pressed button grows by this much around its center... */
const PRESSED_SCALE = 1.06;
/** ...springing out, and back with a little bounce when let go. */
const SPRING = { stiffness: 420, damping: 18, mass: 1 };
const useNativeDriver = Platform.OS !== 'web';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style'> & { style?: StyleProp<ViewStyle> };

/** A button that slightly enlarges while it's pressed. */
export function GrowPressable({ style, onPressIn, onPressOut, ...props }: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const springTo = (toValue: number) => Animated.spring(scale, { toValue, ...SPRING, useNativeDriver }).start();
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        springTo(PRESSED_SCALE);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale }] }]}
    />
  );
}
