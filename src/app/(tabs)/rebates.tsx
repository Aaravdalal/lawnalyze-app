import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { useAppState } from '@/lib/app-state';
import { totalSquareFeet } from '@/lib/area';
import { MORE_REBATES, REBATE_FINDER_URL, useRebates, type Rebate } from '@/lib/rebates';
import { useScreenVisits } from '@/lib/screen-shown';
import { formatArea } from '@/lib/units';
import { Artboard, TAB_CHIN_DROP, Layer, useFrame, useRect } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { GrowPressable } from '@/ui/GrowPressable';
import { InnerGlow, boxRim, boxSlots, edgeSlots, useInnerGlow, type Rim } from '@/ui/InnerGlow';

const { common, rebates: art } = ui;

const GREY = '#5E6167';
const MONEY = '#1F9D55';
const BOX_BORDER = '#CCCDCE';
const BUTTON = { x: 49, y: 506, w: 243, h: 44 };
/** The boxes (design pts): the best one, then the other choices, each this far below the last. */
const BOX_X = 23;
const BEST_Y = 130;
const OTHERS_LABEL_Y = 259;
const OTHER_Y = 287;
const OTHER_STEP = 109;
/** The best box's corner radius in its Figma export (design pts). */
const BEST_RADIUS = 25;
/**
 * Everything above the button scrolls once there's more than fits: from just below the status
 * bar down to here (design y), fading out over FADE_H (design pts) at the bottom and in over
 * TOP_FADE (dp) at the top.
 */
const VIEW_BOTTOM = 500;
const FADE_H = 18;
const TOP_FADE = 14;
/** The arrow for more choices: a round button this wide (design pts) on the last box's bottom edge. */
const ARROW_D = 28;
/**
 * Showing more choices: they rise into place one after another (each `rise` design pts, over
 * `ms`, `stagger` ms apart) while the list scrolls up to put "Other Choices" this far from the top.
 */
const REVEAL = { ms: 420, stagger: 80, rise: 26 };
const REVEAL_TOP_GAP = 18;
/** Out of sight this long (ms, past the tabs' slide), the list folds back up, so the best choice shows next time. */
const FOLD_AFTER_MS = 400;
/** Folding the list back up: it scrolls to the top first, which takes about this long (ms). */
const FOLD_SCROLL_MS = 350;
/** The screen's edges glowing: how far (dp) the light reaches in, and the screen's rounded corners. */
const EDGE = { depth: 72, corner: 40 };
const EDGE_RIM: Rim = { line: 2, near: { blur: 16, spread: 4 }, far: { blur: 44, spread: 14 } };
const useNativeDriver = Platform.OS !== 'web';

// Lawnalyze UI (6)/(19). Real rebates for the lawn's area (see lib/rebates.ts): the best one on
// top, two more below, and the rest behind the arrow under them. Tap a box (or the button) to
// open the program's page.
export default function RebatesScreen() {
  return (
    // The green glows behind the tabs are drawn once for all of them (TabGlows).
    <Artboard cardBottom={568} compactChin={TAB_CHIN_DROP}>
      <RebatesCard />
    </Artboard>
  );
}

