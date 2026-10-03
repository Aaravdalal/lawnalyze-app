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
import { InnerGlow, boxRim, boxSlotsLike, useInnerGlow } from '@/ui/InnerGlow';

const { common, rebates: art } = ui;

const GREY = '#5E6167';
const MONEY = '#1F9D55';
const BOX_BORDER = '#CCCDCE';
/** The blue button (design pts), low on the card: placed from the card's bottom edge (anchor 'footer'). */
const BUTTON = { x: 49, y: 498, w: 243, h: 44 };
/** The boxes (design pts): the best one, then the other choices, each this far below the last. */
const BOX_X = 23;
const BEST_Y = 130;
const OTHERS_LABEL_Y = 259;
const OTHER_Y = 287;
const OTHER_STEP = 109;
/** The boxes' corner radii in their Figma exports (design pts). */
const BEST_RADIUS = 25;
const OTHER_RADIUS = 20;
/**
 * A box glows just like an address box does, stretched to its size, though its light reaches in
 * a little less far (GLOW_REACH of the way): the boxes are much taller than an address box.
 */
const GLOW_MODEL = common.inputAddress;
const GLOW_REACH = 0.8;
/**
 * Once "More" is tapped, everything above the button scrolls: from just below the status bar down
 * to the top of the button. Wherever the list goes on past one of those edges, it fades out into
 * the card there, coming in as it's scrolled FADE_IN (design pts) away from that end: over
 * FADE_TOP (design pts) at the top, and over the taller FADE_BOTTOM at the bottom, which is all
 * white for its last BOTTOM_SOLID share so no words show through just above the button or beside
 * its ends. (That white ends at the button, which covers the faint green of the background.)
 */
const FADE_TOP = 32;
const FADE_BOTTOM = 48;
const BOTTOM_SOLID = 0.3;
const FADE_IN = 24;
/**
 * The fades reach this far (dp) past the edges the list is cut off at, so the list's last row of
 * pixels is always under solid white, however the edges round to the phone's pixels.
 */
const FADE_OVERHANG = 2;
/**
 * "More" (or "Less") under the last box: a pill this big (design pts), halfway between the third
 * box and the button (at least `minGap` from each); at the end of the open list, "Less" keeps the
 * same distance from the last box, and as much room under it.
 */
const MORE = { w: 76, h: 28, minGap: 4 };
/**
 * Showing more choices: they rise into place one after another (each `rise` design pts, over
 * `ms`, `stagger` ms apart), each surging green as it comes, while the list scrolls up to put
 * "Other Choices" just below the top fade.
 */
const REVEAL = { ms: 420, stagger: 80, rise: 26 };
/** Out of sight this long (ms, past the tabs' slide), the list folds back up, so the best choice shows next time. */
const FOLD_AFTER_MS = 400;
/** Folding the list back up: it scrolls to the top first, which takes about this long (ms). */
const FOLD_SCROLL_MS = 350;
const useNativeDriver = Platform.OS !== 'web';

