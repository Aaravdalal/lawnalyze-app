import { router } from 'expo-router';

import { useAppState } from '@/lib/app-state';
import { totalSquareFeet } from '@/lib/area';
import { formatAreaNumber } from '@/lib/units';
import { Artboard, BUTTON_GROW, Layer, PressableLayer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, footage } = ui;

// Same as Locate: the card is taller than in Figma (shorter green chin), so the content is
// moved down and spread out by these design-pt amounts.
const SHIFT = { header: 8, label: 16, box: 22, map: 36 };

// Lawnalyze UI (3).zip
export default function FootageScreen() {
  const { lawn, outlines, preferences, completeOnboarding } = useAppState();
  const squareFeet = totalSquareFeet(outlines);

  function confirm() {
    completeOnboarding();
    // Home takes the setup screens' place, so Back doesn't return to them: the tabs come back
    // from under them (Settings > Edit Lawn), or are put in their place (first setup).
    router.dismissTo('/home');
  }

  return (
    // Glows: drawn behind all the setup screens (see _layout).
    <Artboard cardBottom={548} compactChin>
      <Layer asset={common.iconBox} x={32} y={24 + SHIFT.header} />
      <Layer asset={footage.iconRuler} x={28} y={27 + SHIFT.header} />
      <Layer asset={footage.titleLawnSquareFootage} x={77} y={33 + SHIFT.header} />
      <Layer asset={footage.labelYourLawnIs} x={33} y={92 + SHIFT.label} />
      <Layer asset={footage.boxFootage} x={25} y={120 + SHIFT.box} />
      {squareFeet > 0 && (
        <DesignText x={25} y={120 + SHIFT.box} w={292} h={89} size={28} align="center">
          {`${formatAreaNumber(squareFeet, preferences.units)} ${preferences.units === 'metric' ? 'Square Meters' : 'Square Feet'}`}
        </DesignText>
      )}
      <SatelliteSlot x={24} y={225 + SHIFT.map} w={292} h={292} radius={44} center={lawn} zoom={19} outlines={outlines} />
      <PressableLayer
        asset={footage.btnConfirmSquareFootage}
        grow={BUTTON_GROW}
        x={49}
        y={0}
        anchor="chin"
        label="Confirm Square Footage"
        onPress={confirm}
      />
    </Artboard>
  );
}
