import { MAX_LAWNS, type Outline } from '@/lib/app-state';
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
  /**
   * Open zoomed to fit the outlines (when there are any), keeping this much room (dp) clear on
   * each side, e.g. for the drawing tools over the map's left edge.
   */
  fitInsets?: Insets;
};

export type Insets = { left: number; top: number; right: number; bottom: number };

/** The drawing tools, plus `clear`: the lawn moved to a new address, so start over there. */
export type MapTool = 'draw' | 'add' | 'delete' | 'clear';

/** Commands the app sends to the page. */
export type MapCommand =
  | ({ type: 'flyTo' } & LatLng & { zoom: number })
  /** `lawn`: with delete, which lawn (its index among the outlines); otherwise the selected one. */
  | { type: 'tool'; tool: MapTool; lawn?: number }
  /** The map became visible again (e.g. its tab was re-selected): re-check size, reload tiles. */
  | { type: 'refresh' };

/** Events the page sends back to the app. */
export type MapEvent =
  | { type: 'outlines'; outlines: Outline[] }
  | { type: 'drawing'; drawing: boolean }
  /** Tried to start another lawn area with MAX_LAWNS already marked. */
  | { type: 'limit' }
  /** A lawn was pressed and held without moving: offer to delete it (index among the outlines). */
  | { type: 'lawnMenu'; index: number }
  /** Something to feel: a corner placed (light), a shape closed or a lawn picked up (medium). */
  | { type: 'haptic'; style: 'light' | 'medium' };

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
  fitInsets,
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
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #2c3a30; }
  #map { position: absolute; inset: 0; border-radius: ${num(cornerRadius)}px; overflow: hidden; background: transparent; }
  .leaflet-container .leaflet-control-attribution {
    font: 7px/1.5 sans-serif; color: #333; background: rgba(255, 255, 255, 0.6);
    padding: 0 4px; margin: 0 ${num(inset)}px ${num(Math.round(inset / 2))}px 0; border-radius: 4px;
  }
  /* Outline handles: big invisible touch targets (40px) around small visible dots. */
  .corner, .mid { box-sizing: border-box; border-radius: 50%; }
  /* Zoomed out, the lawn is a speck: hide its editing handles (and their touch areas). */
  .zoomed-out .lawn-handle { display: none; }
  .corner { width: 18px; height: 18px; margin: 11px; background: #2F6BFF; border: 3px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.45); }
  .mid { width: 14px; height: 14px; margin: 13px; background: rgba(255,255,255,.85); border: 2px solid #2F6BFF; }
  /* Corners placed while drawing; the first one pulses once tapping it would close the shape. */
  .dot { box-sizing: border-box; border-radius: 50%; width: 12px; height: 12px; margin: 14px; background: #2F6BFF; border: 2.5px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.45); }
  .dot.first { width: 16px; height: 16px; margin: 12px; }
  .dot.first.ready { width: 22px; height: 22px; margin: 9px; background: #fff; border: 4px solid #2F6BFF; animation: close-me 1.1s ease-out infinite; }
  @keyframes close-me { 0% { box-shadow: 0 0 0 0 rgba(47,107,255,.6); } 100% { box-shadow: 0 0 0 14px rgba(47,107,255,0); } }
  /* A lawn picked up (press and hold) to move. */
  .leaflet-interactive.lawn-lifted { fill-opacity: .38; stroke-width: 4px; filter: drop-shadow(0 6px 8px rgba(0,0,0,.45)); }
  body { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
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
    // A tap still counts (adds a corner) if the finger shifts a little; Leaflet's default of 3px
    // is for a mouse, and made taps on a phone often turn into tiny drags that do nothing.
    clickTolerance: 10,
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
  // Drawing: tap to place corners; a dashed blue line joins them in order. Once there are three,
  // the first corner pulses: tap it to close the shape, which then fills in. (The pencil also
  // closes it.) A finished lawn: tap it to reshape it (drag a corner; drag a midpoint to add
  // one). Press and hold it to delete it, or hold and drag to move the whole lawn.
  var EDITABLE = ${editable ? 'true' : 'false'};
  var BLUE = '#2F6BFF';
  var MAX_LAWNS = ${MAX_LAWNS};
  var CLOSE_RADIUS = 28; // px: a tap this close to the first corner closes the shape
  var HOLD_MS = 420; // press this long on a lawn to pick it up
  var HOLD_SLOP = 10; // px the finger may drift before the press counts as panning the map
  var lawns = [], active = null, drawing = null; // active: the lawn being reshaped; drawing: the one being drawn
  function handleIcon(cls) { return L.divIcon({ className: 'lawn-handle', html: '<div class="' + cls + '"></div>', iconSize: [40, 40], iconAnchor: [20, 20] }); }
  function dotIcon(cls) { return L.divIcon({ className: 'lawn-dot', html: '<div class="' + cls + '"></div>', iconSize: [40, 40], iconAnchor: [20, 20] }); }
  var CORNER = handleIcon('corner'), MID = handleIcon('mid');
  var DOT = dotIcon('dot'), FIRST = dotIcon('dot first'), FIRST_READY = dotIcon('dot first ready');

  function closedLawns() { return lawns.filter(function (l) { return l.closed; }); }
  function emit() {
    post({ type: 'outlines', outlines: closedLawns().map(function (l) {
      return l.pts.map(function (p) { return { latitude: p.lat, longitude: p.lng }; });
    }) });
  }
  function haptic(style) { post({ type: 'haptic', style: style }); }
  function setDrawing(lawn) { drawing = lawn; post({ type: 'drawing', drawing: !!lawn }); }

  function newLawn(points, closed) {
    var lawn = {
      pts: points, closed: closed, handles: [], mids: [],
      shape: L.polygon([], { renderer: outlineRenderer, color: BLUE, weight: 3, fillColor: BLUE, fillOpacity: 0.2, interactive: EDITABLE }),
      line: L.polyline([], { renderer: outlineRenderer, color: BLUE, weight: 3, dashArray: '8 8', lineCap: 'round', interactive: false })
    };
    if (EDITABLE) {
      lawn.shape.on('click', function (e) {
        L.DomEvent.stop(e);
        if (takeSuppressedClick()) return;
        if (drawing) drawTap(e.latlng, e.containerPoint); // drawing a new lawn over this one
        else select(lawn);
      });
      // Its SVG element is made each time it's added to the map.
      lawn.shape.on('add', function () {
        lawn.shape.getElement().addEventListener('pointerdown', function (ev) { holdStart(lawn, ev); });
      });
    }
    lawns.push(lawn);
    return lawn;
  }
  function clearHandles(lawn) { lawn.handles.forEach(function (h) { map.removeLayer(h); }); lawn.handles = []; lawn.mids = []; }
  function midpoint(a, b) { return L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2); }
  // While a corner is dragged, the midpoint handles next to it follow along.
  function moveMids(lawn) {
    var n = lawn.pts.length;
    lawn.mids.forEach(function (m, i) { m.setLatLng(midpoint(lawn.pts[i], lawn.pts[(i + 1) % n])); });
  }
  function render(lawn) {
    clearHandles(lawn);
    if (!lawn.closed) {
      // Being drawn: the corners so far, joined by a dashed line.
      if (map.hasLayer(lawn.shape)) map.removeLayer(lawn.shape);
      lawn.line.setLatLngs(lawn.pts);
      if (!map.hasLayer(lawn.line)) lawn.line.addTo(map);
      lawn.pts.forEach(function (p, i) {
        var icon = i > 0 ? DOT : lawn.pts.length >= 3 ? FIRST_READY : FIRST;
        lawn.handles.push(L.marker(p, { icon: icon, interactive: false, zIndexOffset: i === 0 ? 1000 : 900 }).addTo(map));
      });
      return;
    }
    if (map.hasLayer(lawn.line)) map.removeLayer(lawn.line);
    lawn.shape.setLatLngs(lawn.pts);
    if (!map.hasLayer(lawn.shape)) lawn.shape.addTo(map);
    if (!EDITABLE || lawn !== active) return;
    // Reshaping: drag a corner to move it; drag a midpoint to add a corner there.
    var n = lawn.pts.length;
    lawn.pts.forEach(function (p, i) {
      var a = p, b = lawn.pts[(i + 1) % n], added = false;
      var m = L.marker(midpoint(a, b), { icon: MID, draggable: true, zIndexOffset: 900 }).addTo(map);
      m.on('dragstart', function () { lawn.pts.splice(i + 1, 0, m.getLatLng()); added = true; });
      m.on('drag', function () { if (added) { lawn.pts[i + 1] = m.getLatLng(); lawn.shape.setLatLngs(lawn.pts); } });
      m.on('dragend', function () { render(lawn); emit(); });
      lawn.handles.push(m);
      lawn.mids.push(m);
    });
    lawn.pts.forEach(function (p, i) {
      var h = L.marker(p, { icon: CORNER, draggable: true, zIndexOffset: 1000 }).addTo(map);
      h.on('drag', function () { lawn.pts[i] = h.getLatLng(); lawn.shape.setLatLngs(lawn.pts); moveMids(lawn); });
      h.on('dragend', function () { render(lawn); emit(); });
      lawn.handles.push(h);
    });
  }
  function select(lawn) {
    var previous = active;
    active = lawn;
    if (previous && previous !== lawn) render(previous);
    if (lawn) render(lawn);
  }
  function removeLawn(lawn) {
    clearHandles(lawn);
    if (map.hasLayer(lawn.shape)) map.removeLayer(lawn.shape);
    if (map.hasLayer(lawn.line)) map.removeLayer(lawn.line);
    lawns.splice(lawns.indexOf(lawn), 1);
    if (active === lawn) active = null;
    if (drawing === lawn) setDrawing(null);
  }

  // ---- Drawing ----
  function drawTap(latlng, point) {
    var pts = drawing.pts;
    if (pts.length >= 3 && map.latLngToContainerPoint(pts[0]).distanceTo(point) <= CLOSE_RADIUS) { closeShape(); return; }
    pts.push(latlng);
    render(drawing);
    haptic('light');
  }
  function closeShape() {
    var lawn = drawing;
    lawn.closed = true;
    setDrawing(null);
    select(lawn);
    emit();
    haptic('medium');
  }
  // Pencil pressed while drawing: close the shape, or drop it if it has too few corners.
  function stopDrawing() {
    if (!drawing) return;
    if (drawing.pts.length >= 3) closeShape();
    else removeLawn(drawing);
  }
  function startNew() {
    stopDrawing();
    if (lawns.length >= MAX_LAWNS) { post({ type: 'limit' }); return; }
    select(null);
    var lawn = newLawn([], false);
    setDrawing(lawn);
    render(lawn);
  }
  map.on('click', function (e) {
    if (takeSuppressedClick()) return;
    if (drawing) drawTap(e.latlng, e.containerPoint);
    else if (active) select(null); // a tap off the lawn puts its handles away
  });

  // ---- Hold a lawn: delete it, or drag it somewhere else ----
  var hold = null, suppressClick = false;
  // A hold ends with a click from the browser; it shouldn't also count as a tap.
  function takeSuppressedClick() { var was = suppressClick; suppressClick = false; return was; }
  function holdStart(lawn, ev) {
    if (drawing || hold || !ev.isPrimary) return;
    hold = {
      lawn: lawn, id: ev.pointerId, start: map.mouseEventToContainerPoint(ev), lifted: false, moved: false,
      from: lawn.pts.map(function (p) { return map.latLngToContainerPoint(p); })
    };
    hold.timer = setTimeout(lift, HOLD_MS);
  }
  function lift() {
    hold.lifted = true;
    suppressClick = true;
    select(null);
    clearHandles(hold.lawn);
    L.DomUtil.addClass(hold.lawn.shape.getElement(), 'lawn-lifted');
    haptic('medium');
  }
  function endHold() {
    clearTimeout(hold.timer);
    if (hold.lifted && hold.lawn.shape.getElement()) L.DomUtil.removeClass(hold.lawn.shape.getElement(), 'lawn-lifted');
    hold = null;
  }
  // Captured on the window, ahead of the map: once a lawn is picked up, the finger moves the
  // lawn, not the map.
  window.addEventListener('pointermove', function (ev) {
    if (!hold || ev.pointerId !== hold.id) return;
    var p = map.mouseEventToContainerPoint(ev);
    if (!hold.lifted) {
      if (p.distanceTo(hold.start) > HOLD_SLOP) endHold(); // moving right away: it's a pan
      return;
    }
    ev.stopPropagation();
    var dx = p.x - hold.start.x, dy = p.y - hold.start.y;
    if (!hold.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    hold.moved = true;
    hold.lawn.pts = hold.from.map(function (o) { return map.containerPointToLatLng(L.point(o.x + dx, o.y + dy)); });
    hold.lawn.shape.setLatLngs(hold.lawn.pts);
  }, true);
  ['touchmove', 'mousemove'].forEach(function (type) {
    window.addEventListener(type, function (ev) { if (hold && hold.lifted) ev.stopPropagation(); }, true);
  });
  function holdEnd(ev) {
    if (!hold || ev.pointerId !== hold.id) return;
    var h = hold;
    endHold();
    if (!h.lifted) return;
    if (h.moved) { select(h.lawn); emit(); }
    else post({ type: 'lawnMenu', index: closedLawns().indexOf(h.lawn) }); // held still: offer to delete it
  }
  window.addEventListener('pointerup', holdEnd, true);
  window.addEventListener('pointercancel', holdEnd, true);
  // A second finger (pinch zoom) cancels a hold that hasn't picked the lawn up yet.
  window.addEventListener('pointerdown', function (ev) { if (hold && !hold.lifted && ev.pointerId !== hold.id) endHold(); }, true);
  document.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

  function useTool(tool, index) {
    if (!EDITABLE) return;
    if (tool === 'draw') {
      if (drawing) stopDrawing();
      else startNew();
    } else if (tool === 'add') {
      startNew();
    } else if (tool === 'delete') {
      // A given lawn (from its hold menu), or else the one being drawn or reshaped, or the last.
      var target = index !== undefined ? closedLawns()[index] : drawing || active || lawns[lawns.length - 1];
      if (!target) return;
      removeLawn(target);
      emit();
      haptic('medium');
    } else if (tool === 'clear') {
      // The lawns marked at the old address go, and drawing starts again at the new one.
      lawns.slice().forEach(removeLawn);
      emit();
      startNew();
    }
  }

  ${initialOutlines}.forEach(function (points) {
    newLawn(points.map(function (p) { return L.latLng(p[0], p[1]); }), true);
  });
  lawns.forEach(render);
  ${
    fitInsets && outlines.length
      ? `// Open on the whole of every marked lawn, clear of the tools.
  map.fitBounds(L.featureGroup(lawns.map(function (l) { return l.shape; })).getBounds(), {
    paddingTopLeft: [${num(fitInsets.left)}, ${num(fitInsets.top)}],
    paddingBottomRight: [${num(fitInsets.right)}, ${num(fitInsets.bottom)}],
    maxZoom: 20.5, animate: false
  });
  updateHandleVisibility();`
      : ''
  }
  // Nothing marked yet: start drawing straight away.
  if (EDITABLE && !lawns.length) startNew();

  // ---- Commands from the app ----
  function command(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return; } }
    if (!data || data.source === '${MAP_EVENT_SOURCE}') return;
    if (data.type === 'flyTo') flyTo(data.latitude, data.longitude, data.zoom);
    else if (data.type === 'tool') useTool(data.tool, data.lawn);
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
