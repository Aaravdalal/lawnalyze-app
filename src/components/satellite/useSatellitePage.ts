import { useCallback, useEffect, useRef, useState } from 'react';

import type { LatLng } from '@/lib/location';

import { buildSatelliteHtml, type MapCommand, type MapEvent, type MapTool, type SatelliteOptions } from './satelliteHtml';

/** A tool button press; `id` changes on every press so repeated taps of one tool still send. */
export type ToolPress = { tool: MapTool; id: number };

export type SatelliteMapProps = SatelliteOptions & {
  toolPress?: ToolPress | null;
  /** Changing this asks the page to re-check its size and reload tiles (e.g. on tab focus). */
  refreshToken?: number;
  onEvent?: (event: MapEvent) => void;
};

const sameSpot = (a: LatLng | null, b: LatLng | null) =>
  !!a && !!b && Math.abs(a.latitude - b.latitude) < 1e-7 && Math.abs(a.longitude - b.longitude) < 1e-7;

/**
 * Builds the map page once, then flies it to each new location and forwards tool presses.
 * `send` delivers a command to the loaded page and must be stable.
 */
export function useSatellitePage(props: SatelliteMapProps, send: (command: MapCommand) => void) {
  const { center, zoom, toolPress, refreshToken } = props;
  const [html] = useState(() => buildSatelliteHtml(props));
  const [loaded, setLoaded] = useState(false);
  // The spot the page is showing (or flying to).
  const shown = useRef<LatLng | null>(center);
  const lastTool = useRef<number | null>(null);

  const latitude = center?.latitude;
  const longitude = center?.longitude;
  useEffect(() => {
    if (!loaded || latitude === undefined || longitude === undefined) return;
    const target = { latitude, longitude };
    if (sameSpot(target, shown.current)) return;
    shown.current = target;
    send({ type: 'flyTo', ...target, zoom });
  }, [loaded, latitude, longitude, zoom, send]);

  useEffect(() => {
    if (!loaded || !toolPress || toolPress.id === lastTool.current) return;
    lastTool.current = toolPress.id;
    send({ type: 'tool', tool: toolPress.tool });
  }, [loaded, toolPress, send]);

  useEffect(() => {
    if (loaded && refreshToken) send({ type: 'refresh' });
  }, [loaded, refreshToken, send]);

  const onLoad = useCallback(() => setLoaded(true), []);
  return { html, onLoad };
}
