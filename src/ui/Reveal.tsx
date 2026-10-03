import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, StyleSheet } from 'react-native';

// Showing a screen all at once: everything inside a <Reveal> (its pictures, and any data a
// screen says it's waiting for) loads out of sight, then it all appears together, rather than
// parts popping in one by one. A Reveal inside another holds that one up too, so the outer one
// waits for everything. Once shown, a Reveal never hides again, and it shows anyway after
// `maxWait` (say the phone is offline), so nothing can be stuck out of sight.

/** Once nothing is left loading, it shows if nothing new has started for this long (ms). */
const DEFAULT_SETTLE_MS = 60;
/** It fades in over this long (ms). */
const FADE_MS = 180;
const useNativeDriver = Platform.OS !== 'web';

type Hold = () => () => void;

/** What's loading inside one Reveal, and showing it once nothing is. */
class Gate {
  private pending = 0;
  private revealed = false;
  private waiting: ReturnType<typeof setTimeout> | undefined;
  private releaseOuter: (() => void) | undefined;
  private listener: (() => void) | undefined;

  constructor(private readonly settleMs: number) {}

  /** Calls `listener` as it shows; returns what stops that. */
  onReveal(listener: () => void) {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }

  /** Holds the reveal until the returned function is called (does nothing once it's shown). */
  hold: Hold = () => {
    if (this.revealed) return () => {};
    this.pending++;
    clearTimeout(this.waiting);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pending--;
      this.check();
    };
  };

  /** What's inside has mounted (and said what it's waiting for); `outer` waits for this one. */
  start(outer: Hold | null) {
    this.releaseOuter = outer?.();
    this.check();
  }

  stop() {
    clearTimeout(this.waiting);
    this.releaseOuter?.();
    this.releaseOuter = undefined;
  }

  reveal = () => {
    if (this.revealed) return;
    this.revealed = true;
    clearTimeout(this.waiting);
    this.listener?.();
    this.releaseOuter?.();
  };

  /** Nothing loading: show, unless something starts loading in the meantime. */
  private check() {
    clearTimeout(this.waiting);
    if (!this.revealed && this.pending === 0) this.waiting = setTimeout(this.reveal, this.settleMs);
  }
}

const HoldContext = createContext<Hold | null>(null);
/** Whether the Reveal around has shown (true where there's none). */
const ShownContext = createContext(true);

type Props = {
  children: ReactNode;
  /** Shows anyway after this long (ms). */
  maxWait: number;
  /**
   * How long (ms) nothing may be loading before it shows: longer where what's inside appears a
   * moment later than the Reveal itself (e.g. the first screen, after the app's navigation starts).
   */
  settle?: number;
  /** Called once, as it shows. */
  onReveal?: () => void;
  /** Keeps what's inside out of sight until then (false: something else covers it, like the splash screen). */
  hide?: boolean;
};

export function Reveal({ children, maxWait, settle = DEFAULT_SETTLE_MS, onReveal, hide = true }: Props) {
  const outer = useContext(HoldContext);
  const [opacity] = useState(() => new Animated.Value(hide ? 0 : 1));
  const [shown, setShown] = useState(!hide);
  const latestOnReveal = useRef(onReveal);
  useEffect(() => {
    latestOnReveal.current = onReveal;
  });
  const [gate] = useState(() => new Gate(settle));
  useEffect(
    () =>
      gate.onReveal(() => {
        if (hide) {
          Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver }).start();
          setShown(true);
        }
        latestOnReveal.current?.();
      }),
    [gate, hide, opacity],
  );

  // What's inside has mounted by now: wait for it, but at most maxWait.
  useEffect(() => {
    gate.start(outer);
    const anyway = setTimeout(gate.reveal, maxWait);
    return () => {
      clearTimeout(anyway);
      gate.stop();
    };
  }, [gate, outer, maxWait]);

  return (
    <HoldContext.Provider value={gate.hold}>
      <ShownContext.Provider value={shown}>
        {hide ? (
          <Animated.View style={[styles.fill, { opacity, pointerEvents: shown ? 'auto' : 'none' }]}>
            {children}
          </Animated.View>
        ) : (
          children
        )}
      </ShownContext.Provider>
    </HoldContext.Provider>
  );
}

/**
 * For a picture inside a Reveal: holds it until the picture has loaded. Returns the handler for
 * the image's onLoad (and onError, so a picture that can't load doesn't hold it up).
 */
export function useLoadHold(): () => void {
  const hold = useContext(HoldContext);
  const loaded = useRef(false);
  const release = useRef<(() => void) | undefined>(undefined);
  useLayoutEffect(() => {
    if (!hold || loaded.current) return;
    release.current = hold();
    return () => {
      release.current?.();
      release.current = undefined;
    };
  }, [hold]);
  return useCallback(() => {
    loaded.current = true;
    release.current?.();
    release.current = undefined;
  }, []);
}

/**
 * What's inside is built only once the Reveal around it has shown, and loads in its own time:
 * e.g. the tabs that aren't showing while Home appears, so their pictures don't hold Home up,
 * or slow it down by loading at the same time.
 */
export function LoadsLater({ children }: { children: ReactNode }) {
  const shown = useContext(ShownContext);
  return <HoldContext.Provider value={null}>{shown ? children : null}</HoldContext.Provider>;
}

/** Holds the Reveal around it while `waiting` (e.g. while a screen's data is still loading). */
export function useHoldWhile(waiting: boolean) {
  const hold = useContext(HoldContext);
  useLayoutEffect(() => {
    if (!hold || !waiting) return;
    return hold();
  }, [hold, waiting]);
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
