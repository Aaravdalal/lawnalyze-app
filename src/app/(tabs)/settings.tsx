import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { HOME_SECTIONS, useAppState, type Units } from '@/lib/app-state';
import { dimensionLabels } from '@/lib/dimensions';
import { KC_COOL_SEASON, useLawnEstimate } from '@/lib/estimate';
import { requestWeatherAlertPermission, sendWeatherAlertNow, weatherAlertsSupported } from '@/lib/weather-alerts';
import { Artboard, GREEN, TAB_CHIN_DROP, Hotspot, Layer, PressableLayer, useFrame, useRect } from '@/ui/Artboard';
import { ui, type UiAsset } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { Dialog } from '@/ui/Dialog';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, settings } = ui;

/** The Edit Lawn / Show dimensions / Reset Placement buttons sit this much lower than in Figma. */
const EDIT_SHIFT = 16;

type Message = { title: string; message: string; openSettings?: boolean };

// Lawnalyze UI (7).zip. Choices apply as soon as they're tapped.
export default function SettingsScreen() {
  const { lawn, outlines, preferences, setPreferences } = useAppState();
  const [message, setMessage] = useState<Message | null>(null);
  const { showDimensions } = preferences;
  const estimate = useLawnEstimate(lawn, outlines);
  const labels = useMemo(
    () => (showDimensions ? dimensionLabels(outlines, preferences.units) : undefined),
    [showDimensions, outlines, preferences.units],
  );

  function setUnits(units: Units) {
    setPreferences({ ...preferences, units });
  }

  async function turnOnWeatherAlerts() {
    if (!weatherAlertsSupported) {
      setPreferences({ ...preferences, weatherAlerts: true });
      return;
    }
    try {
      if (!(await requestWeatherAlertPermission())) {
        setMessage({
          title: 'Notifications are off',
          message:
            "Your phone is blocking notifications from this app. Tap Open Settings, turn on notifications, then come back and tap this option again.",
          openSettings: true,
        });
        return;
      }
      setPreferences({ ...preferences, weatherAlerts: true });
      // Show today's update right away, so you can see what arrives each morning.
      await sendWeatherAlertNow({ lawn, outlines, units: preferences.units, kc: estimate?.kc ?? KC_COOL_SEASON });
    } catch (error) {
      setMessage({ title: "Couldn't set up notifications", message: String(error instanceof Error ? error.message : error) });
    }
  }

  function closeMessage() {
    if (message?.openSettings) Linking.openSettings().catch(() => {});
    setMessage(null);
  }

  const y = (value: number) => value + EDIT_SHIFT;

  return (
    <Artboard
      cardBottom={568}
      compactChin={TAB_CHIN_DROP}
      glows={[
        { asset: common.glow, x: -284, y: -15 },
        { asset: common.glowTall, x: -17, y: 79 },
      ]}
    >
      <Layer asset={common.logoSmall} x={24} y={23} />
      <Layer asset={settings.titleSettings} x={24} y={95} />

      <Layer asset={settings.boxPanel} x={23} y={130} />
      <Layer asset={settings.titleMeasurement} x={41} y={146} />
      <OptionRow
        y={170}
        position="top"
        text={settings.textCustomary}
        selected={preferences.units === 'customary'}
        onPress={() => setUnits('customary')}
        label="US Customary System"
      />
      <OptionRow
        y={207}
        position="bottom"
        text="Metric System"
        selected={preferences.units === 'metric'}
        onPress={() => setUnits('metric')}
        label="Metric System"
      />

      <Layer asset={settings.boxPanel} x={23} y={264} />
      <Layer asset={settings.titleNotifications} x={41} y={280} />
      <OptionRow
        y={304}
        position="top"
        text={settings.textWeatherEvents}
        selected={preferences.weatherAlerts}
        onPress={turnOnWeatherAlerts}
        label="Get Notified For Weather Events"
      />
      <OptionRow
        y={341}
        position="bottom"
        text={settings.textNoThanks}
        selected={!preferences.weatherAlerts}
        onPress={() => setPreferences({ ...preferences, weatherAlerts: false })}
        label="No thanks"
      />

      <SatelliteSlot
        x={22}
        y={397}
        w={159}
        h={151}
        radius={20}
        bordered
        center={lawn}
        zoom={18}
        outlines={outlines}
        // With dimensions on, zoom in on the lawn so its measurements are readable.
        fitPadding={showDimensions ? 14 : undefined}
        labels={labels}
      />

      <Layer asset={settings.boxEditPanel} x={189} y={y(404)} />
      <PressableLayer
        asset={settings.rowEditLawn}
        x={197}
        y={y(409)}
        label="Edit Lawn"
        onPress={() => router.push('/onboarding/mark')}
      />
      <Layer asset={settings.textEditLawn} x={206} y={y(419)} />
      <ToggleRow
        y={y(442)}
        on={showDimensions}
        onPress={() => setPreferences({ ...preferences, showDimensions: !showDimensions })}
      />

      <ResetPlacementButton
        y={y(489)}
        onPress={() => {
          setPreferences({ ...preferences, homeOrder: HOME_SECTIONS });
          setMessage({
            title: 'Placement reset',
            message: 'Home is back to its original layout. To move things around, press and hold a section on Home, then drag it.',
          });
        }}
      />
      <Dialog
        visible={message !== null}
        title={message?.title ?? ''}
        message={message?.message}
        buttonLabel={message?.openSettings ? 'Open Settings' : 'Okay'}
        onClose={closeMessage}
      />
    </Artboard>
  );
}

