import type { ReactNode } from 'react';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import type { WeatherIconKind } from '@/lib/weather';

// Apple-weather-widget glyphs on a 24x24 grid, for the blue widget: yellow sun, white
// clouds and moon, light blue rain.
const SUN = '#FFD02B';
const CLOUD = '#FFFFFF';
const CLOUD_BACK = 'rgba(255,255,255,0.7)';
const RAIN = '#9FDDFF';
const MOON = '#FFFFFF';

const cloud = (fill: string, dx = 0, dy = 0, scale = 1) => (
  <Path
    transform={`translate(${dx} ${dy}) scale(${scale})`}
    fill={fill}
    d="M7 19h10.5a4 4 0 0 0 .6-7.95A5.6 5.6 0 0 0 7.3 10.2 4.4 4.4 0 0 0 7 19z"
  />
);

function sun(cx: number, cy: number, r: number, rays = true) {
  return (
    <G>
      {rays &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return (
            <Line
              key={i}
              x1={cx + Math.cos(a) * (r + 1.8)}
              y1={cy + Math.sin(a) * (r + 1.8)}
              x2={cx + Math.cos(a) * (r + 3.6)}
              y2={cy + Math.sin(a) * (r + 3.6)}
              stroke={SUN}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          );
        })}
      <Circle cx={cx} cy={cy} r={r} fill={SUN} />
    </G>
  );
}

const moon = (dx = 0, dy = 0, scale = 1) => (
  <Path transform={`translate(${dx} ${dy}) scale(${scale})`} fill={MOON} d="M15.5 4.5a7.5 7.5 0 1 0 4 13.2A6.2 6.2 0 0 1 15.5 4.5z" />
);

const drops = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const x = 8 + i * (count === 4 ? 2.8 : 3.6);
    return <Line key={i} x1={x + 1} y1={19.8} x2={x} y2={22.6} stroke={RAIN} strokeWidth={1.6} strokeLinecap="round" />;
  });

function horizon(arrowUp: boolean) {
  return (
    <G>
      <Path d="M6.5 17a5.5 5.5 0 0 1 11 0z" fill={SUN} />
      <Line x1={3} y1={19.5} x2={21} y2={19.5} stroke={CLOUD} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={12} y1={3} x2={12} y2={9} stroke={CLOUD} strokeWidth={1.6} strokeLinecap="round" />
      <Path
        d={arrowUp ? 'M9.5 5.5 12 3l2.5 2.5' : 'M9.5 6.5 12 9l2.5-2.5'}
        fill="none"
        stroke={CLOUD}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </G>
  );
}

const GLYPHS: Record<WeatherIconKind, ReactNode> = {
  'clear-day': sun(12, 12, 4.6),
  'clear-night': moon(),
  'partly-day': (
    <G>
      {sun(15.5, 8.5, 3.4)}
      {cloud(CLOUD, -1.5, 1.5, 0.95)}
    </G>
  ),
  'partly-night': (
    <G>
      {moon(6, -1, 0.62)}
      {cloud(CLOUD, -1.5, 1.5, 0.95)}
    </G>
  ),
  cloudy: (
    <G>
      {cloud(CLOUD_BACK, 3, -3, 0.8)}
      {cloud(CLOUD, -1, 0)}
    </G>
  ),
  fog: (
    <G>
      {cloud(CLOUD, 0, -3)}
      <Line x1={6} y1={19} x2={18} y2={19} stroke={CLOUD} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={7} y1={22} x2={17} y2={22} stroke={CLOUD} strokeWidth={1.6} strokeLinecap="round" />
    </G>
  ),
  rain: (
    <G>
      {cloud(CLOUD, 0, -3)}
      {drops(3)}
    </G>
  ),
  'heavy-rain': (
    <G>
      {cloud(CLOUD, 0, -3)}
      {drops(4)}
    </G>
  ),
  snow: (
    <G>
      {cloud(CLOUD, 0, -3)}
      {[8, 12, 16].map((x) => (
        <Circle key={x} cx={x} cy={x === 12 ? 21.8 : 20.4} r={1.1} fill={CLOUD} />
      ))}
    </G>
  ),
  thunder: (
    <G>
      {cloud(CLOUD, 0, -3)}
      <Path d="M12.8 16.5 10.5 20.3h2.3l-1.3 3.2 3.5-4.6h-2.3l1.1-2.4z" fill={SUN} />
    </G>
  ),
  sunrise: horizon(true),
  sunset: horizon(false),
};

export function WeatherIcon({ kind, size }: { kind: WeatherIconKind; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {GLYPHS[kind]}
    </Svg>
  );
}
