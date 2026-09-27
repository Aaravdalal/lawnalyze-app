import { useMemo } from 'react';

import { useAppState, type HomeSection, type Units } from '@/lib/app-state';
import { outlineSquareFeet } from '@/lib/area';
import { dimensionLabels } from '@/lib/dimensions';
import { useLawnEstimate } from '@/lib/estimate';
import { formatDollars, formatMoney } from '@/lib/format';
import { formatAreaNumber } from '@/lib/units';
import { useWeather } from '@/lib/weather';
import { Artboard, TAB_CHIN_DROP, Layer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { SatelliteSlot } from '@/ui/SatelliteSlot';
import { SwapRow } from '@/ui/SwapRow';
import { WeatherWidget } from '@/ui/WeatherWidget';

const { common, home } = ui;

/** Each section's top and height in the Figma layout (design pts). */
const SECTIONS: Record<HomeSection, { top: number; h: number }> = {
  weather: { top: 75, h: 144 }, // "Weather in …:" to the bottom of the weather box
  lawns: { top: 236, h: 178 }, // "Square footage of your lawn(s):" to the bottom of the second box
  cost: { top: 432, h: 117 }, // "Estimated water and cost:" to the bottom of the cost boxes
};
const FIRST_TOP = SECTIONS.weather.top;
const LAST_BOTTOM = SECTIONS.cost.top + SECTIONS.cost.h;
const TOTAL_H = Object.values(SECTIONS).reduce((sum, s) => sum + s.h, 0);
const GAP = (LAST_BOTTOM - FIRST_TOP - TOTAL_H) / 2;

/** How far each section moves from its Figma spot, for the chosen order (top to bottom). */
function offsets(order: HomeSection[]): Record<HomeSection, number> {
  let top = FIRST_TOP;
  const result = {} as Record<HomeSection, number>;
  for (const section of order) {
    result[section] = top - SECTIONS[section].top;
    top += SECTIONS[section].h + GAP;
  }
  return result;
}

// Lawnalyze UI (4)/(17). Live weather for the lawn's city, the marked lawn areas, and the
// weather-adjusted watering cost (see lib/estimate.ts). The three sections can be reordered in
// Settings > Edit Placement.
export default function HomeScreen() {
  const { lawn, outlines, preferences } = useAppState();
  const estimate = useLawnEstimate(lawn, outlines);
  const weather = useWeather(lawn);
  const { units, showDimensions } = preferences;
  const dy = offsets(preferences.homeOrder);
  const labels = useMemo(() => (showDimensions ? dimensionLabels(outlines, units) : undefined), [showDimensions, outlines, units]);

  return (
    <Artboard
      cardBottom={568}
      compactChin={TAB_CHIN_DROP}
      glows={[
        { asset: common.glowWide, x: 18, y: 135 },
        { asset: common.glow, x: -121, y: 33 },
        { asset: common.glow, x: -42, y: 207 },
        { asset: common.glow, x: -115, y: -114 },
        { asset: common.glow, x: -110, y: -107 },
      ]}
    >
      <Layer asset={common.logoSmall} x={23} y={23} />

      {/* Weather. Live text in place of the "Weather in Sunnyvale:" export so the city matches the lawn. */}
      <DesignText x={24} y={75 + dy.weather} w={300} h={22} size={16} weight="medium">
        Weather in {lawn?.city || 'your area'}:
      </DesignText>
      <Layer asset={home.textRainHint} x={35} y={101 + dy.weather} />
      <Layer asset={home.boxWeather} x={25} y={134 + dy.weather} />
      <WeatherWidget x={25} y={134 + dy.weather} w={286} h={85} weather={weather} units={units} />

      {/* The marked lawns. */}
      {units === 'metric' ? (
        <DesignText x={24} y={233 + dy.lawns} w={230} h={22} size={16} weight="medium">
          Area of your lawn(s):
        </DesignText>
      ) : (
        <Layer asset={home.titleSquareFootage} x={25} y={236 + dy.lawns} />
      )}
      <LawnBox y={264 + dy.lawns} squareFeet={outlines[0] ? outlineSquareFeet(outlines[0]) : null} units={units} />
      <LawnBox
        y={346 + dy.lawns}
        squareFeet={outlines[1] ? outlineSquareFeet(outlines[1]) : null}
        units={units}
        // Only one lawn marked: say so, rather than leaving the second box blank.
        emptyText={outlines.length === 1 ? 'No other lawn' : undefined}
      />
      <SatelliteSlot
        x={152}
        y={263 + dy.lawns}
        w={159}
        h={151}
        radius={20}
        bordered
        center={lawn}
        zoom={18}
        outlines={outlines}
        // Show dimensions (Settings): zoom in on the lawn so its measurements are readable.
        fitPadding={showDimensions ? 14 : undefined}
        labels={labels}
      />

      {/* Water cost. */}
      <Layer asset={home.titleWaterAndCost} x={23} y={432 + dy.cost} />
      <SwapRow
        x={22}
        y={464 + dy.cost}
        h={85}
        widths={[160, 115]}
        gap={13}
        boxes={[
          {
            label: 'Water cost per week',
            value: estimate && formatMoney(estimate.weeklyCost),
            size: 30,
            valueX: 15,
            valueY: 16,
            valueH: 36,
            caption: common.labelPerWeek,
            captionX: 20,
            captionY: 60,
          },
          {
            label: 'Water cost per year',
            value: estimate && formatDollars(estimate.yearlyCost),
            size: 30,
            valueX: 13,
            valueY: 16,
            valueH: 36,
            caption: common.labelPerYear,
            captionX: 16,
            captionY: 63,
          },
        ]}
      />
    </Artboard>
  );
}

type LawnBoxProps = { y: number; squareFeet: number | null; units: Units; emptyText?: string };

/** One of the two "Square footage of your lawn(s)" boxes; filled once that lawn area is marked. */
function LawnBox({ y, squareFeet, units, emptyText }: LawnBoxProps) {
  return (
    <>
      <Layer asset={home.boxLawn} x={22} y={y} />
      {squareFeet !== null && (
        <>
          <DesignText x={36} y={y + 14} w={100} h={24} size={20}>
            {formatAreaNumber(squareFeet, units)}
          </DesignText>
          {units === 'metric' ? (
            <DesignText x={36} y={y + 41} w={100} h={17} size={14.5}>
              square meters
            </DesignText>
          ) : (
            <Layer asset={home.labelSquareFeet} x={36} y={y + 42} />
          )}
        </>
      )}
      {squareFeet === null && emptyText && (
        <DesignText x={22} y={y} w={120} h={68} size={14} align="center" color="#8A8D92">
          {emptyText}
        </DesignText>
      )}
    </>
  );
}
