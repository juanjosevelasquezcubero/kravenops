/**
 * HTML do mapa 3D estilo Google Earth (rodado dentro de um WebView).
 *
 * - MapLibre GL JS v6 (CDN unpkg) + tiles de SATÉLITE Esri World Imagery (sem chave).
 * - TERRA 3D real com tiles de elevação AWS Terrarium (gratuito, mundial, sem chave).
 * - Motor de potencial mineral: amostra a elevação do terreno (queryTerrainElevation),
 *   calcula declividade/curvatura/relevo e estima áreas favoráveis por mineral.
 *   → Áreas de alto potencial desenhadas em AZUL + pontos coloridos por minério
 *     (ouro=amarelo, bauxita=vermelho, diamante=branco, ferro=cinza, cobre=verde,
 *     terras raras=laranja, geral=cian).
 * - Ponte postMessage: a página recebe comandos via window.kravenOps(msg) e envia
 *   eventos via window.ReactNativeWebView.postMessage.
 *
 * ⚠️ O potencial é uma ESTIMATIVA por modelo de terreno (elevação/declividade) para
 * orientar prospecção — NÃO é detecção real de minério por satélite. O app deixa isso
 * claro na interface e a conclusão final vem sempre da análise de campo/rocha original.
 */

export function makeTerrainMapHtml(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.11.0/dist/maplibre-gl.css"/>
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; }
  body { background: #0b1e33; overflow: hidden; }
  #status { position: fixed; top: 8px; left: 8px; right: 8px; z-index: 10;
    color: #fff; font: 12px system-ui, sans-serif; background: rgba(0,0,0,0.55);
    border-radius: 8px; padding: 6px 10px; display: none; text-align: center; }
  .maplibregl-ctrl-attrib { font-size: 9px; }
</style>
</head>
<body>
<div id="status"></div>
<div id="map"></div>
<script type="module">
import * as maplibregl from 'https://unpkg.com/maplibre-gl@6.11.0/dist/maplibre-gl.mjs';

var post = function (msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };
var statusEl = document.getElementById('status');
var setStatus = function (txt, show) { if (!statusEl) return; statusEl.textContent = txt || ''; statusEl.style.display = show ? 'block' : 'none'; };
var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

var MINERALS = {
  ouro:         { color: '#FFD54F', label: 'Ouro' },
  bauxita:      { color: '#E53935', label: 'Bauxita' },
  diamante:     { color: '#F5F5F5', label: 'Diamante' },
  ferro:        { color: '#90A4AE', label: 'Ferro' },
  cobre:        { color: '#43A047', label: 'Cobre' },
  'terras raras': { color: '#FB8C00', label: 'Terras raras' },
  geral:        { color: '#26C6DA', label: 'Geral' }
};
var ZCOL = { protected: '#E53935', permitted: '#F9A825', free: '#43A047' };

var map = null;
var state = { zones: [], markers: [], gps: null, follow: true, target: 'ouro', potentialVisible: true, analyzed: false };
var loaded = false;
var attempts = 0;

var inPolygon = function (lat, lng, poly) {
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i].longitude, yi = poly[i].latitude;
    var xj = poly[j].longitude, yj = poly[j].latitude;
    if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
};
var zoneAt = function (lat, lng) {
  for (var i = 0; i < state.zones.length; i++) {
    if (inPolygon(lat, lng, state.zones[i].polygon)) return state.zones[i].kind;
  }
  return null;
};

