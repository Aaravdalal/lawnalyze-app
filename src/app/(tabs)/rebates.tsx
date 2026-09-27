import { router } from 'expo-router';

import { useAppState } from '@/lib/app-state';
import { Artboard, TAB_CHIN_DROP, Layer, PressableLayer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';

const { common, rebates } = ui;

// Lawnalyze UI (6).zip. The boxes are empty until rebate data is wired up.
export default function RebatesScreen() {
  const { resetOnboarding } = useAppState();

  // Dev shortcut: long-press the blue button to start onboarding over.
  function restartOnboarding() {
    resetOnboarding();
    router.replace('/onboarding');
  }

  return (
    <Artboard
      cardBottom={568}
      footer={common.footerGreenTabs}
      compactChin={TAB_CHIN_DROP}
      glows={[
        { asset: common.glow, x: 31, y: -112 },
        { asset: common.glowTall, x: -105, y: -108 },
        { asset: common.glow, x: -45, y: 192 },
      ]}
    >
      <Layer asset={common.logoSmall} x={23} y={23} />

      <Layer asset={rebates.titleRebates} x={21} y={76} />
      <Layer asset={rebates.labelBestChoice} x={28} y={103} />
      <Layer asset={rebates.boxBest} x={23} y={130} />

      <Layer asset={rebates.labelOtherChoices} x={27} y={259} />
      <Layer asset={rebates.boxOther} x={23} y={287} />
      <Layer asset={rebates.boxOther} x={23} y={396} />

      <PressableLayer asset={rebates.btnBlue} x={49} y={506} label="Rebates" onLongPress={restartOnboarding} />
    </Artboard>
  );
}
