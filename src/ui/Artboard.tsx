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
  /**
   * Green footer layer that sits behind the card's rounded corners. Tab screens leave it
   * out: the tab bar draws one shared chin for all of them (see TabNav), so it stays put
   * when switching tabs.
   */
  footer?: UiAsset;
  glows: Glow[];
  /** Design y of the green-to-white gradient used on the intro screens. */
  gradientY?: number;
  /** Shorter green area under the card (used on the intro screen). */
  compactChin?: boolean | number;
  children: ReactNode;
};

export function Artboard({ cardBottom, footer, glows, gradientY, compactChin = false, children }: ArtboardProps) {
  const metrics = useFrameMetrics(compactChin);
  const { scale, width, height } = metrics;
  // On Android the window height can exclude the gesture bar, so measure what's really drawn.
  const [drawnHeight, setDrawnHeight] = useState<number | null>(null);
  const bottom = drawnHeight ?? height;
  const frame: Frame = { ...metrics, chinCenter: (metrics.top(cardBottom, 'footer') + bottom) / 2 };
  const card = ui.common.cardBottom;

  return (
    <FrameContext.Provider value={frame}>
      <View
        style={[styles.root, !footer && styles.white]}
        onLayout={(e) => setDrawnHeight(e.nativeEvent.layout.height)}
      >
        {footer && (
          <>
            {/* The Figma base layer is plain white. */}
            <View style={[styles.abs, styles.white, { left: 0, top: 0, width, height }]} />
            <Image
              source={footer.source}
              resizeMode="stretch"
              style={[styles.abs, { left: 0, top: frame.top(DESIGN_HEIGHT - footer.h, 'footer'), width, bottom: 0 }]}
            />
            <Image
              source={card.source}
              resizeMode="stretch"
              style={[styles.abs, { left: 0, top: frame.top(cardBottom - card.h, 'footer'), width, height: card.h * scale }]}
            />
          </>
        )}
        {gradientY !== undefined && (
          // Stretched up to the top of the screen so it also fills the status bar area.
          <Image
            source={ui.common.gradient.source}
            resizeMode="stretch"
            style={[styles.abs, { left: 0, top: 0, width, height: frame.top(gradientY + ui.common.gradient.h) }]}
          />
        )}
        {glows.map((glow, i) => (
          <Layer key={i} asset={glow.asset} x={glow.x} y={glow.y} />
        ))}
        {children}
      </View>
    </FrameContext.Provider>
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
  return (
    <View style={[rect, styles.noTouch, flip && styles.flip]}>
      <Image
        source={asset.source}
        resizeMode="stretch"
        tintColor={tint}
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

/** A Figma layer that acts as a button. */
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [rect, { opacity: pressed ? 0.75 : 1 }]}
    >
      {/* Explicit size: Android otherwise draws high-res exports at their pixel size. */}
      <Image
        source={asset.source}
        resizeMode="stretch"
        style={{ position: 'absolute', left: 0, top: 0, width: rect.width, height: rect.height }}
      />
      {children}
    </Pressable>
  );
}

type HotspotProps = Rect & { w: number; h: number; onPress: () => void; label: string };

/** Invisible touch target over part of a layer (e.g. one label in the nav bar). */
export function Hotspot({ x, y, anchor, w, h, onPress, label }: HotspotProps) {
  const rect = useRect({ x, y, anchor }, w, h);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={rect} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: GREEN },
  white: { backgroundColor: '#fff' },
  noTouch: { pointerEvents: 'none' },
  flip: { transform: [{ scaleY: -1 }] },
  abs: { position: 'absolute' },
});