function RebatesCard() {
  const { lawn, outlines, preferences, resetOnboarding } = useAppState();
  const frame = useFrame();
  const s = frame.scale;
  const insets = useSafeAreaInsets();
  const squareFeet = totalSquareFeet(outlines);
  const result = useRebates(lawn, squareFeet, preferences.units);
  const rebates = result.status === 'ready' ? result.rebates : [];
  const best = rebates[0];
  // The other choices: two in the Figma boxes, the rest behind the arrow, ending with EPA's
  // finder for anything not listed here.
  const others = best ? [...rebates.slice(1), MORE_REBATES] : [];
  const more = others.slice(2);
  const place = lawn?.city || 'your area';

  // The best choice glows green each time the tab is opened (and as it appears, if the rebates
  // come in while it's showing).
  const bestRect = useRect({ x: BOX_X, y: BEST_Y }, art.boxBest.w, art.boxBest.h);
  const bestSlots = useMemo(() => boxSlots(bestRect.width, bestRect.height), [bestRect.width, bestRect.height]);
  const bestGlow = useInnerGlow(bestSlots);
  // The screen's edges glow as more choices are revealed.
  const screenRect = { position: 'absolute' as const, left: 0, top: 0, width: frame.width, height: frame.height };
  const screenSlots = useMemo(() => edgeSlots(frame.width, frame.height, EDGE.depth), [frame.width, frame.height]);
  const screenGlow = useInnerGlow(screenSlots);

  const [open, setOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // Scroll to the new choices once they're laid out (see onContentSizeChange).
  const revealing = useRef(false);
  const [reveal] = useState(() => new Animated.Value(0));
  const later = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(later.current), []);

  const showing = useRef(false);
  const bestId = best?.id;
  const latestBest = useRef(bestId);
  useEffect(() => {
    latestBest.current = bestId;
  });
  useScreenVisits(
    () => {
      showing.current = true;
      clearTimeout(later.current);
      if (latestBest.current) bestGlow.flash();
    },
    () => {
      showing.current = false;
      clearTimeout(later.current);
      later.current = setTimeout(() => {
        scroll.current?.scrollTo({ y: 0, animated: false });
        setOpen(false);
      }, FOLD_AFTER_MS);
    },
  );
  const glowedFor = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (bestId && bestId !== glowedFor.current && showing.current) bestGlow.flash();
    glowedFor.current = bestId;
  }, [bestId, bestGlow]);

  function showMore() {
    clearTimeout(later.current);
    revealing.current = true;
    setOpen(true);
    screenGlow.flash();
    reveal.setValue(0);
    Animated.timing(reveal, {
      toValue: 1,
      duration: REVEAL.ms + REVEAL.stagger * Math.max(0, more.length - 1),
      easing: Easing.linear,
      useNativeDriver,
    }).start();
  }
  function showFewer() {
    scroll.current?.scrollTo({ y: 0, animated: true });
    clearTimeout(later.current);
    later.current = setTimeout(() => setOpen(false), FOLD_SCROLL_MS);
  }

  // Each revealed box fades in as it rises into place, a little after the one before.
  const moreCount = more.length;
  const rising = useMemo(() => {
    const total = REVEAL.ms + REVEAL.stagger * Math.max(0, moreCount - 1);
    return Array.from({ length: moreCount }, (_, k) => {
      const from = (REVEAL.stagger * k) / total;
      const to = (REVEAL.stagger * k + REVEAL.ms) / total;
      const t = reveal.interpolate({ inputRange: [0, from, to, 1], outputRange: [0, 0, 1, 1], easing: Easing.out(Easing.cubic) });
      return {
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [REVEAL.rise * s, 0] }) }],
      };
    });
  }, [moreCount, reveal, s]);

  const otherY = (k: number) => OTHER_Y + OTHER_STEP * k;
  // The last box showing, which the arrow sits on.
  const lastBottom = otherY(open ? 1 + more.length : 1) + art.boxOther.h;
  // The list scrolls in the space between the status bar and the button. Its content is laid out
  // in screen coordinates like everything else (shifted up by the status bar to line up).
  const viewTop = insets.top;
  const viewBottom = frame.top(VIEW_BOTTOM);
  const contentBottom = open ? Math.max(viewBottom, frame.top(lastBottom + ARROW_D / 2 + 24)) : viewBottom;

  // Dev shortcut: long-press the blue button to start onboarding over.
  function restartOnboarding() {
    resetOnboarding();
    router.replace('/onboarding');
  }

  return (
    <>
      <ScrollView
        ref={scroll}
        style={{ position: 'absolute', left: 0, top: viewTop, width: frame.width, height: viewBottom - viewTop }}
        contentContainerStyle={{ height: contentBottom - viewTop }}
        scrollEnabled={open}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        onContentSizeChange={() => {
          if (!revealing.current) return;
          revealing.current = false;
          scroll.current?.scrollTo({ y: frame.top(OTHERS_LABEL_Y - REVEAL_TOP_GAP) - frame.top(0), animated: true });
        }}
      >
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, top: -viewTop, width: frame.width, height: contentBottom }}>
          <Layer asset={common.logoSmall} x={23} y={26.5} />

          <Layer asset={art.titleRebates} x={21} y={76} />
          <Layer asset={art.labelBestChoice} x={28} y={103} />
          <Layer asset={art.boxBest} x={BOX_X} y={BEST_Y} />
          <InnerGlow rect={bestRect} radius={BEST_RADIUS * s} slots={bestSlots} glow={bestGlow} rim={boxRim(s)} />
          <Box y={BEST_Y} h={art.boxBest.h} url={best?.url ?? (result.status === 'ready' ? REBATE_FINDER_URL : undefined)}>
            {result.status === 'loading' && <Status text={`Finding rebates near ${place}…`} />}
            {result.status === 'error' && <Status text="Couldn't load rebates. Check your internet connection." />}
            {result.status === 'ready' && !best && (
              <Status
                title={`No lawn rebates listed for ${place}`}
                text="Your water company may still offer some. Tap to search EPA's rebate finder."
              />
            )}
            {best && <BestRebate rebate={best} squareFeet={squareFeet} />}
          </Box>

          <Layer asset={art.labelOtherChoices} x={27} y={OTHERS_LABEL_Y} />
          {[0, 1].map((k) => (
            <OtherBox key={k} y={otherY(k)} rebate={others[k]} />
          ))}
          {open &&
            more.map((rebate, k) => (
              <Animated.View key={rebate.id} pointerEvents="box-none" style={[StyleSheet.absoluteFill, rising[k]]}>
                <OtherBox y={otherY(2 + k)} rebate={rebate} />
              </Animated.View>
            ))}

          {more.length > 0 && (
            <MoreArrow
              y={lastBottom}
              open={open}
              count={more.length}
              onPress={open ? showFewer : showMore}
            />
          )}
        </View>
      </ScrollView>
      {open && <Fade top={viewTop} height={TOP_FADE} toward="up" />}
      {open && <Fade top={frame.top(VIEW_BOTTOM - FADE_H)} height={FADE_H * s} toward="down" />}

      <BlueButton
        label={best ? 'See How to Apply' : 'Find Rebates Near You'}
        onPress={() => Linking.openURL(best?.url ?? REBATE_FINDER_URL)}
        onLongPress={restartOnboarding}
      />
      <InnerGlow rect={screenRect} radius={EDGE.corner} slots={screenSlots} glow={screenGlow} rim={EDGE_RIM} />
    </>
  );
}

