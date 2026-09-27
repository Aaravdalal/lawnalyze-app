import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { useAppState } from '@/lib/app-state';
import { geocodeAddress, reverseGeocode, type AddressQuery } from '@/lib/geocode';
import { getDeviceLocation, type LatLng } from '@/lib/location';
import { notify } from '@/lib/notify';
import { AddressFields } from '@/ui/AddressFields';
import { Artboard, BUTTON_GROW, Layer, PressableLayer, useFrame } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { SatelliteSlot } from '@/ui/SatelliteSlot';

const { common, locate } = ui;

// The card on this screen is taller than in Figma (shorter green chin), so the content is
// moved down and spread out by these design-pt amounts.
const SHIFT = { header: 8, address: 16, cityState: 26, map: 36 };

type Located = { query: AddressQuery; spot: LatLng };

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
  // The address the map is showing (with its blue marker), once one is known.
  const [located, setLocated] = useState<Located | null>(
    lawn ? { query: { address: lawn.address, city: lawn.city, state: lawn.state }, spot: lawn } : null,
  );
  const [searching, setSearching] = useState(false);
  // Latest form, for the async location lookup below.
  const formRef = useRef(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  // With location permission, find the user's house and fill in the form for them.
  // Without it, the user types their address and taps Find My Lawn.
  useEffect(() => {
    if (lawn) return; // Editing an existing lawn: keep its saved address.
    let active = true;
    (async () => {
      const spot = await getDeviceLocation();
      if (!active || !spot) return;
      setLocated({ query: trimmed(formRef.current), spot });
      const address = await reverseGeocode(spot).catch(() => null);
      // Don't overwrite anything the user has started typing.
      if (!active || !address || Object.values(trimmed(formRef.current)).some(Boolean)) return;
      setForm(address);
      setLocated({ query: address, spot });
    })();
    return () => {
      active = false;
    };
  }, [lawn]);

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
      footer={common.footerGreen}
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
    </Artboard>
  );
}

function ButtonSpinner() {
  const { scale } = useFrame();
  return <ActivityIndicator color="#fff" style={[styles.spinner, { right: 18 * scale }]} />;
}

const styles = StyleSheet.create({
  spinner: { position: 'absolute', top: 0, bottom: 0 },
});
