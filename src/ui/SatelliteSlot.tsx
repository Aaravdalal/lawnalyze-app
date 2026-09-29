import { View } from 'react-native';

import { SatelliteMap } from '@/components/satellite/SatelliteMap';
import type { Insets, MapEvent } from '@/components/satellite/satelliteHtml';
import { StaticSatellite } from '@/components/satellite/StaticSatellite';
import type { ToolPress } from '@/components/satellite/useSatellitePage';
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
        { borderRadius: cornerRadius, overflow: 'hidden', backgroundColor: '#2c3a30' },
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
        <SatelliteMap
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
