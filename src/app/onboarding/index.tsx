import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { warmUpLocation } from '@/lib/location';
import { Artboard, BUTTON_GROW, Layer, PressableLayer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';

const { common, intro } = ui;
/**
 * This long (ms) after the intro shows, the Locate screen gets built off to the side, map and
 * all, so Get Started slides straight over to it with nothing left to load. (Not right away:
 * the intro's own arrival comes first.)
 */
const BUILD_LOCATE_AFTER_MS = 600;

// Lawnalyze UI.zip
export default function IntroScreen() {
  // Next is Locate, which goes to where the phone is: find it (and its address) now, asking for
  // permission here if needed, so Locate has it all the moment Get Started is tapped.
  useEffect(() => warmUpLocation(), []);
  // Build Locate ahead (see BUILD_LOCATE_AFTER_MS), and again each time the intro shows anew:
  // going back from Locate takes it down.
  useFocusEffect(
    useCallback(() => {
      const later = setTimeout(() => router.prefetch('/onboarding/locate'), BUILD_LOCATE_AFTER_MS);
      return () => clearTimeout(later);
    }, []),
  );

  return (
    // Glows: drawn behind all the setup screens (see _layout).
    <Artboard cardBottom={548} compactChin>
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
