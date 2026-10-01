import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppState, type Units } from '@/lib/app-state';
import { totalSquareFeet } from '@/lib/area';
import { useLawnEstimate } from '@/lib/estimate';
import { MORE_REBATES, REBATE_FINDER_URL, useRebates, type Rebate } from '@/lib/rebates';
import { formatArea } from '@/lib/units';
import { Artboard, TAB_CHIN_DROP, Layer, useFrame, useRect } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { GrowPressable } from '@/ui/GrowPressable';

const { common, rebates: art } = ui;

const GREY = '#5E6167';
const MONEY = '#1F9D55';
const BUTTON = { x: 49, y: 506, w: 243, h: 44 };

// Lawnalyze UI (6)/(19). Real rebates for the lawn's area (see lib/rebates.ts): the best one on
// top, two more below. Tap a box (or the button) to open the program's page.
export default function RebatesScreen() {
  const { lawn, outlines, preferences, resetOnboarding } = useAppState();
  const squareFeet = totalSquareFeet(outlines);
  const estimate = useLawnEstimate(lawn, outlines);
  const result = useRebates(lawn, squareFeet, estimate, preferences.units);
  const rebates = result.status === 'ready' ? result.rebates : [];
  const best = rebates[0];
  // Two "other choices"; a spare box points to EPA's finder for anything not listed here.
  const others = best ? [...rebates.slice(1, 3), MORE_REBATES].slice(0, 2) : [];
  const place = lawn?.city || 'your area';

  // Dev shortcut: long-press the blue button to start onboarding over.
  function restartOnboarding() {
    resetOnboarding();
    router.replace('/onboarding');
  }

  return (
    // The green glows behind the tabs are drawn once for all of them (TabGlows).
    <Artboard cardBottom={568} compactChin={TAB_CHIN_DROP}>
      <Layer asset={common.logoSmall} x={23} y={26.5} />

      <Layer asset={art.titleRebates} x={21} y={76} />
      <Layer asset={art.labelBestChoice} x={28} y={103} />
      <Layer asset={art.boxBest} x={23} y={130} />
      <Box y={130} h={art.boxBest.h} url={best?.url ?? (result.status === 'ready' ? REBATE_FINDER_URL : undefined)}>
        {result.status === 'loading' && <Status text={`Finding rebates near ${place}…`} />}
        {result.status === 'error' && <Status text="Couldn't load rebates. Check your internet connection." />}
        {result.status === 'ready' && !best && (
          <Status
            title={`No lawn rebates listed for ${place}`}
            text="Your water company may still offer some. Tap to search EPA's rebate finder."
          />
        )}
        {best && <BestRebate rebate={best} squareFeet={squareFeet} units={preferences.units} />}
      </Box>

      <Layer asset={art.labelOtherChoices} x={27} y={259} />
      {[287, 396].map((y, i) => {
        const rebate = others[i];
        return (
          <View key={y}>
            <Layer asset={art.boxOther} x={23} y={y} />
            <Box y={y} h={art.boxOther.h} url={rebate?.url}>
              {rebate && <OtherRebate rebate={rebate} />}
            </Box>
          </View>
        );
      })}

      <BlueButton
        label={best ? 'See How to Apply' : 'Find Rebates Near You'}
        onPress={() => Linking.openURL(best?.url ?? REBATE_FINDER_URL)}
        onLongPress={restartOnboarding}
      />
    </Artboard>
  );
}

/** Content area of one of the Figma boxes; opens `url` when tapped. */
function Box({ y, h, url, children }: { y: number; h: number; url?: string; children?: ReactNode }) {
  const rect = useRect({ x: 23, y }, 295, h);
  const { scale: s } = useFrame();
  const style = [rect, { paddingHorizontal: 16 * s, paddingVertical: 10 * s, justifyContent: 'center' as const }];
  if (!url) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}

function BestRebate({ rebate, squareFeet, units }: { rebate: Rebate; squareFeet: number; units: Units }) {
  const { scale: s } = useFrame();
  const perLawn = rebate.dollars > 0 && squareFeet > 0;
  return (
    <>
      <Text numberOfLines={1} style={[styles.title, { fontSize: 16 * s }]}>
        {rebate.name}
      </Text>
      <Text numberOfLines={1} style={[styles.small, { fontSize: 11.5 * s }]}>
        {rebate.provider}
      </Text>
      {rebate.amount && (
        <Text numberOfLines={1} style={{ marginTop: 3 * s }}>
          <Text style={[styles.money, { fontSize: 21 * s }]}>{rebate.amount}</Text>
          {perLawn && <Text style={[styles.small, { fontSize: 11.5 * s }]}>{`  for your ${formatArea(squareFeet, units)} lawn`}</Text>}
        </Text>
      )}
      <Text numberOfLines={2} style={[styles.small, { fontSize: 11 * s, lineHeight: 14 * s, marginTop: 2 * s }]}>
        {rebate.savings ?? rebate.note}
      </Text>
    </>
  );
}

function OtherRebate({ rebate }: { rebate: Rebate }) {
  const { scale: s } = useFrame();
  return (
    <>
      <View style={styles.row}>
        <Text numberOfLines={1} style={[styles.title, styles.grow, { fontSize: 14.5 * s }]}>
          {rebate.name}
        </Text>
        {rebate.amount && <Text style={[styles.money, { fontSize: 14.5 * s, marginLeft: 8 * s }]}>{rebate.amount}</Text>}
      </View>
      <Text numberOfLines={1} style={[styles.small, { fontSize: 11.5 * s }]}>
        {rebate.provider}
      </Text>
      <Text numberOfLines={2} style={[styles.small, { fontSize: 11 * s, lineHeight: 14 * s, marginTop: 2 * s }]}>
        {rebate.savings ?? rebate.note}
      </Text>
    </>
  );
}

function Status({ title, text }: { title?: string; text: string }) {
  const { scale: s } = useFrame();
  return (
    <View style={styles.center}>
      {title && <Text style={[styles.title, styles.centerText, { fontSize: 15 * s }]}>{title}</Text>}
      <Text style={[styles.small, styles.centerText, { fontSize: 12 * s, lineHeight: 16 * s, marginTop: 4 * s }]}>{text}</Text>
    </View>
  );
}

/** The Figma blue button (drawn here: the export has another screen's label baked in). */
function BlueButton({ label, onPress, onLongPress }: { label: string; onPress: () => void; onLongPress: () => void }) {
  const rect = useRect({ x: BUTTON.x, y: BUTTON.y }, BUTTON.w, BUTTON.h);
  const { scale: s } = useFrame();
  return (
    <GrowPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      style={[rect, styles.button, { borderRadius: (BUTTON.h / 2) * s, borderWidth: 1.5 * s }]}
    >
      <Text style={[styles.buttonLabel, { fontSize: 17 * s }]}>{label}</Text>
    </GrowPressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: 'GoogleSansFlex_500Medium', color: '#000' },
  small: { fontFamily: 'GoogleSansFlex_400Regular', color: GREY },
  money: { fontFamily: 'GoogleSansFlex_500Medium', color: MONEY },
  row: { flexDirection: 'row', alignItems: 'baseline' },
  grow: { flex: 1 },
  center: { alignItems: 'center' },
  centerText: { textAlign: 'center' },
  // Same blue, outline and shape as the Figma "Mark My Lawn" button.
  button: { backgroundColor: '#0086FF', borderColor: '#6DC8FD', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
});
