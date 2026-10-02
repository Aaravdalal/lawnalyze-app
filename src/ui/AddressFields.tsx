import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import type { AddressQuery } from '@/lib/geocode';

import { Layer, useFrame, useRect } from './Artboard';
import { ui, type UiAsset } from './assets';
import { GLOW, InnerGlow, boxRim, boxSlots, useInnerGlow } from './InnerGlow';

const { common } = ui;

/** The input boxes' corner radius in the Figma exports (design pts). */
const BOX_RADIUS = 11.5;

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
  /** An address is being looked up: the boxes glow until it's done. */
  searching?: boolean;
};

/**
 * The Address / City / State boxes from the Figma forms, with live text inputs on top. A box
 * glows green inside while it's typed in.
 */
export function AddressFields({
  value,
  onChange,
  onSubmit,
  shift = { address: 0, cityState: 0 },
  glow = 0,
  searching = false,
}: Props) {
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
        searching={searching}
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
        searching={searching}
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
        searching={searching}
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
  searching: boolean;
};

function Field({ box, x, y, inputRef, onChangeText, glow: fills, glowDelay, searching, ...inputProps }: FieldProps) {
  const rect = useRect({ x, y }, box.w, box.h);
  const { scale } = useFrame();
  const radius = BOX_RADIUS * scale;
  const [focused, setFocused] = useState(false);
  const typing = focused && !!onChangeText;

  const slots = useMemo(() => boxSlots(rect.width, rect.height), [rect.width, rect.height]);
  const glow = useInnerGlow(slots);
  useEffect(() => {
    glow.hold(typing || searching, typing ? 0 : glowDelay, typing && !searching);
  }, [glow, typing, searching, glowDelay]);
  useEffect(() => {
    if (fills) glow.flash(glowDelay);
  }, [glow, fills, glowDelay]);

  return (
    <>
      <InnerGlow rect={rect} radius={radius} slots={slots} glow={glow} rim={boxRim(scale)} />
      <TextInput
        ref={inputRef}
        {...inputProps}
        editable={!!onChangeText}
        onChangeText={
          onChangeText &&
          ((text) => {
            glow.stir();
            onChangeText(text);
          })
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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
    // No focus ring in browsers (their default ring ignores a zero width); the glow shows focus.
    outlineStyle: 'solid',
    outlineWidth: 0,
  },
});
