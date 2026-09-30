import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, Platform, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import type { AddressQuery } from '@/lib/geocode';

import { GREEN, Layer, useFrame, useRect } from './Artboard';
import { ui, type UiAsset } from './assets';

const { common } = ui;

/** The input boxes' corner radius in the Figma exports (design pts). */
const BOX_RADIUS = 11.5;
/**
 * A box's green glow (ms): it comes up, stays at least a moment (so even a quick lookup shows all
 * of it), then fades. Boxes lighting up together go one after another.
 */
const GLOW = { rise: 380, hold: 650, fade: 1100, stagger: 90 };
/**
 * Past a shallow even glow along the edges, the light comes in as soft overlapping tongues,
 * each reaching in a random depth (a share of the deepest, which is most of the way across).
 * While the glow is up, each keeps drifting to a new depth, taking DRIFT_MS to get there.
 */
const REACH = { min: 0.25, max: 1 };
const DRIFT_MS = { min: 600, max: 1500 };
/** Tongues along the top and bottom edges are this many box-heights apart. */
const TONGUE_SPACING = 0.9;
/** The glow is all GREEN (#9EF9B4): the tongues are drawn in it, and the rim's softest light is it, a little see-through. */
const TONGUE_IMAGE = require('../../assets/ui/common/glow-tongue.png');
const GREEN_SOFT = 'rgba(158, 249, 180, 0.8)';
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

  const slots = useMemo(() => tongueSlots(rect.width, rect.height), [rect.width, rect.height]);
  const glow = useMemo(() => createGlow(slots.length), [slots.length]);
  useEffect(() => () => glow.stop(), [glow]);
  useEffect(() => {
    glow.hold(typing || searching, typing ? 0 : glowDelay);
  }, [glow, typing, searching, glowDelay]);
  useEffect(() => {
    if (fills) glow.flash(glowDelay);
  }, [glow, fills, glowDelay]);

  const looks = useMemo(
    () => ({
      tongues: slots.map((slot, i) => {
        const { reach, sway } = glow.tongues[i];
        // A deeper tongue is a little wider too.
        const wide = reach.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.1] });
        const along = Animated.multiply(sway, slot.sway);
        return {
          position: 'absolute' as const,
          left: slot.left,
          top: slot.top,
          width: slot.width,
          height: slot.height,
          transform:
            slot.across === 'y'
              ? [{ translateX: along }, { scaleX: wide }, { scaleY: reach }]
              : [{ translateY: along }, { scaleX: reach }, { scaleY: wide }],
        };
      }),
      tonguesOpacity: glow.level.interpolate({ inputRange: [0, 1], outputRange: [0, 0.75] }),
      // The bright rim comes up first and goes last.
      rimOpacity: glow.level.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] }),
    }),
    [slots, glow],
  );

  return (
    <>
      <View pointerEvents="none" style={[rect, styles.clip, { borderRadius: radius }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: looks.tonguesOpacity }]}>
          {looks.tongues.map((style, i) => (
            <Animated.Image key={i} source={TONGUE_IMAGE} resizeMode="stretch" style={style} />
          ))}
        </Animated.View>
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          rect,
          {
            borderRadius: radius,
            // All in the app's mint green (GREEN, #9EF9B4): a crisp line, then softer light inside it.
            boxShadow:
              `inset 0 0 0 ${1.4 * scale}px ${GREEN}, inset 0 0 ${6 * scale}px ${1.5 * scale}px ${GREEN}, ` +
              `inset 0 0 ${12 * scale}px ${3 * scale}px ${GREEN_SOFT}`,
            opacity: looks.rimOpacity,
          },
        ]}
      />
      <TextInput
        ref={inputRef}
        {...inputProps}
        editable={!!onChangeText}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        maxFontSizeMultiplier={1.2}
        style={[rect, styles.input, { fontSize: 15 * scale, paddingHorizontal: 11 * scale }]}
      />
    </>
  );
}

type Slot = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The tongue reaches in from the top or bottom edge (y), or from an end (x). */
  across: 'x' | 'y';
  /** How far (dp) it sways along its edge. */
  sway: number;
};