/** One of the other choices, in the Figma box. */
function OtherBox({ y, rebate }: { y: number; rebate?: Rebate }) {
  return (
    <>
      <Layer asset={art.boxOther} x={BOX_X} y={y} />
      <Box y={y} h={art.boxOther.h} url={rebate?.url}>
        {rebate && <OtherRebate rebate={rebate} />}
      </Box>
    </>
  );
}

/** Content area of one of the Figma boxes; opens `url` when tapped. */
function Box({ y, h, url, children }: { y: number; h: number; url?: string; children?: ReactNode }) {
  const rect = useRect({ x: BOX_X, y }, 295, h);
  const { scale: s } = useFrame();
  const style = [rect, { paddingHorizontal: 16 * s, paddingVertical: 10 * s, justifyContent: 'center' as const }];
  if (!url) return <View style={style}>{children}</View>;
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={({ pressed }) => [style, { opacity: pressed ? 0.6 : 1 }]}>
      {children}
    </Pressable>
  );
}

function BestRebate({ rebate, squareFeet }: { rebate: Rebate; squareFeet: number }) {
  const { scale: s } = useFrame();
  const { preferences } = useAppState();
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
          {perLawn && <Text style={[styles.small, { fontSize: 11.5 * s }]}>{`  for your ${formatArea(squareFeet, preferences.units)} lawn`}</Text>}
        </Text>
      )}
      {/* Under the amount there's room for one line: the note's first sentence. */}
      <Text numberOfLines={rebate.amount ? 1 : 2} style={[styles.small, { fontSize: 11 * s, lineHeight: 14 * s, marginTop: 2 * s }]}>
        {rebate.amount ? (rebate.note.match(/^.*?\.(?=\s|$)/)?.[0] ?? rebate.note) : rebate.note}
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
        {rebate.note}
      </Text>
    </>
  );
}

/** The round arrow on the last box's bottom edge: down to show more choices, up to fold them away. */
function MoreArrow({ y, open, count, onPress }: { y: number; open: boolean; count: number; onPress: () => void }) {
  const rect = useRect({ x: BOX_X + 295 / 2 - ARROW_D / 2, y: y - ARROW_D / 2 }, ARROW_D, ARROW_D);
  const { scale: s } = useFrame();
  const label = open ? 'Show fewer rebates' : `Show ${count} more ${count === 1 ? 'rebate' : 'rebates'}`;
  return (
    <GrowPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10 * s}
      onPress={onPress}
      style={[rect, styles.arrow, { borderRadius: rect.width / 2, borderWidth: 1 * s }]}
    >
      <Svg width={rect.width * 0.6} height={rect.width * 0.6} viewBox="0 0 24 24">
        <Path
          d={open ? 'M6.5 14.5L12 9l5.5 5.5' : 'M6.5 9.5L12 15l5.5-5.5'}
          stroke={GREY}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </GrowPressable>
  );
}

/**
 * The scrolling list fading out into the white card at an edge of the space it scrolls in
 * (`top` and `height` in dp): `toward` that edge, it's all white.
 */
function Fade({ top, height, toward }: { top: number; height: number; toward: 'up' | 'down' }) {
  const { width } = useFrame();
  const id = `fade-${toward}`;
  return (
    <Svg pointerEvents="none" style={{ position: 'absolute', left: 0, top, width, height }} width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0" y1={toward === 'down' ? 0 : 1} x2="0" y2={toward === 'down' ? 1 : 0}>
          <Stop offset="0" stopColor="#fff" stopOpacity={0} />
          <Stop offset="1" stopColor="#fff" stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
    </Svg>
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
  arrow: { backgroundColor: '#fff', borderColor: BOX_BORDER, alignItems: 'center', justifyContent: 'center' },
  // Same blue, outline and shape as the Figma "Mark My Lawn" button.
  button: { backgroundColor: '#0086FF', borderColor: '#6DC8FD', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
});
