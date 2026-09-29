import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppState } from '@/lib/app-state';
import { geocodeAddress, reverseGeocode, type AddressQuery } from '@/lib/geocode';
import { distanceMeters, getDeviceLocation, type LatLng } from '@/lib/location';
import { AddressFields } from '@/ui/AddressFields';
import { Artboard, BUTTON_GROW, Layer, PressableLayer, useFrame } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { Dialog } from '@/ui/Dialog';
import { LoaderMorphing } from '@/ui/LoaderMorphing';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, locate } = ui;

// The card on this screen is taller than in Figma (shorter green chin), so the content is
// moved down and spread out by these design-pt amounts.
const SHIFT = { header: 8, address: 16, cityState: 26, map: 36 };

type Located = { query: AddressQuery; spot: LatLng };

const EMPTY_QUERY: AddressQuery = { address: '', city: '', state: '' };
/** Editing a saved lawn from closer than this (meters), you're at it: keep its saved address. */
const AT_SAVED_LAWN_M = 150;

const trimmed = (form: AddressQuery): AddressQuery => ({
  address: form.address.trim(),
  city: form.city.trim(),
  state: form.state.trim(),
});

const sameQuery = (a: AddressQuery, b: AddressQuery) =>
  a.address.toLowerCase() === b.address.toLowerCase() &&
  a.city.toLowerCase() === b.city.toLowerCase() &&
  a.state.toLowerCase() === b.state.toLowerCase();

// Lawnalyze UI (1).zip
export default function LocateScreen() {
  const { lawn, setLawn } = useAppState();
  const [form, setForm] = useState<AddressQuery>({
    address: lawn?.address ?? '',
    city: lawn?.city ?? '',
    state: lawn?.state ?? '',
  });
  // The address the map is showing (with its blue marker), once one is known. Even with a saved
  // lawn it starts empty: the map waits to learn where the phone is, then flies just once, to
  // wherever it should be (rather than to the saved lawn and then on to the phone).
  const [located, setLocated] = useState<Located | null>(null);
  const [searching, setSearching] = useState(false);
  // A problem finding the address, shown in the app's rounded dialog.
  const [notice, setNotice] = useState<{ title: string; message: string } | null>(null);
  const notify = (title: string, message: string) => setNotice({ title, message });
  // Latest form, for the async location lookup below.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  // With location permission, go to where the phone is and fill in that address. Editing a
  // saved lawn, that happens only if you're somewhere else: standing at the lawn, its saved
  // address stays. Without permission, the user types their address and taps Find My Lawn.
  const [savedLawn] = useState(lawn);
  useEffect(() => {
    let active = true;
    const opened = trimmed(formRef.current);
    // Don't overwrite anything the user has typed since the screen opened.
    const untouched = () => sameQuery(trimmed(formRef.current), opened);
    (async () => {
      const spot = await getDeviceLocation();
      if (!active) return;
      // No location, the user is typing a different address, or they're at the saved lawn:
      // show the saved lawn (if any).
      if (!spot || !untouched() || (savedLawn && distanceMeters(spot, savedLawn) < AT_SAVED_LAWN_M)) {
        if (savedLawn) {
          const { address, city, state } = savedLawn;
          setLocated((current) => current ?? { query: { address, city, state }, spot: savedLawn });
        }
        return;
      }
      // The map goes there right away; the address follows once it's looked up. (Until then
      // the boxes may still show the saved address, which doesn't match this spot.)
      setLocated({ query: savedLawn ? EMPTY_QUERY : opened, spot });
      const address = await reverseGeocode(spot).catch(() => null);
      if (!active || !address || !untouched()) return;
      setForm(address);
      setLocated({ query: address, spot });
    })();
    return () => {
      active = false;
    };
  }, [savedLawn]);

  async function findMyLawn() {
    if (searching) return;
    const query = trimmed(form);
    if (!query.address) {
      notify('Enter your address', 'Type the street address of your lawn, then tap Find My Lawn.');
      return;
    }

    // The map already shows this address: continue to marking the lawn.
    if (located && sameQuery(located.query, query)) {
      setLawn({ ...query, ...located.spot });
      router.push('/onboarding/mark');
      return;
    }

    // A new address: fly the map there and drop the marker. Tapping again continues.
    setSearching(true);
    try {
      const spot = await geocodeAddress(query);
      if (!spot) {
        notify("We couldn't find that address", 'Check the street, city and state, then try again.');
        return;
      }
      setLocated({ query, spot });
    } catch {
      notify("Couldn't reach the map service", 'Check your internet connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  return (
    <Artboard
      cardBottom={548}
      compactChin
      glows={[
        { asset: common.glow, x: -169, y: 0 },
        { asset: common.glow, x: 8, y: 21 },
        { asset: common.glow, x: 26, y: -133 },
      ]}
    >
      <Layer asset={locate.iconLocate} x={32} y={24 + SHIFT.header} />
      <Layer asset={locate.titleLocateYourLawn} x={76} y={33 + SHIFT.header} />
      <AddressFields
        value={form}
        onChange={setForm}
        onSubmit={findMyLawn}
        shift={{ address: SHIFT.address, cityState: SHIFT.cityState }}
      />
      <SatelliteSlot
        x={24}
        y={225 + SHIFT.map}
        w={292}
        h={292}
        radius={44}
        center={located?.spot ?? null}
        zoom={19}
        interactive
        showPin
        flyIn
      />
      <PressableLayer
        asset={locate.btnFindMyLawn}
        grow={BUTTON_GROW}
        x={49}
        y={0}
        anchor="chin"
        label="Find My Lawn"
        disabled={searching}
        onPress={findMyLawn}
      >
        {searching && <ButtonSpinner />}
      </PressableLayer>
      <Dialog visible={notice !== null} title={notice?.title ?? ''} message={notice?.message} onClose={() => setNotice(null)} />
    </Artboard>
  );
}

/** While the address is being looked up: the white morphing loader, in the button's right end. */
function ButtonSpinner() {
  const { scale } = useFrame();
  return (
    <View pointerEvents="none" style={[styles.spinner, { right: 16 * scale }]}>
      <LoaderMorphing size={17 * scale} color="#fff" />
    </View>
  );
}

const styles = StyleSheet.create({
  spinner: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
});