var ensureLayers = function () {
  if (!map.getSource('zones')) {
    map.addSource('zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'zones-fill', type: 'fill', source: 'zones',
      paint: { 'fill-color': ['match', ['get', 'kind'], 'protected', '#E53935', 'permitted', '#F9A825', 'free', '#43A047', '#90A4AE'],
               'fill-opacity': 0.18 } });
    map.addLayer({ id: 'zones-line', type: 'line', source: 'zones',
      paint: { 'line-color': ['match', ['get', 'kind'], 'protected', '#B71C1C', 'permitted', '#F57F17', 'free', '#2E7D32', '#607D8B'],
               'line-width': 2, 'line-opacity': 0.85 } });
  }
  if (!map.getSource('potential')) {
    map.addSource('potential', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'potential-fill', type: 'fill', source: 'potential',
      paint: { 'fill-color': ['interpolate', ['linear'], ['get', 'score'], 0.55, 'rgba(21,101,192,0.10)', 0.95, 'rgba(13,71,161,0.55)'],
               'fill-opacity': 1 } });
  }
  if (!map.getSource('ores')) {
    map.addSource('ores', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'ores-pts', type: 'circle', source: 'ores',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 0.68, 5, 1, 10],
               'circle-color': ['match', ['get', 'mineral'],
                 'ouro', '#FFD54F', 'bauxita', '#E53935', 'diamante', '#F5F5F5',
                 'ferro', '#90A4AE', 'cobre', '#43A047', 'terras raras', '#FB8C00', '#26C6DA'],
               'circle-stroke-color': '#0b1e33', 'circle-stroke-width': 1.5, 'circle-opacity': 0.95 } });
  }
  if (!map.getSource('analyses')) {
    map.addSource('analyses', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'analyses-pts', type: 'circle', source: 'analyses',
      paint: { 'circle-radius': 5, 'circle-color': ['get', 'color'],
               'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  }
  if (!map.getSource('gps')) {
    map.addSource('gps', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'gps-acc', type: 'circle', source: 'gps',
      paint: { 'circle-radius': ['get', 'accPx'], 'circle-color': '#00E676', 'circle-opacity': 0.12 } });
    map.addLayer({ id: 'gps-pt', type: 'circle', source: 'gps',
      paint: { 'circle-radius': 8, 'circle-color': '#00E676', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } });
  }
};

var refreshZones = function () {
  if (!map || !map.getSource('zones')) return;
  var feats = [];
  for (var i = 0; i < state.zones.length; i++) {
    var z = state.zones[i];
    feats.push({ type: 'Feature', properties: { kind: z.kind, name: z.name },
      geometry: { type: 'Polygon', coordinates: [z.polygon.map(function (p) { return [p.longitude, p.latitude]; })] } });
  }
  map.getSource('zones').setData({ type: 'FeatureCollection', features: feats });
};

var refreshMarkers = function () {
  if (!map || !map.getSource('analyses')) return;
  var feats = state.markers.map(function (m) { return { type: 'Feature',
    properties: { color: m.color }, geometry: { type: 'Point', coordinates: [m.coords.longitude, m.coords.latitude] } }; });
  map.getSource('analyses').setData({ type: 'FeatureCollection', features: feats });
};

var refreshGps = function () {
  if (!map || !map.getSource('gps')) return;
  if (!state.gps) { map.getSource('gps').setData({ type: 'FeatureCollection', features: [] }); return; }
  var accPx = state.gps.acc ? clamp(state.gps.acc / 2, 6, 60) : 20;
  map.getSource('gps').setData({ type: 'FeatureCollection', features: [{
    type: 'Feature', properties: { accPx: accPx },
    geometry: { type: 'Point', coordinates: [state.gps.lng, state.gps.lat] } }] });
  if (state.follow) map.jumpTo({ center: [state.gps.lng, state.gps.lat] });
};

/* ---------- MOTOR DE POTENCIAL MINERAL (terreno) ---------- */

var sampleElev = function (lng, lat) {
  try {
    var e = map.queryTerrainElevation([lng, lat]);
    return (typeof e === 'number' && isFinite(e)) ? e : 0;
  } catch (err) { return 0; }
};

var between = function (v, lo, hi) {
  if (v < lo) return clamp((v - (lo - 0.25)) / 0.25, 0, 1);
  if (v > hi) return clamp(((hi + 0.4) - v) / 0.4, 0, 1);
  return 1;
};

var scoreAll = function (feat) {
  var flat = clamp(1 - feat.slope / 20, 0, 1);
  var rugged = clamp(feat.slope / 25, 0, 1);
  var valley = feat.curv < -0.0004 ? (0.5 + clamp(-feat.curv * 9000, 0, 0.5)) : (feat.curv > 0.0004 ? 0.15 : 0.5);
  var lev = feat.elevRel;
  var rel = feat.reliefNorm;
  var s = {
    ouro: 0.55 * flat + 0.35 * valley + 0.10 * rel,
    bauxita: 0.55 * flat + 0.25 * between(lev, 0.35, 0.75) + 0.20 * (1 - rel),
    diamante: 0.70 * flat + 0.30 * (1 - rel),
    ferro: 0.60 * rugged + 0.40 * rel,
    cobre: 0.45 * rugged + 0.30 * valley + 0.25 * between(lev, 0.20, 0.60),
    'terras raras': 0.35 * between(lev, 0.55, 0.90) + 0.40 * flat + 0.25 * (1 - rel)
  };
  s.geral = Math.max(s.ouro, 0.8 * s.ferro, 0.75 * s.bauxita, 0.7 * s.diamante, 0.7 * s.cobre, 0.75 * s['terras raras']);
  return s;
};

var runPotential = function () {
  if (!map) return;
  var c = map.getCenter();
  var target = state.target;
  attempts++;
  setStatus('Estudando o terreno (engenharia de prospecção)…', true);
  setTimeout(function () {
    try {
      // Área do estudo = a área visível no viewport (precisão escala com o zoom).
      var b = map.getBounds();
      var dLng = clamp((b.getEast() - b.getWest()) / 2, 0.04, 0.9);
      var dLat = clamp((b.getNorth() - b.getSouth()) / 2, 0.04, 0.9);
      var N = 9;
      var lats = [], lngs = [];
      var el = [];
      var minE = Infinity, maxE = -Infinity;
      var i, j;
      for (j = 0; j <= N; j++) {
        lats.push(c.lat - dLat + (2 * dLat * j) / N);
        lngs.push(c.lng - dLng + (2 * dLng * j) / N);
      }
      for (j = 0; j <= N; j++) {
        el[j] = [];
        for (i = 0; i <= N; i++) {
          var e = sampleElev(lngs[i], lats[j]);
          el[j][i] = e;
          if (e < minE) minE = e;
          if (e > maxE) maxE = e;
        }
      }
      var span = Math.max(1, maxE - minE);
      if (maxE <= 0) {
        // DEM ainda não carregou (tiles de elevação) — NUNCA pinta azul falso.
        var empty0 = { type: 'FeatureCollection', features: [] };
        if (map.getSource('potential')) map.getSource('potential').setData(empty0);
        if (map.getSource('ores')) map.getSource('ores').setData(empty0);
        setStatus('', false);
        post({ type: 'potential', summary: { count: 0, top: [],
          at: { latitude: c.lat, longitude: c.lng } } });
        if (attempts < 3) setTimeout(function () { if (map) runPotential(); }, 4000);
        return;
      }
      attempts = 0;
      var cellM = (2 * dLat / N) * 111320; // aprox. metros por célula (lat)
      var quads = [], ores = [];
      var scores = [];
      var best = { v: 0, mineral: 'geral' };
      var j1;
      for (j = 1; j < N; j++) {
        scores[j] = [];
        for (i = 1; i < N; i++) {
          var lat = lats[j], lng = lngs[i];
          var dLngM = 111320 * Math.cos((lat * Math.PI) / 180);
          var dex = (el[j][i + 1] - el[j][i - 1]) / (2 * dLngM);
          var dey = (el[j + 1][i] - el[j - 1][i]) / (2 * cellM);
          var slope = Math.atan(Math.sqrt(dex * dex + dey * dey));
          var curv = (el[j][i + 1] + el[j][i - 1] + el[j + 1][i] + el[j - 1][i] - 4 * el[j][i]) / (cellM * cellM);
          var w = el[j][i], lo = w, hi = w;
          var k2, k1;
          for (k2 = j - 1; k2 <= j + 1; k2++) for (k1 = i - 1; k1 <= i + 1; k1++) {
            var v2 = el[k2][k1]; if (v2 < lo) lo = v2; if (v2 > hi) hi = v2;
          }
          var feat = {
            elevation: el[j][i],
            elevRel: (el[j][i] - minE) / span,
            slope: slope * 180 / Math.PI,
            curv: curv,
            relief: hi - lo,
            reliefNorm: clamp((hi - lo) / 120, 0, 1)
          };
          var s = scoreAll(feat);
          scores[j][i] = s;
          scores[j][i]._slope = feat.slope;
          scores[j][i]._elev = feat.elevation;
          var b = 'geral', bv = s[target] * (target === 'geral' ? 1 : 1.08);
          var m;
          for (m in s) { if (s[m] > bv) { bv = s[m]; b = m; } }
          feat.mineral = b;
          feat.score = bv;
          feat.zone = zoneAt(lat, lng);
          scores[j][i]._zone = feat.zone;
          scores[j][i]._best = bv;
          scores[j][i]._mineral = b;
          if (bv > best.v) { best.v = bv; best.mineral = b; }
          if (bv >= 0.60) {
            quads.push({ type: 'Feature', properties: { score: bv },
              geometry: { type: 'Polygon', coordinates: [[
                [lng - dLng / N, lat - dLat / N], [lng + dLng / N, lat - dLat / N],
                [lng + dLng / N, lat + dLat / N], [lng - dLng / N, lat + dLat / N], [lng - dLng / N, lat - dLat / N] ]] } });
          }
        }
      }
      // Pontos de pico (máximo local) coloridos por minério.
      var pts = [];
      for (j = 2; j < N - 1; j++) for (i = 2; i < N - 1; i++) {
        var vv = scores[j][i]._best;
        if (vv < 0.72) continue;
        if (vv >= scores[j - 1][i]._best && vv >= scores[j + 1][i]._best &&
            vv >= scores[j][i - 1]._best && vv >= scores[j][i + 1]._best) {
          pts.push({ lat: lats[j], lng: lngs[i], mineral: scores[j][i]._mineral,
            score: vv, zone: scores[j][i]._zone, elev: scores[j][i]._elev || 0,
            slope: scores[j][i]._slope || 0 });
        }
      }
      pts.sort(function (a, b) { return b.score - a.score; });
      pts = pts.slice(0, 12);
      var feats = pts.map(function (p) { return { type: 'Feature',
        properties: { mineral: p.mineral, score: Math.round(p.score * 100) / 100 },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] } }; });
      if (map.getSource('potential')) map.getSource('potential').setData({ type: 'FeatureCollection', features: quads });
      if (map.getSource('ores')) map.getSource('ores').setData({ type: 'FeatureCollection', features: feats });
      var vis = state.potentialVisible ? 'visible' : 'none';
      map.setLayoutProperty('potential-fill', 'visibility', vis);
      map.setLayoutProperty('ores-pts', 'visibility', vis);
      var top3 = pts.slice(0, 3).map(function (p) { return {
        latitude: p.lat, longitude: p.lng, mineral: p.mineral,
        score: Math.round(p.score * 100) / 100, zoneKind: p.zone,
        elevation: Math.round(p.elev || 0), slopeDeg: p.slope
      }; });
      state.analyzed = true;
      setStatus('', false);
      post({ type: 'potential', summary: { count: pts.length, top: top3,
        at: { latitude: c.lat, longitude: c.lng } } });
    } catch (err) {
      setStatus('', false);
      post({ type: 'potentialError', message: String(err && err.message || err) });
    }
  }, 250);
};

