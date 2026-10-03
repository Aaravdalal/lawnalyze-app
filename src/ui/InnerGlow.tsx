import { useEffect, useMemo } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { GREEN } from './Artboard';

// Green light that glows in from a shape's edges: a bright rim, and past it soft tongues of light
// reaching in different depths and drifting about. The address boxes glow like this, and so do the
// rebate boxes (the same glow, stretched to their size).

/**
 * A glow's timing (ms): it comes up, stays at least a moment (so even a quick lookup shows all
 * of it), then fades. Boxes lighting up together go one after another.
 */
export const GLOW = { rise: 380, hold: 650, fade: 1100, stagger: 90 };
/**
 * Past a shallow even glow along the edges, the light comes in as soft overlapping tongues,
 * each reaching in a random depth (a share of the deepest, which is most of the way across).
 * While the glow is up, each keeps drifting to a new depth, taking DRIFT_MS to get there.
 */
const REACH = { min: 0.25, max: 1 };
const DRIFT_MS = { min: 600, max: 1500 };
/**
 * A box being typed in surges up as above, then settles: the tongues only stir a little, slowly
 * (CALM), until a key is pressed. Each key livens them up (LIVELY: quick, deep, wide swings) for
 * STIR_MS, so they keep moving a lot while typing goes on, and settle again once it stops.
 */
const CALM = { reach: { min: 0.3, max: 0.45 }, sway: 0.2, ms: { min: 1600, max: 2600 } };
const LIVELY = { ms: { min: 280, max: 650 } };
const STIR_MS = 700;
/** Tongues along an edge are this many of their depths apart. */
const TONGUE_SPACING = 0.9;
/** The glow is all GREEN (#9EF9B4): the tongues are drawn in it, and the rim's softest light is it, a little see-through. */
const TONGUE_IMAGE = require('../../assets/ui/common/glow-tongue.png');
const GREEN_SOFT = 'rgba(158, 249, 180, 0.8)';
const useNativeDriver = Platform.OS !== 'web';

export type Slot = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** The tongue reaches in from the top or bottom edge (y), or from a side (x). */
  across: 'x' | 'y';
  /** How far (dp) it sways along its edge. */
  sway: number;
};

/**
 * Where a w x h box's tongues sit (dp): overlapping along the top and bottom edges, reaching most
 * of the way across, and one at each end.
 */
export function boxSlots(w: number, h: number): Slot[] {
  const n = Math.max(2, Math.round(w / (h * TONGUE_SPACING)));
  const step = w / n;
  // The image fades out well before its rim, so a full-size tongue reaches about 70% across.
  const deepest = h * 0.95;
  const slots: Slot[] = [];
  for (const edge of [0, h]) {
    for (let k = 0; k < n; k++) {
      slots.push({ left: step * (k - 0.8), top: edge - deepest, width: step * 2.6, height: deepest * 2, across: 'y', sway: step * 0.3 });
    }
  }
  const side = h * 1.1;
  for (const edge of [0, w]) {
    slots.push({ left: edge - side, top: -h * 0.3, width: side * 2, height: h * 1.6, across: 'x', sway: h * 0.15 });
  }
  return slots;
}

/**
 * A w x h box's tongues laid out as on a `model` box (e.g. an address box) and stretched to fit,
 * so the box glows just like the model, only at its own size; `reach` < 1 keeps the light that
 * much closer to the edges.
 */
export function boxSlotsLike(model: { w: number; h: number }, w: number, h: number, reach = 1): Slot[] {
  const sx = w / model.w;
  const sy = h / model.h;
  return boxSlots(model.w, model.h).map((slot) => {
    // Each tongue is centered on its edge: shortened, it stays on it.
    const width = slot.width * sx * (slot.across === 'x' ? reach : 1);
    const height = slot.height * sy * (slot.across === 'y' ? reach : 1);
    return {
      left: (slot.left + slot.width / 2) * sx - width / 2,
      top: (slot.top + slot.height / 2) * sy - height / 2,
      width,
      height,
      across: slot.across,
      // Along its edge: across the box for a top or bottom tongue, up and down for one at an end.
      sway: slot.sway * (slot.across === 'y' ? sx : sy),
    };
  });
}

type Tongue = { reach: Animated.Value; sway: Animated.Value };

