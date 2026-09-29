import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MAX_LAWNS, useAppState } from '@/lib/app-state';
import type { MapEvent, MapTool } from '@/components/satellite/satelliteHtml';
import type { ToolPress } from '@/components/satellite/useSatellitePage';
import { AddressFields } from '@/ui/AddressFields';
import { Artboard, BUTTON_GROW, Hotspot, Layer, PressableLayer, useFrame, useRect } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { Dialog } from '@/ui/Dialog';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, mark } = ui;

// Same as Locate: the card is taller than in Figma (shorter green chin), so the content is
// moved down and spread out by these design-pt amounts. The map tools move with the map.
const SHIFT = { header: 8, address: 16, cityState: 26, map: 36 };
/** Room around the lawns when the map opens (design pts): the tools cover the left 50. */
const MAP_FIT_INSETS = { left: 58, top: 22, right: 22, bottom: 22 };

// Lawnalyze UI (2).zip
export default function MarkScreen() {
  const { lawn, outlines, setOutlines } = useAppState();
  // The map is built with the outlines saved when the screen opened; edits flow back via events.
  const [initialOutlines] = useState(outlines);
  const [toolPress, setToolPress] = useState<ToolPress | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showMarkHint, setShowMarkHint] = useState(false);
  const [showLimit, setShowLimit] = useState(false);

  const press = (tool: MapTool) => {
    Haptics.selectionAsync().catch(() => {});
    setToolPress({ tool, id: Date.now() });
  };
  const onMapEvent = (event: MapEvent) => {
    if (event.type === 'outlines') setOutlines(event.outlines);
    else if (event.type === 'drawing') setDrawing(event.drawing);
    else setShowLimit(true);
  };

  function markMyLawn() {
    if (outlines.length === 0) {
      setShowMarkHint(true);
      return;
    }
    router.push('/onboarding/footage');
  }

  return (
    <Artboard
      cardBottom={548}
      compactChin
      glows={[
        { asset: common.glow, x: 221, y: -148 },
        { asset: common.glow, x: -38, y: -137 },
        { asset: common.glow, x: 19, y: 49 },
      ]}
    >
      <Layer asset={common.iconBox} x={32} y={24 + SHIFT.header} />
      <Layer asset={mark.iconPencil} x={40} y={32 + SHIFT.header} />
      <Layer asset={mark.titleMarkYourLawn} x={84} y={33 + SHIFT.header} />
      <AddressFields value={{ address: lawn?.address ?? '', city: lawn?.city ?? '', state: lawn?.state ?? '' }}
        shift={{ address: SHIFT.address, cityState: SHIFT.cityState }}
      />

      <SatelliteSlot
        x={24}
        y={225 + SHIFT.map}
        w={292}
        h={292}
        radius={44}
        center={lawn}
        zoom={19}
        interactive
        editable
        outlines={initialOutlines}
        toolPress={toolPress}
        onEvent={onMapEvent}
        // Open on every marked lawn, clear of the tools along the left edge.
        fitInsets={MAP_FIT_INSETS}
      />
      {/* Drawing tools: pencil = draw/finish, plus = new lawn area, trash = delete selected area. */}
      {drawing && <ActiveRing x={45} y={246 + SHIFT.map} size={28} />}
      <Layer asset={mark.toolCircle} x={45} y={246 + SHIFT.map} />
      <Layer asset={mark.toolPencil} x={46.5} y={247.5 + SHIFT.map} />
      <Layer asset={mark.toolPill} x={45} y={280 + SHIFT.map} />
      <Layer asset={mark.toolPlus} x={51} y={286 + SHIFT.map} />
      <Layer asset={mark.toolTrash} x={45} y={304 + SHIFT.map} />
      <Hotspot x={41} y={242 + SHIFT.map} w={36} h={36} label="Draw lawn outline" feedback onPress={() => press('draw')} />
      <Hotspot x={41} y={280 + SHIFT.map} w={36} h={24} label="Add another lawn area" feedback onPress={() => press('add')} />
      <Hotspot x={41} y={304 + SHIFT.map} w={36} h={30} label="Delete lawn area" feedback onPress={() => press('delete')} />

      <PressableLayer
        asset={mark.btnMarkMyLawn}
        grow={BUTTON_GROW}
        x={49}
        y={0}
        anchor="chin"
        label="Mark My Lawn"
        onPress={markMyLawn}
      />

      <Dialog
        visible={showMarkHint}
        title="Mark your lawn first"
        message="Tap around the edge of your lawn on the map to outline it."
        onClose={() => setShowMarkHint(false)}
      />
      <Dialog
        visible={showLimit}
        title={`Up to ${MAX_LAWNS} lawn areas`}
        message="To mark a different one, tap an area on the map to select it, then delete it with the trash button."
        onClose={() => setShowLimit(false)}
      />
    </Artboard>
  );
}

/** Blue ring around the pencil tool while drawing mode is on. */
function ActiveRing({ x, y, size }: { x: number; y: number; size: number }) {
  const { scale } = useFrame();
  const pad = 2;
  const rect = useRect({ x: x - pad, y: y - pad }, size + pad * 2, size + pad * 2);
  return (
    <View
      pointerEvents="none"
      style={[rect, { borderRadius: rect.width / 2, borderWidth: 2.5 * scale, borderColor: '#2F6BFF' }]}
    />
  );
}
