import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Weather } from '@/lib/weather';

import { useFrame, useRect } from './Artboard';
import { WeatherIcon } from './WeatherIcon';

type Props = { x: number; y: number; w: number; h: number; weather: Weather | null };

// Layout inside the Figma weather box (design pts): current conditions on the left,
// the next hours on the right, like the iPhone weather widget.
const NOW_W = 84;
const PAD = 12;
/** Corner radius of the Figma weather box (design pts). */
const RADIUS = 25;

/** Live weather in the "Weather in <city>" box, on the Apple weather widget's blue gradient. */
export function WeatherWidget({ x, y, w, h, weather }: Props) {
  const rect = useRect({ x, y }, w, h);
  const { scale: s } = useFrame();

  return (
    <View pointerEvents="none" style={rect}>
      <Svg width={rect.width} height={rect.height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1F83BD" />
            <Stop offset="1" stopColor="#6BAAD4" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={rect.width} height={rect.height} rx={RADIUS * s} ry={RADIUS * s} fill="url(#sky)" />
      </Svg>
      {weather && <Forecast weather={weather} width={w} height={h} />}
    </View>
  );
}

function Forecast({ weather, width, height }: { weather: Weather; width: number; height: number }) {
  const { scale: s } = useFrame();
  const columnW = (width - NOW_W - PAD) / weather.hourly.length;
  return (
    <View style={[styles.row, { width: width * s, height: height * s }]}>
      <View style={{ width: NOW_W * s, paddingLeft: 14 * s, justifyContent: 'center' }}>
        <Text style={[styles.light, { fontSize: 32 * s, lineHeight: 36 * s }]} maxFontSizeMultiplier={1.1}>
          {weather.temperature}°
        </Text>
        <Text numberOfLines={1} style={[styles.regular, styles.muted, { fontSize: 10 * s }]} maxFontSizeMultiplier={1.1}>
          {weather.condition}
        </Text>
      </View>

      {weather.hourly.map((slot, i) => (
        <View key={`${slot.label}-${i}`} style={[styles.column, { width: columnW * s, gap: 4 * s }]}>
          <Text numberOfLines={1} style={[styles.regular, styles.muted, { fontSize: 9 * s }]} maxFontSizeMultiplier={1.1}>
            {slot.label}
          </Text>
          <WeatherIcon kind={slot.icon} size={22 * s} />
          <Text style={[styles.medium, { fontSize: 11.5 * s }]} maxFontSizeMultiplier={1.1}>
            {slot.temperature}°
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  column: { alignItems: 'center', justifyContent: 'center' },
  light: { fontFamily: 'GoogleSansFlex_300Light', color: '#fff' },
  regular: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
  medium: { fontFamily: 'GoogleSansFlex_500Medium', color: '#fff' },
  muted: { color: 'rgba(255,255,255,0.75)' },
});
