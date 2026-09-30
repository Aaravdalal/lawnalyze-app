import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Platform, StyleSheet, TextInput, type TextInputProps } from 'react-native';

import type { AddressQuery } from '@/lib/geocode';

import { GREEN, Layer, useFrame, useRect } from './Artboard';
import { ui, type UiAsset } from './assets';

const { common } = ui;

/** The input boxes' corner radius in the Figma exports (design pts). */
const BOX_RADIUS = 11.5;
/** The fill-in glow (ms): it comes up, stays a moment, then fades; each box a beat after the last. */
const GLOW = { rise: 380, hold: 650, fade: 1100, stagger: 90 };
const useNativeDriver = Platform.OS !== 'web';

type Props = {
  value: AddressQuery;
  onChange?: (value: AddressQuery) => void;
  onSubmit?: () => void;
  /** Extra design-pt shift for the Address row and the City/State row (Figma spacing = 0). */
  shift?: { address: number; cityState: number };
  /**
   * Goes up each time the boxes are filled in for the user (their location was found): the
   * boxes light up green inside as the text appears.
   */
  glow?: number;
};

/** The Address / City / State boxes from the Figma forms, with live text inputs on top. */
export function AddressFields({ value, onChange, onSubmit, shift = { address: 0, cityState: 0 }, glow = 0 }: Props) {
  const a = shift.address;
  const c = shift.cityState;
  const city = useRef<TextInput>(null);
  const state = useRef<TextInput>(null);
  const editable = !!onChange;

  return (
    <>
      <Layer asset={common.labelAddress} x={44} y={75 + a} />
      <Layer asset={common.inputAddress} x={32} y={92 + a} />
      <Layer asset={common.labelCity} x={41} y={148 + c} />
      <Layer asset={common.labelState} x={224} y={149 + c} />
      <Layer asset={common.inputCity} x={32} y={169 + c} />
      <Layer asset={common.inputState} x={219} y={169 + c} />

      <Field
        box={common.inputAddress}
        x={32}
        y={92 + a}
        glow={glow}
        glowDelay={0}
        value={value.address}
        onChangeText={editable ? (address) => onChange({ ...value, address }) : undefined}
        accessibilityLabel="Address"
        autoComplete="street-address"
        textContentType="streetAddressLine1"
        returnKeyType="next"
        onSubmitEditing={() => city.current?.focus()}
      />
      <Field
        inputRef={city}
        box={common.inputCity}
        x={32}
        y={169 + c}
        glow={glow}
        glowDelay={GLOW.stagger}
        value={value.city}
        onChangeText={editable ? (text) => onChange({ ...value, city: text }) : undefined}
        accessibilityLabel="City"
        autoComplete="postal-address-locality"
        textContentType="addressCity"
        returnKeyType="next"
        onSubmitEditing={() => state.current?.focus()}
      />
      <Field
        inputRef={state}
        box={common.inputState}
        x={219}
        y={169 + c}
        glow={glow}
        glowDelay={2 * GLOW.stagger}
        value={value.state}
        onChangeText={editable ? (text) => onChange({ ...value, state: text }) : undefined}
        accessibilityLabel="State"
        autoComplete="postal-address-region"
        textContentType="addressState"
        autoCapitalize="characters"
        maxLength={2}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
      />
    </>
  );
}

type FieldProps = TextInputProps & {
  box: UiAsset;
  x: number;
  y: number;
  inputRef?: RefObject<TextInput | null>;
  glow: number;
  glowDelay: number;
};

function Field({ box, x, y, inputRef, onChangeText, glow, glowDelay, ...inputProps }: FieldProps) {
  const rect = useRect({ x, y }, box.w, box.h);
  const { scale } = useFrame();

  // The glow's progress: 0 → 1 as it comes up, 1 → 2 as it fades (2: gone, where it starts).
  const [light] = useState(() => new Animated.Value(2));
  useEffect(() => {
    if (!glow) return;
    light.setValue(0);
    const play = Animated.sequence([
      Animated.delay(glowDelay),
      Animated.timing(light, { toValue: 1, duration: GLOW.rise, easing: Easing.out(Easing.cubic), useNativeDriver }),
      Animated.delay(GLOW.hold),
      Animated.timing(light, { toValue: 2, duration: GLOW.fade, easing: Easing.inOut(Easing.quad), useNativeDriver }),
    ]);
    play.start();
    return () => play.stop();
  }, [glow, glowDelay, light]);

  const glowBox = [rect, { borderRadius: BOX_RADIUS * scale }];
  return (
    <>
      {/* Green light along the inside of the box's edges: a bright rim first, then a deeper
          glow welling up inside it. */}
      <Animated.View
        pointerEvents="none"
        style={[
          glowBox,
          {
            boxShadow: `inset 0 0 0 ${1.4 * scale}px ${GREEN}, inset 0 0 ${6 * scale}px ${1.5 * scale}px rgba(76, 222, 128, 0.7)`,
            opacity: light.interpolate({ inputRange: [0, 0.35, 1, 2], outputRange: [0, 1, 1, 0] }),
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          glowBox,
          {
            boxShadow: `inset 0 0 ${18 * scale}px ${6 * scale}px rgba(158, 249, 180, 0.9)`,
            opacity: light.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
          },
        ]}
      />
      <TextInput
        ref={inputRef}
        {...inputProps}
        editable={!!onChangeText}
        onChangeText={onChangeText}
        autoCorrect={false}
        maxFontSizeMultiplier={1.2}
        style={[rect, styles.input, { fontSize: 15 * scale, paddingHorizontal: 11 * scale }]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#000',
    paddingVertical: 0,
    backgroundColor: 'transparent',
    outlineWidth: 0,
  },
});
