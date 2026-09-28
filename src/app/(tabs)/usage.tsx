import { useAppState, type UsageSection } from '@/lib/app-state';
import { useLawnEstimate, type Rating } from '@/lib/estimate';
import { formatDollars, formatMoney, formatPercent } from '@/lib/format';
import { formatWater } from '@/lib/units';
import { Artboard, TAB_CHIN_DROP, Layer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { DragSections, type SectionFrame } from '@/ui/DragSections';
import { SwapRow } from '@/ui/SwapRow';
import { WaterDrop } from '@/ui/WaterDrop';

const { common, usage } = ui;

/** Each section's top and height in the Figma layout (design pts). */
const SECTIONS: Record<UsageSection, SectionFrame> = {
  usage: { top: 84, h: 142 }, // "Water Usage" to bottom of comparison box
  cost: { top: 432, h: 117 }, // "Water Cost" to bottom of cost boxes
};

// The "Great" in the Figma export is this green; the other ratings shade toward red.
const RATING_COLORS: Record<Rating, string> = {
  Great: '#9EF9B4',
  Fair: '#F2B33D',
  Bad: '#EF6B6B',
};

/**
 * How full the drop is: half full at the national average, emptier below it, and filling
 * toward the top (never quite full) the further above it the lawn is.
 */
function dropLevel(percentOfNational: number): number {
  const ratio = percentOfNational / 100;
  const level = ratio <= 1 ? ratio / 2 : 1 - 0.5 / ratio;
  return Math.min(0.94, Math.max(0.06, level));
}

// Lawnalyze UI (5)/(18). Estimated water use and cost for the marked lawn, weather-adjusted
// (see lib/estimate.ts). Boxes stay empty until a lawn area is marked and the data loads.
// Press and hold a section to drag it somewhere else.
export default function UsageScreen() {
  const { lawn, outlines, preferences, setPreferences } = useAppState();
  const estimate = useLawnEstimate(lawn, outlines);

  return (
    <Artboard
      cardBottom={568}
      compactChin={TAB_CHIN_DROP}
      glows={[
        { asset: common.glowWide, x: -59, y: 182 },
        { asset: common.glow, x: 32, y: -99 },
        { asset: common.glow, x: -128, y: 4 },
        { asset: common.glow, x: -38, y: -109 },
        { asset: common.glow, x: 62, y: 135 },
      ]}
    >
      <Layer asset={common.logoSmall} x={23} y={23} />

      <DragSections
        frames={SECTIONS}
        order={preferences.usageOrder}
        onReorder={(usageOrder) => setPreferences({ ...preferences, usageOrder })}
      >
        {{
          usage: (
            <>
              <Layer asset={usage.titleWaterUsage} x={22} y={84} />
              <Layer asset={usage.textUnitsHint} x={33} y={104} />
              <SwapRow
                x={24}
                y={135}
                h={85}
                widths={[115, 160]}
                gap={11}
                boxes={[
                  {
                    label: 'Water per week',
                    value: estimate && formatWater(estimate.weeklyGallons, preferences.units),
                    size: 18,
                    valueX: 10,
                    valueY: 22,
                    valueH: 28,
                    caption: usage.labelPerWeekSmall,
                    captionX: 10,
                    captionY: 53,
                  },
                  {
                    label: 'Water per year',
                    value: estimate && formatWater(estimate.yearlyGallons, preferences.units),
                    size: 18,
                    valueX: 13,
                    valueY: 21,
                    valueH: 28,
                    caption: usage.labelPerYearSmall,
                    captionX: 13,
                    captionY: 53,
                  },
                ]}
              />

              <Layer asset={usage.titleComparison} x={17} y={236} />
              <Layer asset={usage.boxDrop} x={24} y={264} />
              {estimate ? (
                <WaterDrop x={38} y={274} size={132} level={dropLevel(estimate.percentOfNational)} />
              ) : (
                <Layer asset={usage.waterDrop} x={38} y={274} />
              )}
              <Layer asset={usage.box115x70} x={194} y={264} />
              <Layer asset={usage.box115x70} x={194} y={345} />
              {estimate && (
                <>
                  <Layer asset={usage.labelUsage} x={210} y={274} />
                  <DesignText x={211} y={300} w={95} h={26} size={21} color={RATING_COLORS[estimate.rating]}>
                    {estimate.rating}
                  </DesignText>
                  <DesignText x={209} y={357} w={95} h={28} size={23}>
                    {formatPercent(estimate.percentOfNational)}
                  </DesignText>
                  <DesignText x={209} y={385} w={100} h={14} size={10}>
                    of national average
                  </DesignText>
                </>
              )}
            </>
          ),
          cost: (
            <>
              <Layer asset={usage.titleWaterCost} x={19} y={432} />
              <SwapRow
                x={22}
                y={464}
                h={85}
                widths={[160, 115]}
                gap={12}
                boxes={[
                  {
                    label: 'Water cost per week',
                    value: estimate && formatMoney(estimate.weeklyCost),
                    size: 30,
                    valueX: 14,
                    valueY: 16,
                    valueH: 36,
                    caption: common.labelPerWeek,
                    captionX: 18,
                    captionY: 60,
                  },
                  {
                    label: 'Water cost per year',
                    value: estimate && formatDollars(estimate.yearlyCost),
                    size: 30,
                    valueX: 11,
                    valueY: 16,
                    valueH: 36,
                    caption: common.labelPerYear,
                    captionX: 15,
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
