import { Artboard, TAB_CHIN_DROP, Layer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';

const { common, usage } = ui;

// Lawnalyze UI (5).zip. The boxes are empty until real usage/cost data is wired up.
export default function UsageScreen() {
  return (
    <Artboard
      cardBottom={568}
      footer={common.footerGreenTabs}
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

      <Layer asset={usage.titleWaterUsage} x={22} y={84} />
      <Layer asset={usage.textUnitsHint} x={33} y={104} />
      <Layer asset={common.box115x85} x={24} y={135} />
      <Layer asset={common.box160x85} x={150} y={135} />

      <Layer asset={usage.titleComparison} x={17} y={236} />
      <Layer asset={usage.boxDrop} x={24} y={264} />
      <Layer asset={usage.waterDrop} x={38} y={274} />
      <Layer asset={usage.box115x70} x={194} y={264} />
      <Layer asset={usage.box115x70} x={194} y={345} />

      <Layer asset={usage.titleWaterCost} x={19} y={432} />
      <Layer asset={common.box160x85} x={22} y={464} />
      <Layer asset={common.box115x85} x={194} y={464} />
    </Artboard>
  );
}
