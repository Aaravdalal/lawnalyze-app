import { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapCommand, MapEvent } from './satelliteHtml';
import { useSatellitePage, type SatelliteMapProps } from './useSatellitePage';

/** Live satellite imagery (Leaflet + Google satellite tiles) in a WebView. */
export function SatelliteMap(props: SatelliteMapProps) {
  const webView = useRef<WebView>(null);
  const send = useCallback((command: MapCommand) => {
    // JSON of numbers and fixed strings, so it's safe to inline as a JS literal.
    webView.current?.injectJavaScript(`window.lawnalyzeCommand && window.lawnalyzeCommand(${JSON.stringify(command)}); true;`);
  }, []);
  const { html, onLoad } = useSatellitePage(props, send);

  const { onEvent } = props;
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        onEvent?.(JSON.parse(event.nativeEvent.data) as MapEvent);
      } catch {
        // Not one of our messages.
      }
    },
    [onEvent],
  );

  return (
    <WebView
      ref={webView}
      source={{ html }}
      originWhitelist={['*']}
      onLoadEnd={onLoad}
      onMessage={onMessage}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      // GPU rendering makes panning/zooming smoother on Android. (Normal HTTP caching only:
      // forcing cache-first could keep a bad blank tile around.)
      androidLayerType="hardware"
      setSupportMultipleWindows={false}
      style={styles.webView}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: 'transparent' },
});
