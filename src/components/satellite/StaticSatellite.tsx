import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import type { Outline } from '@/lib/app-state';
import type { MapLabel } from '@/lib/dimensions';
import type { LatLng } from '@/lib/location';

// A still satellite view drawn natively: the Google satellite tiles laid out as images, with
// the lawn outlines and any labels on top. Used for the maps you only look at (Home, Settings,
// Lawn Square Footage). Unlike a WebView map it has nothing to lose while its tab is hidden, and
// tiles come from the image cache, so it can't go blank when switching tabs quickly.

const TILE = 256; // tile size in dp, as on the Leaflet maps (512px scale=2 tiles, drawn at 256)
const MAX_TILE_ZOOM = 20;
const BLUE = '#2F6BFF'; // same outline color as the Leaflet maps
const LABEL_BOX = 160; // room (dp) a label can center itself in
const tileUrl = (x: number, y: number, z: number, retry: number) =>
  `https://mt${(x + y) % 4}.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}&scale=2${retry ? `&retry=${retry}` : ''}`;

type Props = {
  width: number;
  height: number;
  center: LatLng | null;
  zoom: number;
  outlines: Outline[];
  /** Zoom so every outline fits, with this much room (dp) around them; otherwise `zoom` around `center`. */
  fitPadding?: number;
  labels?: MapLabel[];
  /** Label text size (dp). */
  labelSize?: number;
};

/** Web Mercator: position in the 256dp world map at zoom 0. */
function project({ latitude, longitude }: LatLng) {
  const sin = Math.min(0.9999, Math.max(-0.9999, Math.sin((latitude * Math.PI) / 180)));
  return {
    x: ((longitude + 180) / 360) * TILE,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE,
  };
}

export function StaticSatellite({ width, height, center, zoom, outlines, fitPadding, labels = [], labelSize = 10 }: Props) {
  // Where the view is: its center in zoom-0 world coordinates, and the zoom level.
  const view = useMemo(() => {
    const points = outlines.flat();
    if (fitPadding !== undefined && points.length) {
      const projected = points.map(project);
      const xs = projected.map((p) => p.x);
      const ys = projected.map((p) => p.y);
      const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      const fit = Math.min(
        (width - 2 * fitPadding) / Math.max(1e-9, maxX - minX),
        (height - 2 * fitPadding) / Math.max(1e-9, maxY - minY),
      );
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom: Math.min(21, Math.max(3, Math.log2(fit))) };
    }
    if (!center) return null;
    const c = project(center);
    return { cx: c.x, cy: c.y, zoom };
  }, [outlines, fitPadding, center, zoom, width, height]);

  if (!view || width <= 0 || height <= 0) return null;

  const worldScale = 2 ** view.zoom; // dp per zoom-0 unit
  const toScreen = (p: LatLng) => {
    const w = project(p);
    return { x: (w.x - view.cx) * worldScale + width / 2, y: (w.y - view.cy) * worldScale + height / 2 };
  };

  // Tiles from the nearest tile zoom level, drawn at whatever size the exact zoom needs.
  const tileZoom = Math.min(MAX_TILE_ZOOM, Math.round(view.zoom));
  const tileSize = TILE * 2 ** (view.zoom - tileZoom);
  const left = view.cx * worldScale - width / 2; // view's top-left in world dp at this zoom
  const top = view.cy * worldScale - height / 2;
  const count = 2 ** tileZoom;
  const tiles: { key: string; x: number; y: number; left: number; top: number }[] = [];
  for (let ty = Math.floor(top / tileSize); ty <= Math.floor((top + height) / tileSize); ty++) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(left / tileSize); tx <= Math.floor((left + width) / tileSize); tx++) {
      tiles.push({
        key: `${tileZoom}/${tx}/${ty}`,
        x: ((tx % count) + count) % count,
        y: ty,
        left: tx * tileSize - left,
        top: ty * tileSize - top,
      });
    }
  }

  return (
    <View pointerEvents="none" style={{ width, height, overflow: 'hidden' }}>
      {tiles.map((t) => (
        // Rounded to whole dp (+1 overlap) so no hairline gaps show between tiles.
        <Tile key={t.key} x={t.x} y={t.y} z={tileZoom} left={Math.floor(t.left)} top={Math.floor(t.top)} size={Math.ceil(tileSize) + 1} />
      ))}
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        {outlines.map((outline, i) => (
          <Polygon
            key={i}
            points={outline.map((p) => {
              const s = toScreen(p);
              return `${s.x},${s.y}`;
            }).join(' ')}
            fill={BLUE}
            fillOpacity={0.2}
            stroke={BLUE}
            strokeWidth={3}
            strokeLinejoin="round"
          />
        ))}
      </Svg>
      {labels.map((label, i) => {
        const at = toScreen(label);
        return (
          <View key={i} style={[styles.labelSpot, { left: at.x - LABEL_BOX / 2, top: at.y - LABEL_BOX / 4 }]}>
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1}
              style={[
                styles.label,
                label.kind === 'area' && styles.areaLabel,
                { fontSize: labelSize, borderRadius: labelSize * 0.8, paddingHorizontal: labelSize * 0.5, paddingVertical: labelSize * 0.12 },
              ]}
            >
              {label.text}
            </Text>
          </View>
        );
      })}
      <Text style={styles.attribution}>© Google</Text>
    </View>
  );
}

/** One map tile; retries a few times if it fails to load (e.g. a dropped request). */
const Tile = memo(function Tile({ x, y, z, left, top, size }: { x: number; y: number; z: number; left: number; top: number; size: number }) {
  const [retry, setRetry] = useState(0);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  useEffect(() => {
    if (failedAt === null || retry >= 5) return;
    const timer = setTimeout(() => setRetry((r) => r + 1), 600 * (retry + 1));
    return () => clearTimeout(timer);
  }, [failedAt, retry]);
  return (
    <Image
      source={{ uri: tileUrl(x, y, z, retry) }}
      cachePolicy="memory-disk"
      transition={0}
      onError={() => setFailedAt(Date.now())}
      style={{ position: 'absolute', left, top, width: size, height: size }}
    />
  );
});

const styles = StyleSheet.create({
  // A box centered on the label's point; the text centers itself in it.
  labelSpot: { position: 'absolute', width: LABEL_BOX, height: LABEL_BOX / 2, alignItems: 'center', justifyContent: 'center' },
  label: {
    fontFamily: 'GoogleSansFlex_500Medium',
    color: '#10202b',
    backgroundColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
    textAlign: 'center',
  },
  areaLabel: { backgroundColor: BLUE, color: '#fff' },
  attribution: {
    position: 'absolute',
    right: 10,
    bottom: 4,
    fontSize: 7,
    color: '#333',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 3,
    borderRadius: 3,
  },
});
