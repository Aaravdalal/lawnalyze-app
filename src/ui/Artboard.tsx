import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ui, type UiAsset } from './assets';
import { GrowPressable } from './GrowPressable';
import { LoadsLater, useLoadHold } from './Reveal';

// Every screen is laid out on the 340 x 640 Figma frame and scaled to fit the device.
export const DESIGN_WIDTH = 340;
export const DESIGN_HEIGHT = 640;
export const GREEN = '#9EF9B4';
/** Intro screen tweaks: its Get Started button is a bit larger than in Figma... */
export const BUTTON_GROW = 1.15;
/** ...and its card/footer sit lower for a shorter green chin (design pts). */
// 568 + TAB_CHIN_DROP === 548 + FOOTER_DROP: onboarding and tab screens put the card edge in the
// same place, so the green chin stays still when onboarding fades into the tabs.
const FOOTER_DROP = 44;
/** Tab screens: a smaller drop, since the nav bar and its dot need room in the chin. */
export const TAB_CHIN_DROP = 24;

/**
 * `footer` layers (the card's rounded bottom, buttons, nav bar) keep their distance from the
 * bottom of the screen. `top` layers are the card's content; on phones taller than the
 * design, the extra height is split above and below them. `chin` layers are centered
 * vertically in the green area below the card, then moved down by their y.
 */
export type Anchor = 'top' | 'footer' | 'chin';

type Frame = {
  scale: number;
  left: (x: number) => number;
  top: (y: number, anchor?: Anchor) => number;
  width: number;
  height: number;
  /** Screen y of the middle of the green area below the card. */
  chinCenter: number;
};

const FrameContext = createContext<Frame | null>(null);

export function useFrame(): Frame {
  const frame = useContext(FrameContext);
  if (!frame) throw new Error('useFrame must be used inside <Artboard>');
  return frame;
}

/** `compactChin`: true for the standard shorter chin, or a number for a custom drop (design pts). */
export function useFrameMetrics(compactChin: boolean | number): Omit<Frame, 'chinCenter'> {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return useMemo(() => {
    // Compact chin: let the design's ~23pt margin under the button overlap the gesture-bar
    // inset instead of stacking on top of it, and drop the footer a little.
    const bottomPad = compactChin ? Math.max(0, insets.bottom - 20) : insets.bottom;
    const drop = typeof compactChin === 'number' ? compactChin : compactChin ? FOOTER_DROP : 0;
    const available = height - insets.top - bottomPad;
    const scale = Math.min(width / DESIGN_WIDTH, available / DESIGN_HEIGHT);
    const offsetX = (width - DESIGN_WIDTH * scale) / 2;
    const extra = available - DESIGN_HEIGHT * scale;
    return {
      scale,
      width,
      height,
      left: (x) => offsetX + x * scale,
      top: (y, anchor = 'top') =>
        insets.top + (anchor === 'top' ? extra / 2 : extra + drop * scale) + y * scale,
    };
  }, [width, height, insets.top, insets.bottom, compactChin]);
}

export type Glow = { asset: UiAsset; x: number; y: number };

type ArtboardProps = {
  /** Design y where the white card's rounded bottom edge ends. */
  cardBottom: number;
  glows?: Glow[];
  /** Design y of the green-to-white gradient used on the intro screens. */
  gradientY?: number;
  /** Shorter green area under the card (used on the intro screen). */
  compactChin?: boolean | number;
  /**
   * Out of sight while another screen appears (like the tabs besides Home): it's built once that
   * screen has shown, and its pictures load in their own time, not holding it up (see Reveal).
   */
  loadsLater?: boolean;
  children: ReactNode;
};

export function Artboard({ cardBottom, glows = [], gradientY, compactChin = false, loadsLater = false, children }: ArtboardProps) {
  const metrics = useFrameMetrics(compactChin);
  const { height } = metrics;
  // On Android the window height can exclude the gesture bar, so measure what's really drawn.
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null);
  const bottom = drawnHeight ?? height;
  const frame: Frame = { ...metrics, chinCenter: (metrics.top(cardBottom, 'footer') + bottom) / 2 };

  const content = (
    // See-through: the white page and green chin are drawn once behind every screen (SharedChin).
    <View style={styles.root} onLayout={(e) => setDrawnHeight(e.nativeEvent.layout.height)}>
      {gradientY !== undefined && <Gradient y={gradientY} />}
      {glows.map((glow, i) => (
        <Layer key={i} asset={glow.asset} x={glow.x} y={glow.y} />
      ))}
      {children}
    </View>
  );
  return <FrameContext.Provider value={frame}>{loadsLater ? <LoadsLater>{content}</LoadsLater> : content}</FrameContext.Provider>;
}

