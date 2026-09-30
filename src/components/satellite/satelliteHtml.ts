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

/** Lawn outlines and their corners (StaticSatellite draws them in it too). */
export const LAWN_BLUE = '#0B5CFF';
/** How strongly a lawn's area is tinted with it. */
export const LAWN_FILL_OPACITY = 0.25;

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
  /* A lawn's corners (placed while drawing, or dragged to reshape) are solid blue dots with a
     white ring. The reshaping handles sit in big invisible touch targets (40px). */
  .corner { box-sizing: border-box; border-radius: 50%; width: 18px; height: 18px; margin: 11px; background: ${LAWN_BLUE}; border: 3px solid #fff; box-shadow: 0 1px 2px rgba(0,0,0,.2); }
  /* Zoomed out, the lawn is a speck: hide its editing handles (and their touch areas). */
  .zoomed-out .lawn-handle { display: none; }
  /* A lawn picked up (press and hold) to move. */
  .leaflet-interactive.lawn-lifted { fill-opacity: .38; stroke-width: 5px; filter: drop-shadow(0 6px 8px rgba(0,0,0,.45)); }
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
  // How long (s) a flight takes: flying in from far out (e.g. the whole US, or another town), and
  // hopping over to somewhere close by (e.g. the phone's newer position a few houses over).
  var FLY_S = 1.6, HOP_S = 0.8;
  // The imagery where a flight lands starts loading as it takes off, so it lands on a sharp
  // picture: the map's own requests for those tiles then come straight from the cache. (Same
  // tiles and addresses the tile layer works out for that view.)
  var landing = [];
  function preload(lat, lng, zoom) {
    var z = Math.min(tiles.options.maxNativeZoom, Math.round(zoom));
    var half = map.getSize().divideBy(2 * Math.pow(2, zoom - z));
    var middle = map.project([lat, lng], z).floor();
    var min = middle.subtract(half).divideBy(256).floor();
    var max = middle.add(half).divideBy(256).ceil().subtract([1, 1]);
    landing = [];
    for (var x = min.x; x <= max.x; x++) {
      for (var y = min.y; y <= max.y; y++) {
        var img = new Image();
        img.src = L.Util.template('${GOOGLE_HYBRID_TILES}', { s: String(Math.abs(x + y) % 4), x: x, y: y, z: z });
        landing.push(img);
      }
    }
  }
  function flyTo(lat, lng, zoom) {
    placePin(lat, lng);
    preload(lat, lng, zoom);
    var far = map.getZoom() < zoom - 2 || map.distance(map.getCenter(), [lat, lng]) > 1500;
    flying = true;
    map.once('moveend', function () {
      flying = false;
      if (refreshPending) { refreshPending = false; refresh(); }
    });
    map.flyTo([lat, lng], zoom, { duration: far ? FLY_S : HOP_S });
  }

  // ---- Lawn outlines ----
  // Drawing: tap to place corners; a solid blue line joins them in order, and from the third
  // one the area they close in is filled. Tap the first corner (or the pencil) to finish, which
  // draws the last side. A finished lawn: tap it to reshape it (drag a corner). Press and hold
  // it to delete it, or hold and drag to move the whole lawn (with a second finger, to turn it).
  var EDITABLE = ${editable ? 'true' : 'false'};
  var BLUE = '${LAWN_BLUE}';
  var MAX_LAWNS = ${MAX_LAWNS};
  var CLOSE_RADIUS = 28; // px: a tap this close to the first corner closes the shape
  var HOLD_MS = 420; // press this long on a lawn to pick it up
  var HOLD_SLOP = 10; // px the finger may drift before the press counts as panning the map
  var lawns = [], active = null, drawing = null; // active: the lawn being reshaped; drawing: the one being drawn
  var CORNER = L.divIcon({ className: 'lawn-handle', html: '<div class="corner"></div>', iconSize: [40, 40], iconAnchor: [20, 20] });
  // Corners placed while drawing look the same, but can't be dragged yet.
  var DOT = L.divIcon({ className: 'lawn-dot', html: '<div class="corner"></div>', iconSize: [40, 40], iconAnchor: [20, 20] });

  // The lawns that count (and are saved): the finished ones, and one being drawn once it has
  // three corners, since its area already shows.
  function countedLawns() { return lawns.filter(function (l) { return l.closed || l.pts.length >= 3; }); }
  function emit() {
    post({ type: 'outlines', outlines: countedLawns().map(function (l) {
      return l.pts.map(function (p) { return { latitude: p.lat, longitude: p.lng }; });
    }) });
  }
  function haptic(style) { post({ type: 'haptic', style: style }); }
  function setDrawing(lawn) { drawing = lawn; post({ type: 'drawing', drawing: !!lawn }); }

  function newLawn(points, closed) {
    var lawn = {
      pts: points, closed: closed, handles: [],
      shape: L.polygon([], { renderer: outlineRenderer, color: BLUE, weight: 4, lineJoin: 'round', fillColor: BLUE, fillOpacity: ${LAWN_FILL_OPACITY}, interactive: EDITABLE }),
      line: L.polyline([], { renderer: outlineRenderer, color: BLUE, weight: 4, lineCap: 'round', lineJoin: 'round', interactive: false })
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
  function clearHandles(lawn) { lawn.handles.forEach(function (h) { map.removeLayer(h); }); lawn.handles = []; }
  function render(lawn) {
    clearHandles(lawn);
    // Being drawn, the area has no line back to the first corner yet: only the finished lawn does.
    lawn.shape.setStyle({ stroke: lawn.closed });
    lawn.shape.setLatLngs(lawn.pts);
    if (!lawn.closed) {
      // Being drawn: the corners so far, joined by a line, and (from three) the area they close in.
      if (lawn.pts.length >= 3) { if (!map.hasLayer(lawn.shape)) lawn.shape.addTo(map); }
      else if (map.hasLayer(lawn.shape)) map.removeLayer(lawn.shape);
      lawn.line.setLatLngs(lawn.pts);
      if (!map.hasLayer(lawn.line)) lawn.line.addTo(map);
      lawn.line.bringToFront();
      lawn.pts.forEach(function (p) {
        lawn.handles.push(L.marker(p, { icon: DOT, interactive: false, zIndexOffset: 900 }).addTo(map));
      });
      return;
    }
    if (map.hasLayer(lawn.line)) map.removeLayer(lawn.line);
    if (!map.hasLayer(lawn.shape)) lawn.shape.addTo(map);
    if (!EDITABLE || lawn !== active) return;
    // Reshaping: drag a corner to move it.
    lawn.pts.forEach(function (p, i) {
      var h = L.marker(p, { icon: CORNER, draggable: true, zIndexOffset: 1000 }).addTo(map);
      h.on('drag', function () { lawn.pts[i] = h.getLatLng(); lawn.shape.setLatLngs(lawn.pts); });
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
    if (pts.length >= 3) emit();
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

  // ---- Hold a lawn: delete it, or move it somewhere else ----
  // Once it's picked up, one finger drags it. Put a second finger down to turn it as well: the
  // lawn follows both fingers as if stuck to them, keeping its size.
  var TURN_SLOP = 0.035; // radians (2°) the fingers must turn the lawn before it counts as moved
  var hold = null, suppressClick = false;
  // A hold ends with a click from the browser; it shouldn't also count as a tap.
  function takeSuppressedClick() { var was = suppressClick; suppressClick = false; return was; }
  function holdStart(lawn, ev) {
    if (drawing || hold || !ev.isPrimary) return;
    var p = map.mouseEventToContainerPoint(ev);
    // at: where each finger is (by pointer id); second: the turning finger's id.
    hold = { lawn: lawn, id: ev.pointerId, second: null, start: p, at: {}, lifted: false, moved: false, turned: false };
    hold.at[ev.pointerId] = p;
    hold.timer = setTimeout(lift, HOLD_MS);
  }
  function lift() {
    hold.lifted = true;
    suppressClick = true;
    select(null);
    clearHandles(hold.lawn);
    L.DomUtil.addClass(hold.lawn.shape.getElement(), 'lawn-lifted');
    rebase();
    haptic('medium');
  }
  // Where a corner is on screen, to a fraction of a pixel (Leaflet's own conversion rounds to
  // whole pixels, which would nudge the corners out of shape each time a lawn is moved).
  function screenPoint(latlng) { return map.layerPointToContainerPoint(map.project(latlng).subtract(map.getPixelOrigin())); }
  // The move goes on from where the lawn and the fingers are now (a finger was put down or lifted).
  function rebase() {
    hold.from = hold.lawn.pts.map(screenPoint);
    hold.was = { a: hold.at[hold.id], b: hold.second === null ? null : hold.at[hold.second] };
  }
  // Carries the lawn along with the finger; with two, it also turns by as much as the line
  // between them has, about the point halfway between them.
  function follow() {
    var a = hold.at[hold.id], was = hold.was, turn = 0, pivot = was.a, to = a;
    if (hold.second !== null) {
      var b = hold.at[hold.second];
      turn = Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(was.b.y - was.a.y, was.b.x - was.a.x);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // the short way round
      pivot = was.a.add(was.b).divideBy(2);
      to = a.add(b).divideBy(2);
    }
    if (!hold.moved && Math.abs(turn) < TURN_SLOP && to.distanceTo(pivot) < 4) return;
    hold.moved = true;
    var cos = Math.cos(turn), sin = Math.sin(turn);
    hold.lawn.pts = hold.from.map(function (o) {
      var x = o.x - pivot.x, y = o.y - pivot.y;
      return map.containerPointToLatLng(L.point(to.x + x * cos - y * sin, to.y + x * sin + y * cos));
    });
    hold.lawn.shape.setLatLngs(hold.lawn.pts);
  }
  function endHold() {
    clearTimeout(hold.timer);
    if (hold.lifted && hold.lawn.shape.getElement()) L.DomUtil.removeClass(hold.lawn.shape.getElement(), 'lawn-lifted');
    hold = null;
  }
  // Captured on the window, ahead of the map: once a lawn is picked up, the fingers move the
  // lawn, not the map.
  window.addEventListener('pointermove', function (ev) {
    if (!hold || !(ev.pointerId in hold.at)) return;
    var p = map.mouseEventToContainerPoint(ev);
    hold.at[ev.pointerId] = p;
    if (!hold.lifted) {
      if (p.distanceTo(hold.start) > HOLD_SLOP) endHold(); // moving right away: it's a pan
      return;
    }
    ev.stopPropagation();
    follow();
  }, true);
  // Nor does a second finger start a pinch zoom of the map while a lawn is picked up.
  ['touchstart', 'touchmove', 'mousemove'].forEach(function (type) {
    window.addEventListener(type, function (ev) { if (hold && hold.lifted) ev.stopPropagation(); }, true);
  });
  window.addEventListener('pointerdown', function (ev) {
    if (!hold || ev.pointerId === hold.id) return;
    // A second finger before the lawn is picked up: it's a pinch zoom, not a hold.
    if (!hold.lifted) { endHold(); return; }
    ev.stopPropagation();
    if (hold.second !== null) return; // a third finger does nothing
    hold.second = ev.pointerId;
    hold.at[ev.pointerId] = map.mouseEventToContainerPoint(ev);
    hold.turned = true;
    rebase();
    haptic('light');
  }, true);
  function holdEnd(ev) {
    if (!hold) return;
    if (ev.pointerId === hold.second) {
      // The turning finger lifted: the first one carries on dragging.
      delete hold.at[hold.second];
      hold.second = null;
      rebase();
      return;
    }
    if (ev.pointerId !== hold.id) return;
    var h = hold;
    endHold();
    if (!h.lifted) return;
    if (h.moved || h.turned) { select(h.lawn); emit(); }
    else post({ type: 'lawnMenu', index: countedLawns().indexOf(h.lawn) }); // held still: offer to delete it
  }
  window.addEventListener('pointerup', holdEnd, true);
  window.addEventListener('pointercancel', holdEnd, true);
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
      var target = index !== undefined ? countedLawns()[index] : drawing || active || lawns[lawns.length - 1];
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