const between = (min: number, max: number) => min + Math.random() * (max - min);
/** A random depth, shallow more often than deep. */
const randomReach = () => REACH.min + (REACH.max - REACH.min) * Math.random() ** 1.4;
const EASE_OUT = Easing.out(Easing.cubic);
const SWAY = Easing.inOut(Easing.sin);

/**
 * One glow: up while something holds it (e.g. a box is typed in, or an address is looked up),
 * and for a moment after a flash (e.g. the boxes were filled in).
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
  // Held by a box being typed in: the tongues settle down between keys (see CALM).
  let calm = false;
  let stirredUntil = 0;
  // Changes each time the glow comes up or starts to go, which ends the drifting from before.
  let run = 0;
  let flashDone: ReturnType<typeof setTimeout> | undefined;
  let fadeLater: ReturnType<typeof setTimeout> | undefined;

  const animate = (value: Animated.Value, toValue: number, duration: number, easing: (t: number) => number, delay = 0) =>
    Animated.timing(value, { toValue, duration, easing, delay, useNativeDriver });
  const stirred = () => Date.now() < stirredUntil;

  function drift(t: Tongue, id: number) {
    let duration: number, reach: number, sway: number;
    if (!calm) {
      duration = between(DRIFT_MS.min, DRIFT_MS.max);
      reach = randomReach();
      sway = between(-1, 1);
    } else if (stirred()) {
      duration = between(LIVELY.ms.min, LIVELY.ms.max);
      reach = between(REACH.min, REACH.max);
      sway = between(-1, 1);
    } else {
      duration = between(CALM.ms.min, CALM.ms.max);
      reach = between(CALM.reach.min, CALM.reach.max);
      sway = between(-CALM.sway, CALM.sway);
    }
    animate(t.sway, sway, duration, SWAY).start();
    animate(t.reach, reach, duration, SWAY).start(({ finished }) => {
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
    hold(on: boolean, delay: number, settle = false) {
      held = on;
      calm = on && settle;
      if (on) comeUp(delay);
      else if (!flashing) goDown();
    },
    /** Brings the glow up for a moment, after `delay` ms. */
    flash(delay = 0) {
      flashing = true;
      comeUp(delay);
      clearTimeout(flashDone);
      flashDone = setTimeout(() => {
        flashing = false;
        if (!held) goDown();
      }, delay + GLOW.rise + GLOW.hold);
    },
    /** A key was pressed: livens the tongues up for a moment (see STIR_MS). */
    stir() {
      const was = stirred();
      stirredUntil = Date.now() + STIR_MS;
      // Already lively, or still surging up: the drifting picks it up as it goes.
      if (was || !up || !calm || Date.now() < upAt + GLOW.rise) return;
      const id = ++run;
      for (const t of tongues) drift(t, id);
    },
    stop() {
      clearTimeout(flashDone);
      clearTimeout(fadeLater);
      run++;
      held = flashing = up = calm = false;
      stirredUntil = 0;
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

export type InnerGlowEngine = ReturnType<typeof createGlow>;

/** A glow for these tongue slots (a new one when their number changes), stopped when it goes. */
export function useInnerGlow(slots: Slot[]): InnerGlowEngine {
  const glow = useMemo(() => createGlow(slots.length), [slots.length]);
  useEffect(() => () => glow.stop(), [glow]);
  return glow;
}

/** The bright rim (dp): a crisp line, then softer light just inside it, and softer still further in. */
export type Rim = { line: number; near: { blur: number; spread: number }; far: { blur: number; spread: number } };

/** The rim of the address boxes (and of boxes glowing like them), at design scale `s`. */
export const boxRim = (s: number): Rim => ({ line: 1.4 * s, near: { blur: 6 * s, spread: 1.5 * s }, far: { blur: 12 * s, spread: 3 * s } });

type Rect = { position: 'absolute'; left: number; top: number; width: number; height: number };

/** Draws a glow over the shape at `rect` (its corners rounded by `radius`); touches pass through. */
export function InnerGlow({ rect, radius, slots, glow, rim }: { rect: Rect; radius: number; slots: Slot[]; glow: InnerGlowEngine; rim: Rim }) {
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
              `inset 0 0 0 ${rim.line}px ${GREEN}, inset 0 0 ${rim.near.blur}px ${rim.near.spread}px ${GREEN}, ` +
              `inset 0 0 ${rim.far.blur}px ${rim.far.spread}px ${GREEN_SOFT}`,
            opacity: looks.rimOpacity,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