// Lawnalyze UI (6)/(19). Real rebates for the lawn's area (see lib/rebates.ts): the best one on
// top, two more below, and the rest behind "More" under them. Tap a box (or the button) to open
// the program's page.
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
  const bestSlots = useMemo(() => boxSlotsLike(GLOW_MODEL, bestRect.width, bestRect.height, GLOW_REACH), [bestRect.width, bestRect.height]);
  const bestGlow = useInnerGlow(bestSlots);

  const [open, setOpen] = useState(false);
  const scroll = useRef<ScrollView>(null);
  // How far the list is scrolled (dp), which shows its fades.
  const [scrollY] = useState(() => new Animated.Value(0));
  // Scroll to the new choices once they're laid out (see onContentSizeChange).
  const revealing = useRef(false);
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
  }
  function showFewer() {
    scroll.current?.scrollTo({ y: 0, animated: true });
    clearTimeout(later.current);
    later.current = setTimeout(() => setOpen(false), FOLD_SCROLL_MS);
  }

  const otherY = (k: number) => OTHER_Y + OTHER_STEP * k;
  // The list scrolls in the space between the status bar and the button. Its content is laid out
  // in screen coordinates like everything else (shifted up by the status bar to line up).
  const viewTop = insets.top;
  const viewBottom = frame.top(BUTTON.y, 'footer');
  // "More" goes halfway between the third box and the button (design pts of room either side).
  const foldedBottom = otherY(1) + art.boxOther.h;
  const moreGap = Math.max(MORE.minGap, ((viewBottom - frame.top(foldedBottom)) / s - MORE.h) / 2);
  // The last box showing, with "More" (or "Less") under it.
  const lastBottom = otherY(open ? 1 + more.length : 1) + art.boxOther.h;
  const listEnd = more.length > 0 ? lastBottom + moreGap * 2 + MORE.h : lastBottom;
  const contentBottom = Math.max(viewBottom, frame.top(listEnd));
  const maxScroll = Math.round(contentBottom - viewBottom);

  // The fades show only where the list goes on past an edge: the top one once it's scrolled down
  // a little, the bottom one until it's scrolled to the end.
  const fades = useMemo(() => {
    const ramp = FADE_IN * s;
    return {
      top: scrollY.interpolate({ inputRange: [0, ramp], outputRange: [0, 1], extrapolate: 'clamp' }),
      bottom: scrollY.interpolate({ inputRange: [maxScroll - ramp, maxScroll], outputRange: [1, 0], extrapolate: 'clamp' }),
    };
  }, [scrollY, maxScroll, s]);

  // Dev shortcut: long-press the blue button to start onboarding over.
  function restartOnboarding() {
    resetOnboarding();
    router.replace('/onboarding');
  }

  return (
    <>
      <Animated.ScrollView
        ref={scroll}
        style={{ position: 'absolute', left: 0, top: viewTop, width: frame.width, height: viewBottom - viewTop }}
        contentContainerStyle={{ height: contentBottom - viewTop }}
        scrollEnabled={open}
        showsVerticalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver })}
        onContentSizeChange={() => {
          if (!revealing.current) return;
          revealing.current = false;
          // "Other Choices" goes up to just below the top fade.
          scroll.current?.scrollTo({ y: frame.top(OTHERS_LABEL_Y) - viewTop - (FADE_TOP + 6) * s, animated: true });
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
          {open && more.map((rebate, k) => <RevealedBox key={rebate.id} y={otherY(2 + k)} rebate={rebate} delay={REVEAL.stagger * k} />)}

          {more.length > 0 && (
            <MoreButton
              y={lastBottom + moreGap}
              open={open}
              count={more.length}
              onPress={open ? showFewer : showMore}
            />
          )}
        </View>
      </Animated.ScrollView>
      <Fade top={viewTop - FADE_OVERHANG} height={FADE_TOP * s + FADE_OVERHANG} toward="up" opacity={fades.top} />
      <Fade
        top={viewBottom - FADE_BOTTOM * s}
        height={FADE_BOTTOM * s + FADE_OVERHANG}
        toward="down"
        solid={BOTTOM_SOLID}
        opacity={fades.bottom}
      />

      <BlueButton
        label={best ? 'See How to Apply' : 'Find Rebates Near You'}
        onPress={() => Linking.openURL(best?.url ?? REBATE_FINDER_URL)}
        onLongPress={restartOnboarding}
      />
    </>
  );
}

/** One of the other choices, in the Figma box (`children`, like a glow, go over the box, under its words). */
function OtherBox({ y, rebate, children }: { y: number; rebate?: Rebate; children?: ReactNode }) {
  return (
    <>
      <Layer asset={art.boxOther} x={BOX_X} y={y} />
      {children}
      <Box y={y} h={art.boxOther.h} url={rebate?.url}>
        {rebate && <OtherRebate rebate={rebate} />}
      </Box>
    </>
  );
}

/**
 * A choice "More" revealed: `delay` ms after the tap, it fades in as it rises into place, surging
 * green as it comes.
 */
