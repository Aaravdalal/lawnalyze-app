import { useRef, type RefObject } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import type { AddressQuery } from '@/lib/geocode';

import { Layer, useFrame, useRect } from './Artboard';
import { ui, type UiAsset } from './assets';

const { common } = ui;

type Props = {
  value: AddressQuery;
  onChange?: (value: AddressQuery) => void;
  onSubmit?: () => void;
  /** Extra design-pt shift for the Address row and the City/State row (Figma spacing = 0). */
  shift?: { address: number; cityState: number };
};

/** The Address / City / State boxes from the Figma forms, with live text inputs on top. */
export function AddressFields({ value, onChange, onSubmit, shift = { address: 0, cityState: 0 } }: Props) {
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
};

function Field({ box, x, y, inputRef, onChangeText, ...inputProps }: FieldProps) {
  const rect = useRect({ x, y }, box.w, box.h);
  const { scale } = useFrame();

  return (
    <TextInput
      ref={inputRef}
      {...inputProps}
      editable={!!onChangeText}
      onChangeText={onChangeText}
      autoCorrect={false}
      maxFontSizeMultiplier={1.2}
      style={[rect, styles.input, { fontSize: 15 * scale, paddingHorizontal: 11 * scale }]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: 'GoogleSansFlex_400Regular',
    color: '#000',
    paddingVertical: 0,
    backgroundColor: 'transparent',
    outlineWidth: 0,
    borderRadius: 12,
  },
});
