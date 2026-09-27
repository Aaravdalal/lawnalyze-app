import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Units } from '@/lib/app-state';
import { temperature } from '@/lib/units';
import type { Sky, Weather } from '@/lib/weather';

import { useFrame, useRect } from './Artboard';
import { WeatherIcon } from './WeatherIcon';

type Props = { x: number; y: number; w: number; h: number; weather: Weather | null; units: Units };

// Layout inside the Figma weather box (design pts): current conditions on the left,
// the next hours on the right, like the iPhone weather widget.
const NOW_W = 84;
const PAD = 12;
/** Corner radius of the Figma weather box (design pts). */
const RADIUS = 25;

// Apple weather widget backgrounds, sampled from reference widgets (top -> bottom).
const SKIES: Record<Sky, [string, string, string]> = {
  day: ['#1F83BD', '#4697C9', '#6BAAD4'],
  sunset: ['#48557F', '#7A7690', '#A68F8E'],
  night: ['#0B0D23', '#1A1E36', '#27314D'],
  rain: ['#7598AE', '#4B7C9E', '#516F87'],
};

/** Live weather in the "Weather in <city>" box, on an Apple-style sky gradient that follows
 * the conditions: day, sunset/sunrise, night or rain. */
export function WeatherWidget({ x, y, w, h, weather, units }: Props) {
  const rect = useRect({ x, y }, w, h);
  const { scale: s } = useFrame();
  const stops = SKIES[weather?.sky ?? 'day'];

  return (
    <View pointerEvents="none" style={rect}>
      <Svg width={rect.width} height={rect.height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stops[0]} />
            <Stop offset="0.5" stopColor={stops[1]} />
            <Stop offset="1" stopColor={stops[2]} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={rect.width} height={rect.height} rx={RADIUS * s} ry={RADIUS * s} fill="url(#sky)" />
      </Svg>
      {weather && <Forecast weather={weather} width={w} height={h} units={units} />}
    </View>
  );
}

function Forecast({ weather, width, height, units }: { weather: Weather; width: number; height: number; units: Units }) {
  const { scale: s } = useFrame();
  const columnW = (width - NOW_W - PAD) / weather.hourly.length;
  return (
    <View style={[styles.row, { width: width * s, height: height * s }]}>
      <View style={{ width: NOW_W * s, paddingLeft: 14 * s, justifyContent: 'center' }}>
        <Text style={[styles.light, { fontSize: 32 * s, lineHeight: 36 * s }]} maxFontSizeMultiplier={1.1}>
          {temperature(weather.temperature, units)}°
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
            {temperature(slot.temperature, units)}°
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