/**
 * The green-to-white gradient at the top of the intro screens, ending at design y + its height.
 * Stretched up to the top of the screen so it also fills the status bar area.
 */
export function Gradient({ y }: { y: number }) {
  const frame = useFrame();
  const loaded = useLoadHold();
  return (
    <Image
      source={ui.common.gradient.source}
      resizeMode="stretch"
      onLoad={loaded}
      onError={loaded}
      style={[styles.abs, { left: 0, top: 0, width: frame.width, height: frame.top(y + ui.common.gradient.h) }]}
    />
  );
}

type Rect = { x: number; y: number; anchor?: Anchor };

type Placement = { position: 'absolute'; left: number; top: number; width: number; height: number };

/** Positions a design-space rectangle on the scaled frame. */
export function useRect({ x, y, anchor }: Rect, w: number, h: number): Placement {
  const frame = useFrame();
  return {
    position: 'absolute',
    left: frame.left(x),
    top: anchor === 'chin' ? frame.chinCenter + (y - h / 2) * frame.scale : frame.top(y, anchor),
    width: w * frame.scale,
    height: h * frame.scale,
  };
}

type LayerProps = Rect & {
  asset: UiAsset;
  /** Mirror top-to-bottom (e.g. a row export whose rounder corners belong at the bottom). */
  flip?: boolean;
  /** Paint the whole layer this color, keeping its shape. */
  tint?: string;
};

/**
 * A Figma layer placed at its design position. Layers are pictures only: touches pass
 * through them to any button underneath (e.g. a row's text label drawn over the row).
 */
export function Layer({ asset, x, y, anchor, flip, tint }: LayerProps) {
  const rect = useRect({ x, y, anchor }, asset.w, asset.h);
  // Inside a Reveal, the screen waits for it (so it all shows at once).
  const loaded = useLoadHold();
  return (
    <View style={[rect, styles.noTouch, flip && styles.flip]}>
      <Image
        source={asset.source}
        resizeMode="stretch"
        tintColor={tint}
        onLoad={loaded}
        onError={loaded}
        style={{ width: rect.width, height: rect.height }}
      />
    </View>
  );
}

type PressableLayerProps = LayerProps & {
  onPress?: () => void;
  onLongPress?: () => void;
  label: string;
  disabled?: boolean;
  /** Enlarges the layer around its center (1 = Figma size). */
  grow?: number;
  children?: ReactNode;
};

/** A Figma layer that acts as a button: it slightly enlarges while pressed. */
export function PressableLayer({
  asset,
  x,
  y,
  anchor,
  onPress,
  onLongPress,
  label,
  disabled,
  grow = 1,
  children,
}: PressableLayerProps) {
  const w = asset.w * grow;
  const h = asset.h * grow;
  // Grow around the center (chin layers are already centered on their y).
  const rect = useRect({ x: x - (w - asset.w) / 2, y: anchor === 'chin' ? y : y - (h - asset.h) / 2, anchor }, w, h);
  const loaded = useLoadHold();
  return (
    <GrowPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={rect}
    >
      {/* Explicit size: Android otherwise draws high-res exports at their pixel size. */}
      <Image
        source={asset.source}
        resizeMode="stretch"
        onLoad={loaded}
        onError={loaded}
        style={{ position: 'absolute', left: 0, top: 0, width: rect.width, height: rect.height }}
      />
      {children}
    </GrowPressable>
  );
}

type HotspotProps = Rect & {
  w: number;
  h: number;
  onPress: () => void;
  label: string;
  /** Tint the spot while it's pressed (for buttons with no pressed look of their own). */
  feedback?: boolean;
};

/** Invisible touch target over part of a layer (e.g. one label in the nav bar). */
export function Hotspot({ x, y, anchor, w, h, onPress, label, feedback = false }: HotspotProps) {
  const rect = useRect({ x, y, anchor }, w, h);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        rect,
        feedback && pressed && { backgroundColor: PRESSED_TINT, borderRadius: Math.min(rect.width, rect.height) / 2 },
      ]}
    />
  );
}

const PRESSED_TINT = 'rgba(47, 107, 255, 0.22)';

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  noTouch: { pointerEvents: 'none' },
  flip: { transform: [{ scaleY: -1 }] },
  abs: { position: 'absolute' },
});
