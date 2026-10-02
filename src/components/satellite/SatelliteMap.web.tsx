import { useCallback, useEffect, useRef } from 'react';

import { MAP_EVENT_SOURCE, type MapCommand, type PageEvent } from './satelliteHtml';
import { useSatellitePage, type SatelliteMapProps } from './useSatellitePage';

/** Web preview of the satellite map: the same page, rendered in an iframe. */
export function SatelliteMap(props: SatelliteMapProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const send = useCallback((command: MapCommand) => {
    frame.current?.contentWindow?.postMessage(command, '*');
  }, []);
  const { html, onLoad } = useSatellitePage(props, send);

  const { onEvent } = props;
  useEffect(() => {
    if (!onEvent) return;
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.source !== MAP_EVENT_SOURCE) return;
      onEvent(event.data as PageEvent);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [onEvent]);

  return (
    <iframe
      ref={frame}
      title="Satellite map"
      srcDoc={html}
      onLoad={onLoad}
      style={{ border: 0, width: '100%', height: '100%', display: 'block', background: 'transparent' }}
    />
  );
}
