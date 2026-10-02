import { useCallback, useEffect, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { SatelliteMap } from '@/components/satellite/SatelliteMap';
import type { Insets, MapEvent, PageEvent } from '@/components/satellite/satelliteHtml';
import { StaticSatellite } from '@/components/satellite/StaticSatellite';
import type { SatelliteMapProps, ToolPress } from '@/components/satellite/useSatellitePage';
import type { Outline } from '@/lib/app-state';
import type { MapLabel } from '@/lib/dimensions';
import type { LatLng } from '@/lib/location';

import { useFrame, useRect, type Anchor } from './Artboard';

type Props = {
  x: number;
  y: number;
  w: number;
  h: number;
  anchor?: Anchor;
  /** Corner radius of the Figma image mask, in design units. */
  radius: number;
  /** The small map thumbnails have the same 1px grey outline as the other boxes. */
  bordered?: boolean;
  center: LatLng | null;
  zoom: number;
  interactive?: boolean;
  /** Marked lawn areas to show (drawn when the map opens). */
  outlines?: Outline[];
  /** Lets the user draw/reshape outlines; changes arrive through `onEvent`. */
  editable?: boolean;
  toolPress?: ToolPress | null;
  onEvent?: (event: MapEvent) => void;
  /** Blue pin on the house; only while locating it. */
  showPin?: boolean;
  /** Fly in from zoomed out when the location arrives (Locate); other maps open right on it. */
  flyIn?: boolean;
  /** Read-only maps zoom to fit every outline, with this much room around them (design pts). */
  fitPadding?: number;
  /** Read-only maps: tags on the map, e.g. side lengths. */
  labels?: MapLabel[];
  /** Interactive maps: open zoomed to fit the outlines, this much room clear on each side (design pts). */
  fitInsets?: Insets;
};

const NO_OUTLINES: Outline[] = [];
/** Room around the lawns on a read-only map (design pts)... */
const FIT_PADDING = 14;
/** ...and with side lengths shown: tags on the left/right edges stick out about half their width. */
export const DIMENSIONS_FIT_PADDING = 26;
/** An empty map: what shows before any imagery is in. */
const MAP_BLANK = '#2c3a30';
/** A live map fades in over this long (ms) once its first view's imagery is all in... */
const MAP_REVEAL_MS = 250;
/**
 * ...or after this long (ms) anyway. (The page shows itself a while after it's on screen even if
 * some imagery won't load; this is for a page that never gets going at all.)
 */
const MAP_REVEAL_ANYWAY_MS = 8000;
const useNativeDriver = Platform.OS !== 'web';

/** Live satellite imagery in the spot of the placeholder satellite photo from Figma. */
export function SatelliteSlot({
  x,
  y,
  w,
  h,
  anchor,
  radius,
  bordered,
  center,
  zoom,
  interactive = false,
  outlines = NO_OUTLINES,
  editable = false,
  toolPress,
  onEvent,
  showPin = false,
  flyIn = false,
  fitPadding = FIT_PADDING,
  labels,
  fitInsets,
}: Props) {
  const rect = useRect({ x, y, anchor }, w, h);
  const { scale } = useFrame();
  const cornerRadius = radius * scale;
  const border = bordered ? 1 : 0;

  return (
    <View
      style={[
        rect,
        { borderRadius: cornerRadius, overflow: 'hidden', backgroundColor: MAP_BLANK },
        bordered && { borderWidth: border, borderColor: '#CCCDCE' },
      ]}
    >
      {!interactive && !editable ? (
        // Maps you only look at are drawn natively from cached tiles: they can't go blank
        // while their tab is hidden or when switching tabs quickly.
        <StaticSatellite
          width={rect.width - 2 * border}
          height={rect.height - 2 * border}
          center={center}
          zoom={zoom}
          outlines={outlines}
          fitPadding={fitPadding * scale}
          labels={labels}
          labelSize={9 * scale}
        />
      ) : (
        <LiveMap
          // Rebuilt when the outlines change from outside (e.g. edited from Settings).
          key={editable ? 'editable' : JSON.stringify(outlines)}
          center={center}
          zoom={zoom}
          interactive={interactive}
          cornerRadius={bordered ? cornerRadius - border : cornerRadius}
          outlines={outlines}
          editable={editable}
          toolPress={toolPress}
          onEvent={onEvent}
          showPin={showPin}
          flyIn={flyIn}
          fitInsets={
            fitInsets && {
              left: fitInsets.left * scale,
              top: fitInsets.top * scale,
              right: fitInsets.right * scale,
              bottom: fitInsets.bottom * scale,
            }
          }
        />
      )}
    </View>
  );
}

type LiveMapProps = Omit<SatelliteMapProps, 'onEvent'> & { onEvent?: (event: MapEvent) => void };

/**
 * A live map that shows up all at once: until its first view's imagery is in, a cover the color
 * of an empty map sits over it, then fades away (rather than the tiles popping in one by one).
 * The cover fades, not the map: Android can draw a map badly while it's see-through.
 */
function LiveMap({ onEvent, ...props }: LiveMapProps) {
  const [cover] = useState(() => new Animated.Value(1));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) {
      Animated.timing(cover, { toValue: 0, duration: MAP_REVEAL_MS, useNativeDriver }).start();
      return;
    }
    const anyway = setTimeout(() => setReady(true), MAP_REVEAL_ANYWAY_MS);
    return () => clearTimeout(anyway);
  }, [ready, cover]);
  const onPageEvent = useCallback(
    (event: PageEvent) => {
      if (event.type === 'ready') setReady(true);
      else onEvent?.(event);
    },
    [onEvent],
  );

  return (
    <>
      <SatelliteMap {...props} onEvent={onPageEvent} />
      <Animated.View style={[StyleSheet.absoluteFill, styles.cover, { opacity: cover }]} />
    </>
  );
}

const styles = StyleSheet.create({
  cover: { backgroundColor: MAP_BLANK, pointerEvents: 'none' },
});
