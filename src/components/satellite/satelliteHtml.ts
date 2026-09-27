import type { Outline } from '@/lib/app-state';
import type { LatLng } from '@/lib/location';

// Leaflet with Google Maps satellite + labels (hybrid) tiles, same as the Lawnalyze website.
// Note: these tiles are loaded without an API key, which Google's terms don't allow; if Google
// ever blocks them, switch to the Google Maps API with a key.
const LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4';
// scale=2: 512px tiles drawn at 256px, so imagery and labels are sharp on phone screens.
const GOOGLE_HYBRID_TILES = 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&scale=2';
const ATTRIBUTION = '&copy; Google Maps Satellite';

// Shown until the user's location is known.
const US_OVERVIEW = { latitude: 39.5, longitude: -98.35, zoom: 3 };

// Blue map pin marking the lawn's house.
const PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="40" viewBox="0 0 26 40">' +
  '<path d="M13 1C6.4 1 1 6.4 1 13c0 9.5 12 26 12 26s12-16.5 12-26C25 6.4 19.6 1 13 1z" fill="#2A81CB" stroke="#1B5E96" stroke-width="1.5"/>' +
  '<circle cx="13" cy="13" r="4.5" fill="#fff"/></svg>';

export type SatelliteOptions = {
  center: LatLng | null;
  zoom: number;
  interactive: boolean;
  /** Corner radius in dp; the page clips itself because Android WebViews ignore parent clipping. */
  cornerRadius: number;
  /** Lawn outlines to draw when the page loads. */
  outlines: Outline[];
  /** Lets the user draw and reshape outlines (the Mark your Lawn screen). */
  editable: boolean;
  /** Blue pin on the house (only while locating; hidden once the lawn is found). */
  showPin: boolean;
  /** Start zoomed out and fly in to `center` (the Locate screen); otherwise open right on it. */
  flyIn: boolean;
};

export type MapTool = 'draw' | 'add' | 'delete';

/** Commands the app sends to the page. */
export type MapCommand =
  | ({ type: 'flyTo' } & LatLng & { zoom: number })
  | { type: 'tool'; tool: MapTool }
  /** The map became visible again (e.g. its tab was re-selected): re-check size, reload tiles. */
  | { type: 'refresh' };

/** Events the page sends back to the app. */
export type MapEvent = { type: 'outlines'; outlines: Outline[] } | { type: 'drawing'; drawing: boolean };

/** Tags page -> app messages on web, where other frames can post to the window too. */
export const MAP_EVENT_SOURCE = 'lawnalyze-map';

const num = (value: number) => (Number.isFinite(value) ? String(value) : '0');

