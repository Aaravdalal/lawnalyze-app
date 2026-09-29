import { router } from 'expo-router';

import { Artboard, BUTTON_GROW, Layer, PressableLayer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';

const { common, welcome } = ui;

// Lawnalyze UI (8).zip: shown on launch once onboarding is done.
export default function WelcomeBackScreen() {
  return (
    <Artboard
      cardBottom={548}
      gradientY={3}
      compactChin
      glows={[
        { asset: common.glow, x: 58, y: 71 },
        { asset: common.glow, x: 65, y: 36 },
        { asset: common.glow, x: -133, y: 61 },
        { asset: common.glow, x: -76, y: 34 },
        { asset: common.glow, x: -16, y: -440 },
      ]}
    >
      <Layer asset={welcome.welcome} x={34} y={78} />
      <Layer asset={welcome.back} x={218} y={142} />
      <Layer asset={welcome.mate} x={38} y={193} />
      <Layer asset={welcome.readyTo} x={177} y={241} />
      <Layer asset={welcome.start} x={47} y={283} />
      <Layer asset={welcome.saving} x={169} y={333} />
      <Layer asset={common.logo} x={28.6} y={431.5} anchor="footer" />
      <PressableLayer
        asset={welcome.btnContinue}
        grow={BUTTON_GROW}
        x={49}
        y={0}
        anchor="chin"
        label="Continue"
        onPress={() => router.replace('/home')}
      />
    </Artboard>
  );
}
