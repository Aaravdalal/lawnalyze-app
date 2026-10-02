import { useCallback, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import type { MapCommand, PageEvent } from './satelliteHtml';
import { useSatellitePage, type SatelliteMapProps } from './useSatellitePage';

/** Live satellite imagery (Leaflet + Google satellite tiles) in a WebView. */
export function SatelliteMap(props: SatelliteMapProps) {
  // If the system kills the WebView's page (it can with several maps and quick tab switching),
  // it would stay blank: start a fresh one instead.
  const [generation, setGeneration] = useState(0);
  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  return <SatellitePage key={generation} {...props} onCrash={restart} />;
}

function SatellitePage({ onCrash, ...props }: SatelliteMapProps & { onCrash: () => void }) {
  const webView = useRef<WebView>(null);
  const send = useCallback((command: MapCommand) => {
    // JSON of numbers and fixed strings, so it's safe to inline as a JS literal.
    webView.current?.injectJavaScript(`window.lawnalyzeCommand && window.lawnalyzeCommand(${JSON.stringify(command)}); true;`);
  }, []);
  const { html, onLoad } = useSatellitePage(props, send);

  const { onEvent, interactive } = props;
  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        onEvent?.(JSON.parse(event.nativeEvent.data) as PageEvent);
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
      onRenderProcessGone={onCrash}
      onContentProcessDidTerminate={onCrash}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      // GPU rendering makes panning/zooming smoother on Android, for the maps you move around.
      // The small read-only maps skip it: several hardware-layer WebViews on hidden tabs can
      // come back blank. (Normal HTTP caching only: cache-first could keep a blank tile around.)
      androidLayerType={interactive ? 'hardware' : 'none'}
      setSupportMultipleWindows={false}
      style={styles.webView}
    />
  );
}

const styles = StyleSheet.create({
  webView: { flex: 1, backgroundColor: 'transparent' },
});