/** Where a w x h box's tongues sit (dp): overlapping along the top and bottom edges, one at each end. */
function tongueSlots(w: number, h: number): Slot[] {
  const n = Math.max(2, Math.round(w / (h * TONGUE_SPACING)));
  const step = w / n;
  // The image fades out well before its rim, so a full-size tongue reaches about 70% across.
  const deepest = h * 0.95;
  const slots: Slot[] = [];
  for (const edge of [0, h]) {
    for (let k = 0; k < n; k++) {
      slots.push({
        left: step * (k - 0.8),
        top: edge - deepest,
        width: step * 2.6,
        height: deepest * 2,
        across: 'y',
        sway: step * 0.3,
      });
    }
  }
  const side = h * 1.1;
  for (const edge of [0, w]) {
    slots.push({ left: edge - side, top: -h * 0.3, width: side * 2, height: h * 1.6, across: 'x', sway: h * 0.15 });
  }
  return slots;
}

type Tongue = { reach: Animated.Value; sway: Animated.Value };

const between = (min: number, max: number) => min + Math.random() * (max - min);
/** A random depth, shallow more often than deep. */
const randomReach = () => REACH.min + (REACH.max - REACH.min) * Math.random() ** 1.4;
const EASE_OUT = Easing.out(Easing.cubic);
const SWAY = Easing.inOut(Easing.sin);

/**
 * One box's glow: up while something holds it (the box is typed in, or an address is looked
 * up), and for a moment after a flash (the boxes were filled in).
 */
function createGlow(tongueCount: number) {
  const level = new Animated.Value(0);
  // Never scaled all the way to 0, which some platforms can't draw.
  const tongues: Tongue[] = Array.from({ length: tongueCount }, () => ({
    reach: new Animated.Value(0.05),
    sway: new Animated.Value(0),
  }));
  let held = false;
  let flashing = false;
  let up = false;
  let upAt = 0;
  // Changes each time the glow comes up or starts to go, which ends the drifting from before.
  let run = 0;
  let flashDone: ReturnType<typeof setTimeout> | undefined;
  let fadeLater: ReturnType<typeof setTimeout> | undefined;

  const animate = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
    Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver });

  function drift(t: Tongue, id: number) {
    const duration = between(DRIFT_MS.min, DRIFT_MS.max);
    animate(t.sway, between(-1, 1), duration, SWAY).start();
    animate(t.reach, randomReach(), duration, SWAY).start(({ finished }) => {
      if (finished && id === run) drift(t, id);
    });
  }

  function comeUp(delay: number) {
    clearTimeout(fadeLater);
    if (up) return;
    up = true;
    upAt = Date.now() + delay;
    const id = ++run;
    animate(level, 1, GLOW.rise, EASE_OUT, delay).start();
    for (const t of tongues) {
      const start = delay + between(0, 200);
      animate(t.sway, between(-1, 1), GLOW.rise + GLOW.hold, SWAY, start).start();
      animate(t.reach, randomReach(), between(GLOW.rise, GLOW.rise * 1.8), EASE_OUT, start).start(({ finished }) => {
        if (finished && id === run) drift(t, id);
      });
    }
  }

  function goDown() {
    clearTimeout(fadeLater);
    if (!up) return;
    fadeLater = setTimeout(
      () => {
        up = false;
        run++;
        animate(level, 0, GLOW.fade, Easing.inOut(Easing.quad)).start();
        // The light draws back into the edges as it fades.
        for (const t of tongues) animate(t.reach, between(0.05, 0.15), GLOW.fade * between(0.7, 1), Easing.in(Easing.quad)).start();
      },
      Math.max(0, upAt + GLOW.rise + GLOW.hold - Date.now()),
    );
  }

  return {
    level,
    tongues,
    /** Keeps the glow up (coming up after `delay` ms), or lets it go. */
    hold(on: boolean, delay: number) {
      held = on;
      if (on) comeUp(delay);
      else if (!flashing) goDown();
    },
    /** Brings the glow up for a moment, after `delay` ms. */
    flash(delay: number) {
      flashing = true;
      comeUp(delay);
      clearTimeout(flashDone);
      flashDone = setTimeout(() => {
        flashing = false;
        if (!held) goDown();
      }, delay + GLOW.rise + GLOW.hold);
    },
    stop() {
      clearTimeout(flashDone);
      clearTimeout(fadeLater);
      run++;
      held = flashing = up = false;
      level.stopAnimation();
      level.setValue(0);
      for (const t of tongues) {
        t.reach.stopAnimation();
        t.sway.stopAnimation();
        t.reach.setValue(0.05);
      }
    },
  };
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
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