function RevealedBox({ y, rebate, delay }: { y: number; rebate: Rebate; delay: number }) {
  const rect = useRect({ x: BOX_X, y }, art.boxOther.w, art.boxOther.h);
  const { scale: s } = useFrame();
  const slots = useMemo(() => boxSlotsLike(GLOW_MODEL, rect.width, rect.height, GLOW_REACH), [rect.width, rect.height]);
  const glow = useInnerGlow(slots);
  const [rise] = useState(() => new Animated.Value(0));
  useEffect(() => {
    glow.flash(delay);
    const rising = Animated.timing(rise, { toValue: 1, duration: REVEAL.ms, delay, easing: Easing.out(Easing.cubic), useNativeDriver });
    rising.start();
    return () => rising.stop();
  }, [glow, rise, delay]);
  const style = useMemo(
    () => ({ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [REVEAL.rise * s, 0] }) }] }),
    [rise, s],
  );
  return (
    <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, style]}>
      <OtherBox y={y} rebate={rebate}>
        <InnerGlow rect={rect} radius={OTHER_RADIUS * s} slots={slots} glow={glow} rim={boxRim(s)} />
      </OtherBox>
    </Animated.View>
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
      {/* With an amount, that says it all; without one, the note says what it's for. */}
      {!rebate.amount && (
        <Text numberOfLines={2} style={[styles.small, { fontSize: 11 * s, lineHeight: 14 * s, marginTop: 2 * s }]}>
          {rebate.note}
        </Text>
      )}
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

/** "More" with a down arrow under the last box (design y of its top): "Less" and up once open. */
function MoreButton({ y, open, count, onPress }: { y: number; open: boolean; count: number; onPress: () => void }) {
  const rect = useRect({ x: BOX_X + 295 / 2 - MORE.w / 2, y }, MORE.w, MORE.h);
  const { scale: s } = useFrame();
  const label = open ? 'Show fewer rebates' : `Show ${count} more ${count === 1 ? 'rebate' : 'rebates'}`;
  return (
    <GrowPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10 * s}
      onPress={onPress}
      style={[rect, styles.more, { borderRadius: rect.height / 2, borderWidth: 1 * s }]}
    >
      <Text style={[styles.moreLabel, { fontSize: 13 * s }]}>{open ? 'Less' : 'More'}</Text>
      <Svg width={15 * s} height={15 * s} viewBox="0 0 24 24" style={{ marginLeft: 3 * s }}>
        <Path
          d={open ? 'M6.5 14.5L12 9l5.5 5.5' : 'M6.5 9.5L12 15l5.5-5.5'}
          stroke={GREY}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </GrowPressable>
  );
}

/**
 * How a fade's white comes in, from none (offset 0, the list's side) to all: eased in and out
 * (smoothstep), so it has no visible edge of its own, and all white for the last `solid` of it.
 */
function fadeStops(solid: number) {
  return Array.from({ length: 11 }, (_, i) => {
    const u = Math.min(1, i / 10 / (1 - solid));
    return { offset: i / 10, opacity: u * u * (3 - 2 * u) };
  });
}

/**
 * The scrolling list fading out into the white card at an edge of the space it scrolls in
 * (`top` and `height` in dp): `toward` that edge, it's all white (for the last `solid` of it).
 * Shown as much as `opacity`.
 */
function Fade({
  top,
  height,
  toward,
  solid = 0,
  opacity,
}: {
  top: number;
  height: number;
  toward: 'up' | 'down';
  solid?: number;
  opacity: Animated.AnimatedInterpolation<number>;
}) {
  const { width } = useFrame();
  const id = `fade-${toward}`;
  const stops = useMemo(() => fadeStops(solid), [solid]);
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top, width, height, opacity }}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={id} x1="0" y1={toward === 'down' ? 0 : 1} x2="0" y2={toward === 'down' ? 1 : 0}>
            {stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor="#fff" stopOpacity={stop.opacity} />
            ))}
          </LinearGradient>
        </Defs>
        {/* A little past the top and bottom: an edge ending partway through a row of pixels would leave that row partly see-through. */}
        <Rect x={0} y={-1} width={width} height={height + 2} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
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
  const rect = useRect({ x: BUTTON.x, y: BUTTON.y, anchor: 'footer' }, BUTTON.w, BUTTON.h);
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
  more: { flexDirection: 'row', backgroundColor: '#fff', borderColor: BOX_BORDER, alignItems: 'center', justifyContent: 'center' },
  moreLabel: { fontFamily: 'GoogleSansFlex_500Medium', color: GREY },
  // Same blue, outline and shape as the Figma "Mark My Lawn" button.
  button: { backgroundColor: '#0086FF', borderColor: '#6DC8FD', alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: 'GoogleSansFlex_400Regular', color: '#fff' },
});
