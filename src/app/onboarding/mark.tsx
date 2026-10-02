import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { MAX_LAWNS, useAppState, type Lawn } from '@/lib/app-state';
import { geocodeAddress, sameQuery, trimmedQuery, type AddressQuery } from '@/lib/geocode';
import { distanceMeters } from '@/lib/location';
import type { MapEvent, MapTool } from '@/components/satellite/satelliteHtml';
import type { ToolPress } from '@/components/satellite/useSatellitePage';
import { AddressFields } from '@/ui/AddressFields';
import { Artboard, BUTTON_GROW, GREEN, Hotspot, Layer, PressableLayer, useRect } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { Dialog } from '@/ui/Dialog';
import { ButtonSpinner } from '@/ui/LoaderMorphing';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, mark } = ui;

// Same as Locate: the card is taller than in Figma (shorter green chin), so the content is
// moved down and spread out by these design-pt amounts. The map tools move with the map.
const SHIFT = { header: 8, address: 16, cityState: 26, map: 36 };
/** Room around the lawns when the map opens (design pts): the tools cover the left 50. */
const MAP_FIT_INSETS = { left: 58, top: 22, right: 22, bottom: 22 };
/**
 * A changed address found this close (meters) to the lawn is the same place, just written
 * differently. (A lawn found from the phone's location sits where the phone was, and the
 * geocoder puts its address a few dozen meters away, e.g. at the street.)
 */
const SAME_PLACE_M = 150;

type Notice = { title: string; message: string };

const addressOf = (lawn: Lawn | null): AddressQuery => ({
  address: lawn?.address ?? '',
  city: lawn?.city ?? '',
  state: lawn?.state ?? '',
});

// Lawnalyze UI (2).zip. Also Settings > Edit Lawn, where the address can be changed too.
export default function MarkScreen() {
  const { lawn, outlines, setLawn, setOutlines } = useAppState();
  // The map is built with the outlines saved when the screen opened; edits flow back via events.
  const [initialOutlines] = useState(outlines);
  const [toolPress, setToolPress] = useState<ToolPress | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [showMarkHint, setShowMarkHint] = useState(false);
  const [showLimit, setShowLimit] = useState(false);
  // A lawn pressed and held on the map (its index): asks whether to delete it.
  const [lawnMenu, setLawnMenu] = useState<number | null>(null);

  // The address boxes can be edited: a new address moves the map (and the lawn) there.
  const [form, setForm] = useState<AddressQuery>(() => addressOf(lawn));
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  // Found somewhere else: waits for a yes, since the lawns marked here get cleared.
  const [moveTo, setMoveTo] = useState<Lawn | null>(null);
  const addressChanged = !sameQuery(trimmedQuery(form), trimmedQuery(addressOf(lawn)));

  function moveLawn(next: Lawn) {
    setMoveTo(null);
    // A new spot: the lawns marked around the old one are cleared, and the map flies there.
    setLawn(next);
    setToolPress({ tool: 'clear', id: Date.now() });
  }

  function keepAddress() {
    setMoveTo(null);
    setForm(addressOf(lawn));
  }

  async function findAddress() {
    if (searching || !addressChanged) return;
    const query = trimmedQuery(form);
    if (!query.address) {
      setNotice({ title: 'Enter your address', message: 'Type the street address of your lawn.' });
      return;
    }
    setSearching(true);
    try {
      const spot = await geocodeAddress(query);
      if (!spot) {
        setNotice({ title: "We couldn't find that address", message: 'Check the street, city and state, then try again.' });
      } else if (lawn && distanceMeters(spot, lawn) < SAME_PLACE_M) {
        // Same place (e.g. a typo fixed): just the new wording; the marked lawns stay.
        setLawn({ ...query, latitude: lawn.latitude, longitude: lawn.longitude });
      } else if (outlines.length > 0) {
        setMoveTo({ ...query, ...spot });
      } else {
        moveLawn({ ...query, ...spot });
      }
    } catch {
      setNotice({ title: "Couldn't reach the map service", message: 'Check your internet connection and try again.' });
    } finally {
      setSearching(false);
    }
  }

  const press = (tool: MapTool) => {
    Haptics.selectionAsync().catch(() => {});
    setToolPress({ tool, id: Date.now() });
  };
  const onMapEvent = (event: MapEvent) => {
    if (event.type === 'outlines') setOutlines(event.outlines);
    else if (event.type === 'drawing') setDrawing(event.drawing);
    else if (event.type === 'limit') setShowLimit(true);
    else if (event.type === 'lawnMenu') setLawnMenu(event.index);
    else {
      const style = event.style === 'light' ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium;
      Haptics.impactAsync(style).catch(() => {});
    }
  };
  function deleteHeldLawn() {
    if (lawnMenu !== null) setToolPress({ tool: 'delete', id: Date.now(), lawn: lawnMenu });
    setLawnMenu(null);
  }

  function markMyLawn() {
    // A new address typed in: go there first.
    if (addressChanged) {
      findAddress();
      return;
    }
    if (outlines.length === 0) {
      setShowMarkHint(true);
      return;
    }
    router.push('/onboarding/footage');
  }

  return (
    // Glows: drawn behind all the setup screens (see _layout).
    <Artboard cardBottom={548} compactChin>
      <Layer asset={common.iconBox} x={32} y={24 + SHIFT.header} />
      <Layer asset={mark.iconPencil} x={40} y={32 + SHIFT.header} />
      <Layer asset={mark.titleMarkYourLawn} x={84} y={33 + SHIFT.header} />
      <AddressFields
        value={form}
        onChange={setForm}
        onSubmit={findAddress}
        shift={{ address: SHIFT.address, cityState: SHIFT.cityState }}
        searching={searching}
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
        disabled={searching}
        onPress={markMyLawn}
      >
        {searching && <ButtonSpinner />}
      </PressableLayer>

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
      <Dialog
        visible={lawnMenu !== null}
        title="Delete this lawn?"
        message="To move it instead, press and hold the lawn, then drag it. Put a second finger down to turn it."
        buttonLabel="Cancel"
        onClose={() => setLawnMenu(null)}
        action={{ label: 'Delete', onPress: deleteHeldLawn, destructive: true }}
      />
      <Dialog
        visible={moveTo !== null}
        title="Move your lawn here?"
        message="The lawn areas you marked at the old address will be cleared, so you can mark the ones at the new address."
        buttonLabel="Cancel"
        onClose={keepAddress}
        action={{ label: 'Move', onPress: () => moveTo && moveLawn(moveTo) }}
      />
      <Dialog visible={notice !== null} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
    </Artboard>
  );
}

/** Lawnalyze-green ring around the pencil tool while drawing (drawn behind its white circle). */
function ActiveRing({ x, y, size }: { x: number; y: number; size: number }) {
  const pad = 3.5;
  const rect = useRect({ x: x - pad, y: y - pad }, size + pad * 2, size + pad * 2);
  return <View pointerEvents="none" style={[rect, { borderRadius: rect.width / 2, backgroundColor: GREEN }]} />;
}
