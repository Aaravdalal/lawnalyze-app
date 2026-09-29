import { router } from 'expo-router';

import { Artboard, BUTTON_GROW, Layer, PressableLayer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';

const { common, intro } = ui;

// Lawnalyze UI.zip
export default function IntroScreen() {
  return (
    <Artboard
      cardBottom={548}
      gradientY={0}
      compactChin
      glows={[
        { asset: common.glow, x: 67, y: 46 },
        { asset: common.glow, x: 58, y: 68 },
        { asset: common.glow, x: -40, y: -451 },
        { asset: common.glow, x: -77, y: 46 },
        { asset: common.glow, x: -135, y: 59 },
      ]}
    >
      <Layer asset={intro.meetTheWorldsFirst} x={17} y={60} />
      <Layer asset={intro.lawnWaterEstimator} x={143} y={106} />
      <Layer asset={intro.throughSatelite} x={17} y={190} />
      <Layer asset={intro.savingWater} x={148} y={241} />
      <Layer asset={intro.since} x={27} y={282} />
      <Layer asset={intro.n2026} x={183} y={335} />
      <Layer asset={common.logo} x={28.6} y={431.5} anchor="footer" />
      <PressableLayer
        asset={intro.btnGetStarted}
        grow={BUTTON_GROW}
        x={49}
        y={0}
        anchor="chin"
        label="Get Started"
        onPress={() => router.push('/onboarding/locate')}
      />
    </Artboard>
  );
}
