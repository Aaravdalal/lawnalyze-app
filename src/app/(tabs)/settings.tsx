import { router } from 'expo-router';
import { useState } from 'react';

import { useAppState, type Preferences } from '@/lib/app-state';
import { useFocusCount } from '@/lib/use-focus-count';
import { Artboard, TAB_CHIN_DROP, Hotspot, Layer, PressableLayer } from '@/ui/Artboard';
import { ui, type UiAsset } from '@/ui/assets';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, settings } = ui;

// Lawnalyze UI (7).zip
export default function SettingsScreen() {
  // Each time this tab is shown, have the map reload any tiles it lost while hidden.
  const focusCount = useFocusCount();
  const { lawn, outlines, preferences, setPreferences } = useAppState();
  // Choices apply when "Confirm changes" is pressed.
  const [draft, setDraft] = useState<Preferences>(preferences);

  return (
    <Artboard
      cardBottom={568}
      footer={common.footerGreenTabs}
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
        text={settings.textCustomary}
        selected={draft.units === 'customary'}
        onPress={() => setDraft({ ...draft, units: 'customary' })}
        label="Customary System"
      />
      <OptionRow
        y={207}
        text={settings.textImperial}
        selected={draft.units === 'imperial'}
        onPress={() => setDraft({ ...draft, units: 'imperial' })}
        label="Imperial System"
      />

      <Layer asset={settings.boxPanel} x={23} y={264} />
      <Layer asset={settings.titleNotifications} x={41} y={280} />
      <OptionRow
        y={304}
        text={settings.textWeatherEvents}
        selected={draft.weatherAlerts}
        onPress={() => setDraft({ ...draft, weatherAlerts: true })}
        label="Get Notified For Weather Events"
      />
      <OptionRow
        y={341}
        text={settings.textNoThanks}
        selected={!draft.weatherAlerts}
        onPress={() => setDraft({ ...draft, weatherAlerts: false })}
        label="No thanks"
      />

      <SatelliteSlot x={22} y={397} w={159} h={151} radius={20} bordered center={lawn} zoom={18} outlines={outlines} showPin={false} refreshToken={focusCount} />

      <Layer asset={settings.boxEditPanel} x={189} y={404} />
      <PressableLayer
        asset={settings.rowEditLawn}
        x={197}
        y={409}
        label="Edit Lawn"
        onPress={() => router.push('/onboarding/mark')}
      />
      <Layer asset={settings.textEditLawn} x={206} y={419} />
      <PressableLayer
        asset={settings.rowShowDimensions}
        x={197}
        y={442}
        label="Show dimensions"
        onPress={() => router.push('/onboarding/footage')}
      />
      <Layer asset={settings.textShowDimensions} x={205} y={452} />

      <Layer asset={settings.btnOutline} x={189} y={486} />
      <Layer asset={settings.btnOutlineFill} x={194} y={490} />
      <Layer asset={settings.textEditPlacement} x={217} y={494} />
      <Hotspot x={189} y={486} w={130} h={24} label="Edit Placement" onPress={() => router.push('/onboarding/locate')} />

      <Layer asset={settings.btnConfirm} x={189} y={517} />
      <Layer asset={settings.textConfirmChanges} x={214} y={524} />
      <Hotspot x={189} y={517} w={130} h={24} label="Confirm changes" onPress={() => setPreferences(draft)} />
    </Artboard>
  );
}

type OptionRowProps = { y: number; text: UiAsset; selected: boolean; onPress: () => void; label: string };

/** A preference row: the green row export when selected, the grey one otherwise. */
function OptionRow({ y, text, selected, onPress, label }: OptionRowProps) {
  return (
    <>
      <Layer asset={selected ? settings.rowSelected : settings.rowUnselected} x={34} y={y} />
      <Layer asset={text} x={42} y={y + 10} />
      <Hotspot x={34} y={y} w={272} h={30} label={label} onPress={onPress} />
    </>
  );
}