export function buildSatelliteHtml({
  center,
  zoom,
  interactive,
  cornerRadius,
  outlines,
  editable,
  showPin,
  flyIn,
}: SatelliteOptions): string {
  // With a known location, open on it (or start zoomed out over it and fly in once loaded).
  const start = center ? { ...center, zoom: flyIn ? Math.max(zoom - 6, 3) : zoom } : US_OVERVIEW;
  const i = interactive ? 'true' : 'false';
  // Keep the attribution clear of the rounded corner.
  const inset = Math.round(cornerRadius * 0.45);
  const initialOutlines = JSON.stringify(
    outlines.map((outline) => outline.map((p) => [Number(p.latitude), Number(p.longitude)])),
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="preconnect" href="https://mt0.google.com" />
<link rel="preconnect" href="https://mt1.google.com" />
<link rel="preconnect" href="https://mt2.google.com" />
<link rel="preconnect" href="https://mt3.google.com" />
<link rel="stylesheet" href="${LEAFLET}/leaflet.min.css" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: transparent; }
  #map { position: absolute; inset: 0; border-radius: ${num(cornerRadius)}px; overflow: hidden; background: #2c3a30; }
  .leaflet-container .leaflet-control-attribution {
    font: 7px/1.5 sans-serif; color: #333; background: rgba(255, 255, 255, 0.6);
    padding: 0 4px; margin: 0 ${num(inset)}px ${num(Math.round(inset / 2))}px 0; border-radius: 4px;
  }
  /* Outline handles: big invisible touch targets around small visible dots. */
  .corner, .mid { box-sizing: border-box; border-radius: 50%; }
  /* Zoomed out, the lawn is a speck: hide its editing handles (and their touch areas). */
  .zoomed-out .lawn-handle { display: none; }
  .corner { width: 18px; height: 18px; margin: 6px; background: #2F6BFF; border: 3px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.45); }
  .mid { width: 14px; height: 14px; margin: 8px; background: rgba(255,255,255,.85); border: 2px solid #2F6BFF; }
</style>
</head>
<body>
<div id="map"></div>
<script src="${LEAFLET}/leaflet.min.js"></script>
<script>
(function () {
  var map = L.map('map', {
    zoomControl: false, attributionControl: false,
    // Touch feel: smooth (unsnapped) pinch zoom, longer inertia glide, no tile fade-in.
    zoomSnap: 0, zoomDelta: 0.5, inertiaDeceleration: 2200, easeLinearity: 0.25,
    fadeAnimation: false, bounceAtZoomLimits: false, tapTolerance: 20,
    dragging: ${i}, touchZoom: ${i}, scrollWheelZoom: ${i}, doubleClickZoom: false, boxZoom: false, keyboard: false,
    renderer: L.svg({ padding: 0.5 })
  });
  // Keep lawn outlines crisp and in place while zooming: by default Leaflet stretches the
  // vector layer like an image during a zoom (a blurry blue blob) and only redraws it once
  // the zoom ends. Redrawing it at each zoom step keeps the outline sharp and exactly under
  // its corner handles. (_reset is Leaflet 1.9's internal full redraw of a renderer.)
  var outlineRenderer = map.options.renderer;
  map.on('zoom', function () { if (outlineRenderer._map) outlineRenderer._reset(); });
  // Editing handles only make sense once the lawn is big enough on screen to edit.
  var HANDLES_MIN_ZOOM = 17.5;
  function updateHandleVisibility() { map.getContainer().classList.toggle('zoomed-out', map.getZoom() < HANDLES_MIN_ZOOM); }
  map.on('zoom', updateHandleVisibility);
  L.control.attribution({ prefix: false }).addTo(map);

  var tiles = L.tileLayer('${GOOGLE_HYBRID_TILES}', {
    subdomains: ['0', '1', '2', '3'], maxNativeZoom: 20, maxZoom: 21, attribution: '${ATTRIBUTION}',
    // Load tiles while panning (mobile default waits for the finger to lift) and keep
    // extra rows around the view so moving around shows imagery instantly.
    updateWhenIdle: false, updateInterval: 100, keepBuffer: 6
  }).addTo(map);

  // Keep imagery from going grey: retry tiles that fail to load (e.g. a brief refusal from the
  // tile server), and reload missing tiles when the map is resized or shown again (a hidden
  // tab gives it zero size).
  tiles.on('tileerror', function (e) {
    var tile = e.tile, tries = (tile._retries || 0) + 1;
    if (tries > 4) return;
    tile._retries = tries;
    var src = tile.src.replace(/&retry=\\w+$/, '');
    setTimeout(function () { tile.src = src + '&retry=' + tries; }, 600 * tries);
  });
  // Never while flying in (that would knock the view off-centre); catch up once it lands.
  var flying = false, refreshPending = false;
  function refresh() {
    if (flying) { refreshPending = true; return; }
    var el = map.getContainer();
    if (!el.clientWidth || !el.clientHeight) return; // hidden: wait until shown
    map.invalidateSize({ animate: false }); // keeps the same centre
    map.fire('moveend'); // makes the tile layer load anything missing for the current view
    // Tiles that broke while the map was hidden (e.g. requests dropped during a quick tab
    // switch): load them again.
    Object.keys(tiles._tiles).forEach(function (key) {
      var img = tiles._tiles[key].el;
      if (img.complete && !img.naturalWidth) {
        img._retries = 0;
        img.src = img.src.replace(/&retry=\\w+$/, '') + '&retry=r' + Date.now();
      }
    });
    if (outlineRenderer._map) outlineRenderer._reset(); // redraw the lawn outline at the new size
    el.style.transform = 'translateZ(0)'; // nudge Android WebViews to repaint
    requestAnimationFrame(function () { el.style.transform = ''; });
  }
  var lastSize = '';
  if (window.ResizeObserver) new ResizeObserver(function () {
    var el = map.getContainer(), size = el.clientWidth + 'x' + el.clientHeight;
    if (size !== lastSize) { lastSize = size; refresh(); }
  }).observe(map.getContainer());
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  // Safety net: every few seconds, repair a view that has broken or missing tiles.
  setInterval(function () {
    var el = map.getContainer();
    if (flying || document.hidden || !el.clientWidth || !el.clientHeight) return;
    var keys = Object.keys(tiles._tiles);
    var broken = !keys.length || keys.some(function (key) {
      var img = tiles._tiles[key].el;
      return img.complete && !img.naturalWidth;
    });
    if (broken) refresh();
  }, 2500);

  map.setView([${num(start.latitude)}, ${num(start.longitude)}], ${num(start.zoom)});
  updateHandleVisibility();

  function post(message) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
    else if (window.parent !== window) window.parent.postMessage(Object.assign({ source: '${MAP_EVENT_SOURCE}' }, message), '*');
  }

  // ---- House pin ----
  var pin = L.icon({
    iconUrl: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(${JSON.stringify(PIN_SVG)}),
    iconSize: [26, 40], iconAnchor: [13, 39]
  });
  var marker = null;
  var SHOW_PIN = ${showPin ? 'true' : 'false'};
  function placePin(lat, lng) {
    if (!SHOW_PIN) return;
    if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng], { icon: pin, interactive: false }).addTo(map);
  }
  function flyTo(lat, lng, zoom) {
    placePin(lat, lng);
    flying = true;
    map.once('moveend', function () {
      flying = false;
      if (refreshPending) { refreshPending = false; refresh(); }
    });
    map.flyTo([lat, lng], zoom, { duration: 2.4 });
  }

  // ---- Lawn outlines ----
  // Drawing: each tap on the map adds a corner; tapping the first corner (or the pencil) finishes.
  // The selected lawn shows handles: drag a corner to move it, drag or tap a midpoint to add one.
  var EDITABLE = ${editable ? 'true' : 'false'};
  var BLUE = '#2F6BFF';
  var lawns = [], active = null, drawing = false;
  function handleIcon(cls) { return L.divIcon({ className: 'lawn-handle', html: '<div class="' + cls + '"></div>', iconSize: [30, 30], iconAnchor: [15, 15] }); }
  var CORNER = handleIcon('corner'), MID = handleIcon('mid');

  function emit() {
    post({ type: 'outlines', outlines: lawns.filter(function (l) { return l.pts.length >= 3; }).map(function (l) {
      return l.pts.map(function (p) { return { latitude: p.lat, longitude: p.lng }; });
    }) });
  }
  function setDrawing(on) { drawing = on; post({ type: 'drawing', drawing: on }); }
  function newLawn(points) {
    var lawn = { pts: points || [], handles: [],
      shape: L.polygon([], { renderer: outlineRenderer, color: BLUE, weight: 3, fillColor: BLUE, fillOpacity: 0.2, interactive: EDITABLE }).addTo(map) };
    if (EDITABLE) lawn.shape.on('click', function (e) { L.DomEvent.stop(e); if (!drawing) select(lawn); });
    lawns.push(lawn);
    return lawn;
  }
  function clearHandles(lawn) { lawn.handles.forEach(function (h) { map.removeLayer(h); }); lawn.handles = []; }
  function redraw(lawn) {
    lawn.shape.setLatLngs(lawn.pts);
    clearHandles(lawn);
    if (!EDITABLE || lawn !== active) return;
    var n = lawn.pts.length;
    // Midpoint handles (the closing edge too, once it's a polygon).
    for (var e = 0; e < (n >= 3 ? n : n - 1); e++) (function (i) {
      var a = lawn.pts[i], b = lawn.pts[(i + 1) % n], inserted = false;
      var m = L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { icon: MID, draggable: true, zIndexOffset: 900 }).addTo(map);
      m.on('dragstart', function () { lawn.pts.splice(i + 1, 0, m.getLatLng()); inserted = true; });
      m.on('drag', function () { lawn.pts[i + 1] = m.getLatLng(); lawn.shape.setLatLngs(lawn.pts); });
      m.on('dragend', function () { redraw(lawn); emit(); });
      m.on('click', function (ev) { L.DomEvent.stop(ev); if (!inserted) { lawn.pts.splice(i + 1, 0, m.getLatLng()); redraw(lawn); emit(); } });
      lawn.handles.push(m);
    })(e);
    lawn.pts.forEach(function (p, i) {
      var h = L.marker(p, { icon: CORNER, draggable: true, zIndexOffset: 1000 }).addTo(map);
      h.on('drag', function () { lawn.pts[i] = h.getLatLng(); lawn.shape.setLatLngs(lawn.pts); });
      h.on('dragend', function () { redraw(lawn); emit(); });
      h.on('click', function (ev) { L.DomEvent.stop(ev); if (drawing && i === 0 && lawn.pts.length >= 3) finish(); });
      lawn.handles.push(h);
    });
  }
  function select(lawn) { var previous = active; active = lawn; if (previous && previous !== lawn) redraw(previous); if (lawn) redraw(lawn); }
  function removeLawn(lawn) {
    clearHandles(lawn); map.removeLayer(lawn.shape);
    lawns.splice(lawns.indexOf(lawn), 1);
    if (active === lawn) active = null;
  }
  function finish() {
    if (active && active.pts.length < 3) removeLawn(active); // too few corners to be an area
    setDrawing(false);
    if (active) redraw(active);
    emit();
  }
  function startNew() { if (drawing) finish(); select(newLawn()); setDrawing(true); }

  map.on('click', function (e) {
    if (!drawing || !active) return;
    active.pts.push(e.latlng); redraw(active); emit();
  });

  function useTool(tool) {
    if (!EDITABLE) return;
    if (tool === 'draw') {
      if (drawing) finish();
      else if (active) setDrawing(true); // keep adding corners to the selected lawn
      else startNew();
    } else if (tool === 'add') {
      startNew();
    } else if (tool === 'delete') {
      var target = active || lawns[lawns.length - 1];
      if (target) removeLawn(target);
      setDrawing(false);
      select(lawns[lawns.length - 1] || null);
      emit();
    }
  }

  ${initialOutlines}.forEach(function (points) {
    newLawn(points.map(function (p) { return L.latLng(p[0], p[1]); }));
  });
  lawns.forEach(redraw);
  if (EDITABLE) {
    if (lawns.length) select(lawns[lawns.length - 1]);
    else startNew(); // nothing marked yet: start drawing straight away
  }

  // ---- Commands from the app ----
  function command(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
    if (!data || data.source === '${MAP_EVENT_SOURCE}') return;
    if (data.type === 'flyTo') flyTo(data.latitude, data.longitude, data.zoom);
    else if (data.type === 'tool') useTool(data.tool);
    else if (data.type === 'refresh') refresh();
  }
  window.lawnalyzeCommand = command;
  window.addEventListener('message', function (event) { command(event.data); });
  ${
    !center
      ? ''
      : flyIn
        ? `setTimeout(function () { flyTo(${num(center.latitude)}, ${num(center.longitude)}, ${num(zoom)}); }, 350);`
        : `placePin(${num(center.latitude)}, ${num(center.longitude)});`
  }
})();
</script>
</body>
</html>`;
}