/* ---------- MENSAGENS RN → MAPA ---------- */
window.kravenOps = function (msg) {
  if (!msg || !msg.cmd || !map) return;
  try {
    switch (msg.cmd) {
      case 'sync':
        if (msg.zones) state.zones = msg.zones;
        if (msg.markers) state.markers = msg.markers;
        if (msg.target) state.target = msg.target;
        if (typeof msg.potentialVisible === 'boolean') state.potentialVisible = msg.potentialVisible;
        if (msg.gps) state.gps = msg.gps;
        else if (msg.gps === null) state.gps = null;
        if (!loaded) break;
        refreshZones(); refreshMarkers(); refreshGps();
        var vis2 = state.potentialVisible ? 'visible' : 'none';
        if (map.getLayer('potential-fill')) map.setLayoutProperty('potential-fill', 'visibility', vis2);
        if (map.getLayer('ores-pts')) map.setLayoutProperty('ores-pts', 'visibility', vis2);
        if (!state.analyzed && state.gps) setTimeout(function () { if (loaded) runPotential(); }, 400);
        break;
      case 'setGps':
        state.gps = msg.gps; refreshGps();
        break;
      case 'setMarkers':
        state.markers = msg.markers || []; refreshMarkers();
        break;
      case 'setTarget':
        state.target = msg.target || 'ouro';
        break;
      case 'setPotentialVisible':
        state.potentialVisible = !!msg.visible;
        var vis3 = state.potentialVisible ? 'visible' : 'none';
        if (map.getLayer('potential-fill')) map.setLayoutProperty('potential-fill', 'visibility', vis3);
        if (map.getLayer('ores-pts')) map.setLayoutProperty('ores-pts', 'visibility', vis3);
        break;
      case 'follow':
        state.follow = !!msg.on;
        if (state.follow && state.gps) map.jumpTo({ center: [state.gps.lng, state.gps.lat] });
        break;
      case 'zoom':
        if (msg.d > 0) map.zoomIn(); else map.zoomOut();
        break;
      case 'pitch':
        map.easeTo({ pitch: map.getPitch() > 10 ? 0 : 55, duration: 600 });
        break;
      case 'jumpTo':
        map.flyTo({ center: [msg.lng, msg.lat], zoom: msg.zoom || 16, pitch: 55, duration: 1600 });
        state.analyzed = false;
        setTimeout(function () { if (map) runPotential(); }, 2200);
        break;
      case 'analyze':
        runPotential();
        break;
    }
  } catch (err) {
    post({ type: 'mapError', message: String(err && err.message || err) });
  }
};

