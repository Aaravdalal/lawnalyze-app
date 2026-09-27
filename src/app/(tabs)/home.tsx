import { useAppState } from '@/lib/app-state';
import { useFocusCount } from '@/lib/use-focus-count';
import { formatSquareFeet, outlineSquareFeet } from '@/lib/area';
import { useWeather } from '@/lib/weather';
import { Artboard, TAB_CHIN_DROP, Layer } from '@/ui/Artboard';
import { ui } from '@/ui/assets';
import { DesignText } from '@/ui/DesignText';
import { SatelliteSlot } from '@/ui/SatelliteSlot';
import { WeatherWidget } from '@/ui/WeatherWidget';

const { common, home } = ui;

// Lawnalyze UI (4)/(17). Live weather for the lawn's city, marked lawn areas; the water/cost
// boxes stay empty until that data is wired up.
export default function HomeScreen() {
  // Each time this tab is shown, have the map reload any tiles it lost while hidden.
  const focusCount = useFocusCount();
  const { lawn, outlines } = useAppState();
  const weather = useWeather(lawn);

  return (
    <Artboard
      cardBottom={568}
      footer={common.footerGreenTabs}
      compactChin={TAB_CHIN_DROP}
      glows={[
        { asset: common.glowWide, x: 18, y: 135 },
        { asset: common.glow, x: -121, y: 33 },
        { asset: common.glow, x: -42, y: 207 },
        { asset: common.glow, x: -115, y: -114 },
        { asset: common.glow, x: -110, y: -107 },
      ]}
    >
      <Layer asset={common.logoSmall} x={23} y={23} />

      {/* Live text in place of the "Weather in Sunnyvale:" export so the city matches the lawn. */}
      <DesignText x={24} y={75} w={300} h={22} size={16} weight="medium">
        Weather in {lawn?.city || 'your area'}:
      </DesignText>
      <Layer asset={home.textRainHint} x={35} y={101} />
      <Layer asset={home.boxWeather} x={25} y={134} />
      <WeatherWidget x={25} y={134} w={286} h={85} weather={weather} />

      <Layer asset={home.titleSquareFootage} x={25} y={236} />
      {[264, 346].map((y, i) => (
        <LawnBox key={y} y={y} squareFeet={outlines[i] ? outlineSquareFeet(outlines[i]) : null} />
      ))}
      <SatelliteSlot x={152} y={263} w={159} h={151} radius={20} bordered center={lawn} zoom={18} outlines={outlines} showPin={false} refreshToken={focusCount} />

      <Layer asset={home.titleWaterAndCost} x={23} y={432} />
      <Layer asset={common.box160x85} x={22} y={464} />
      <Layer asset={common.box115x85} x={195} y={464} />
    </Artboard>
  );
}

/** One of the two "Square footage of your lawn(s)" boxes; filled once that lawn area is marked. */
function LawnBox({ y, squareFeet }: { y: number; squareFeet: number | null }) {
  return (
    <>
      <Layer asset={home.boxLawn} x={22} y={y} />
      {squareFeet !== null && (
        <>
          <DesignText x={36} y={y + 14} w={100} h={24} size={20}>
            {formatSquareFeet(squareFeet)}
          </DesignText>
          <Layer asset={home.labelSquareFeet} x={36} y={y + 42} />
        </>
      )}
    </>
  );
}
