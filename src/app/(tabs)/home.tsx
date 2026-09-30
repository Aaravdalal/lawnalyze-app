import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useAppState, type HomeSection, type Units } from '@/lib/app-state';
import { outlineSquareFeet } from '@/lib/area';
import { dimensionLabels } from '@/lib/dimensions';
import { useLawnEstimate } from '@/lib/estimate';
import { formatDollars, formatMoney } from '@/lib/format';
import { formatAreaNumber } from '@/lib/units';
import { useWeather } from '@/lib/weather';
import { Artboard, TAB_CHIN_DROP, Layer, useFrame, useRect } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { DragSections, type SectionFrame } from '@/ui/DragSections';
import { DIMENSIONS_FIT_PADDING, SatelliteSlot } from '@/ui/SatelliteSlot';
import { SwapRow } from '@/ui/SwapRow';
import { WeatherWidget } from '@/ui/WeatherWidget';

const { common, home } = ui;

/** Each section's top and height in the Figma layout (design pts). */
const SECTIONS: Record<HomeSection, SectionFrame> = {
  weather: { top: 75, h: 144 }, // "Weather in …:" to the bottom of the weather box
  lawns: { top: 233, h: 181 }, // "Square footage of your lawn(s):" to the bottom of the second box
  cost: { top: 432, h: 117 }, // "Estimated water and cost:" to the bottom of the cost boxes
};

// Lawnalyze UI (4)/(17). Live weather for the lawn's city, the marked lawn areas, and the
// weather-adjusted watering cost (see lib/estimate.ts). Press and hold a section to drag it
// somewhere else (Settings > Reset Placement puts them back).
export default function HomeScreen() {
  const { lawn, outlines, preferences, setPreferences } = useAppState();
  const estimate = useLawnEstimate(lawn, outlines);
  const weather = useWeather(lawn);
  const { units, showDimensions } = preferences;
  const labels = useMemo(
    () => (showDimensions ? dimensionLabels(outlines, units) : undefined),
    [showDimensions, outlines, units],
  );

  return (
    // The green glows behind the tabs are drawn once for all of them (TabGlows).
    <Artboard cardBottom={568} compactChin={TAB_CHIN_DROP}>
      <Layer asset={common.logoSmall} x={23} y={26.5} />

      <DragSections
        frames={SECTIONS}
        order={preferences.homeOrder}
        onReorder={(homeOrder) => setPreferences({ ...preferences, homeOrder })}
      >
        {{
          weather: (
            <>
              {/* Live text in place of the "Weather in Sunnyvale:" export so the city matches the lawn. */}
              <DesignText x={24} y={75} w={300} h={22} size={16} weight="medium">
                Weather in {lawn?.city || 'your area'}:
              </DesignText>
              <Layer asset={home.textRainHint} x={35} y={101} />
              <Layer asset={home.boxWeather} x={25} y={134} />
              <WeatherWidget x={25} y={134} w={286} h={85} weather={weather} units={units} />
            </>
          ),
          lawns: (
            <>
              {units === 'metric' ? (
                <DesignText x={24} y={233} w={230} h={22} size={15.5} weight="medium">
                  Area of your lawn(s):
                </DesignText>
              ) : (
                <Layer asset={home.titleSquareFootage} x={25} y={236} />
              )}
              <LawnBox y={264} squareFeet={outlines[0] ? outlineSquareFeet(outlines[0]) : null} units={units} />
              <LawnBox
                y={346}
                squareFeet={outlines[1] ? outlineSquareFeet(outlines[1]) : null}
                units={units}
                // Only one lawn marked: say so, rather than leaving the second box blank.
                emptyText={outlines.length === 1 ? 'No other lawn' : undefined}
              />
              <SatelliteSlot
                x={152}
                y={263}
                w={159}
                h={151}
                radius={20}
                bordered
                center={lawn}
                zoom={18}
                outlines={outlines}
                // Show dimensions (Settings): more room around the lawns for the side lengths.
                fitPadding={showDimensions ? DIMENSIONS_FIT_PADDING : undefined}
                labels={labels}
              />
            </>
          ),
          cost: (
            <>
              <Layer asset={home.titleWaterAndCost} x={23} y={432} />
              <SwapRow
                x={22}
                y={464}
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
            </>
          ),
        }}
      </DragSections>
    </Artboard>
  );
}

type LawnBoxProps = { y: number; squareFeet: number | null; units: Units; emptyText?: string };

/** One of the two "Square footage of your lawn(s)" boxes; filled once that lawn area is marked. */
function LawnBox({ y, squareFeet, units, emptyText }: LawnBoxProps) {
  return (
    <>
      {squareFeet === null ? <EmptyBox y={y} /> : <Layer asset={home.boxLawn} x={22} y={y} />}
      {squareFeet !== null && (
        <>
          <DesignText x={36} y={y + 14} w={100} h={24} size={20}>
            {formatAreaNumber(squareFeet, units)}
          </DesignText>
          {units === 'metric' ? (
            // Same type as the "square feet" export (15.5pt medium); it needs almost the box's full width.
            <DesignText x={35} y={y + 40} w={108} h={19} size={15.5} weight="medium" fit={false}>
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

/** A lawn box with nothing in it yet: the same white box, with a dashed grey outline. */
function EmptyBox({ y }: { y: number }) {
  const { w, h } = home.boxLawn;
  const rect = useRect({ x: 22, y }, w, h);
  const { scale } = useFrame();
  const stroke = 1.3 * scale;
  return (
    <View pointerEvents="none" style={rect}>
      <Svg width={rect.width} height={rect.height}>
        <Rect
          x={stroke / 2}
          y={stroke / 2}
          width={rect.width - stroke}
          height={rect.height - stroke}
          rx={15 * scale}
          fill="#fff"
          stroke="#CCCDCE"
          strokeWidth={stroke}
          strokeDasharray={[6 * scale, 4.5 * scale]}
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}