/* ---------- INICIALIZAÇÃO ---------- */
try {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
               tileSize: 256, maxzoom: 19, attribution: 'Imagens: Esri World Imagery' },
        dem: { type: 'raster-dem', encoding: 'terrarium',
               tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
               tileSize: 256, maxzoom: 15 },
        demhs: { type: 'raster-dem', encoding: 'terrarium',
                 tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                 tileSize: 256, maxzoom: 15 }
      },
      layers: [
        { id: 'sat', type: 'raster', source: 'sat' },
        { id: 'hills', type: 'hillshade', source: 'demhs',
          paint: { 'hillshade-exaggeration': 0.3, 'hillshade-opacity': 0.35 } }
      ],
      terrain: { source: 'dem', exaggeration: 1.6 },
      sky: { 'sky-color': '#0d1b2a', 'horizon-color': '#b6d4ea', 'fog-color': 'rgba(214,234,248,0.45)' }
    },
    center: [state.gps ? state.gps.lng : -49.5, state.gps ? state.gps.lat : -6.2],
    zoom: 15.5,
    pitch: 60,
    bearing: 0,
    minZoom: 2,
    maxZoom: 19,
    maxPitch: 78,
    attributionControl: { compact: true },
    cooperativeGestures: false
  });
} catch (err) {
  post({ type: 'initError', message: String(err && err.message || err) });
  return;
}

map.on('load', function () {
  loaded = true;
  ensureLayers();
  refreshZones(); refreshMarkers(); refreshGps();
  var vis0 = state.potentialVisible ? 'visible' : 'none';
  if (map.getLayer('potential-fill')) map.setLayoutProperty('potential-fill', 'visibility', vis0);
  if (map.getLayer('ores-pts')) map.setLayoutProperty('ores-pts', 'visibility', vis0);
  if (!state.analyzed && state.gps) setTimeout(function () { runPotential(); }, 500);
});
map.on('click', function (e) {
  post({ type: 'clicked', lat: e.lngLat.lat, lng: e.lngLat.lng, zoneKind: zoneAt(e.lngLat.lat, e.lngLat.lng) });
});
setTimeout(function () {
  var ok = false;
  var n = 0;
  var t = setInterval(function () {
    n++;
    try { if (map.queryTerrainElevation(map.getCenter()) > 0) ok = true; } catch (e) {}
    if (ok || n > 30) { clearInterval(t); post({ type: 'terrain', ok: ok }); }
  }, 500);
}, 1500);

setTimeout(function () { post({ type: 'ready' }); }, 300);
</script>
</body>
</html>`;
}