type OptionRowProps = {
  y: number;
  /** Top or bottom row of its panel: the rounder corners go on the side facing the panel's edge. */
  position: 'top' | 'bottom';
  text: UiAsset | string;
  selected: boolean;
  onPress: () => void;
  label: string;
};

/**
 * A preference row: the green row export when selected, the grey one otherwise. In Figma the
 * green one is the top row (rounder top corners) and the grey one the bottom row (rounder
 * bottom corners), so each is flipped when it's in the other row.
 */
function OptionRow({ y, position, text, selected, onPress, label }: OptionRowProps) {
  const flip = selected ? position === 'bottom' : position === 'top';
  return (
    <>
      <Layer asset={selected ? settings.rowSelected : settings.rowUnselected} x={34} y={y} flip={flip} />
      {typeof text === 'string' ? (
        // Live text in the Figma row font, where there's no export for the wording.
        <DesignText x={42} y={y + 7} w={200} h={17} size={14} weight="medium">
          {text}
        </DesignText>
      ) : (
        <Layer asset={text} x={42} y={y + 10} />
      )}
      <Hotspot x={34} y={y} w={272} h={30} label={label} onPress={onPress} />
    </>
  );
}

/** "Show dimensions": the row turns green (same shape) while the maps show the lawn's measurements. */
function ToggleRow({ y, on, onPress }: { y: number; on: boolean; onPress: () => void }) {
  const { w, h } = settings.rowShowDimensions;
  return (
    <>
      <Layer asset={settings.rowShowDimensions} x={197} y={y} tint={on ? GREEN : undefined} />
      <Layer asset={settings.textShowDimensions} x={205} y={y + 10} />
      <Hotspot x={197} y={y} w={w} h={h} label={on ? 'Hide dimensions' : 'Show dimensions'} onPress={onPress} />
    </>
  );
}

/** Puts Home's sections back in their original order (they're rearranged by dragging on Home). */
function ResetPlacementButton({ y, onPress }: { y: number; onPress: () => void }) {
  const rect = useRect({ x: 189, y }, 130, 34);
  const { scale: s } = useFrame();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reset Placement"
      onPress={onPress}
      style={({ pressed }) => [
        rect,
        styles.outline,
        { borderRadius: 17 * s, padding: 4 * s, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.inner, { borderRadius: 13 * s }]}>
        <Text style={[styles.label, { fontSize: 13 * s }]} maxFontSizeMultiplier={1.1}>
          Reset Placement
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Same look as the Figma outlined button: white pill, grey outline, light grey inner pill.
  outline: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CCCDCE' },
  inner: { flex: 1, backgroundColor: '#F4F4F4', alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: 'GoogleSansFlex_400Regular', color: '#000' },
});
