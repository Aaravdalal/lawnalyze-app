import { View } from 'react-native';

import { SatelliteMap } from '@/components/satellite/SatelliteMap';
import type { MapEvent } from '@/components/satellite/satelliteHtml';
import type { ToolPress } from '@/components/satellite/useSatellitePage';
import type { Outline } from '@/lib/app-state';
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
  /** Blue pin on the house; off once the lawn is confirmed (Home, Settings). */
  showPin?: boolean;
  /** Bump to make the map re-check its size and reload tiles (e.g. when its tab is shown). */
  refreshToken?: number;
};

const NO_OUTLINES: Outline[] = [];

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
  showPin = true,
  refreshToken,
}: Props) {
  const rect = useRect({ x, y, anchor }, w, h);
  const { scale } = useFrame();
  const cornerRadius = radius * scale;

  return (
    <View
      style={[
        rect,
        { borderRadius: cornerRadius, overflow: 'hidden', backgroundColor: '#2c3a30' },
        bordered && { borderWidth: 1, borderColor: '#CCCDCE' },
      ]}
    >
      <SatelliteMap
        // Read-only maps are rebuilt when the outlines change (e.g. edited from Settings).
        key={editable ? 'editable' : JSON.stringify(outlines)}
        center={center}
        zoom={zoom}
        interactive={interactive}
        cornerRadius={bordered ? cornerRadius - 1 : cornerRadius}
        outlines={outlines}
        editable={editable}
        toolPress={toolPress}
        onEvent={onEvent}
        showPin={showPin}
        refreshToken={refreshToken}
      />
    </View>
  );
}
