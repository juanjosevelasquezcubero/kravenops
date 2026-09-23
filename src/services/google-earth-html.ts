/**
 * HTML do mapa GOOGLE EARTH 3D de verdade (rodado num WebView).
 *
 * Usa CesiumJS + **Google Photorealistic 3D Tiles** (asset 2275207) — os MESMOS dados 3D
 * fotorealísticos que alimentam o Google Earth, servidos via Cesium ion.
 *
 * Requer um token GRATUITO do Cesium ion (https://ion.cesium.com → Tokens):
 * sem token o app usa o mapa 3D reserva (terrain-map-html.ts, MapLibre).
 *
 * Mantém o MESMO protocolo de mensagens (window.kravenOps / postMessage), então a tela RN
 * funciona igual: zonas, marcadores, GPS, motor de potencial (azul) e pontos coloridos.
 */
export function makeGoogleEarthHtml(ionToken: string): string {
  const tokenJson = JSON.stringify(ionToken);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/cesium@1.131.0/Build/Cesium/Widgets/widgets.css"/>
<style>
  html, body, #cesiumContainer { margin: 0; padding: 0; height: 100%; width: 100%; overflow: hidden; }
  body { background: #0b1e33; }
  #status { position: fixed; top: 8px; left: 8px; right: 8px; z-index: 20; color: #fff;
    font: 12px system-ui, sans-serif; background: rgba(0,0,0,0.65); border-radius: 8px;
    padding: 6px 10px; display: none; text-align: center; }
  .cesium-widget canvas { touch-action: none; }
</style>
</head>
<body>
<div id="status">Carregando Google Earth 3D…</div>
<div id="cesiumContainer"></div>
<script src="https://unpkg.com/cesium@1.131.0/Build/Cesium/Cesium.js"></script>
<script>
var post = function (msg) { try { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); } catch (e) {} };
var statusEl = document.getElementById('status');
var setStatus = function (txt, show) { if (!statusEl) return; statusEl.textContent = txt || ''; statusEl.style.display = show ? 'block' : 'none'; };
var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

Cesium.Ion.defaultAccessToken = ${tokenJson};

var MINERALS = {
  ouro:         '#FFD54F',
  bauxita:      '#E53935',
  diamante:     '#F5F5F5',
  ferro:        '#90A4AE',
  cobre:        '#43A047',
  'terras raras': '#FB8C00',
  geral:        '#26C6DA'
};
var ZCOL = { protected: '#E53935', permitted: '#F9A825', free: '#43A047' };

var viewer = null;
var terrainProvider = null;
var googleTiles = null;
var state = { zones: [], markers: [], gps: null, follow: true, target: 'ouro', potentialVisible: true, analyzed: false };
var attempts = 0;
var zoneEntities = [];
var markerEntities = [];
var potentialEntities = [];
var gpsEntity = null;
var loaded = false;

/* ---------- Utilidades geo ---------- */
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
var removeEntities = function (list) {
  for (var i = 0; i < list.length; i++) { try { viewer.entities.remove(list[i]); } catch (e) {} }
  list.length = 0;
};

/* ---------- Overlays (zonas, marcadores, GPS) ---------- */
var refreshZones = function () {
  removeEntities(zoneEntities);
  if (!viewer) return;
  for (var i = 0; i < state.zones.length; i++) {
    var z = state.zones[i];
    var flat = [];
    for (var k = 0; k < z.polygon.length; k++) { flat.push(z.polygon[k].longitude, z.polygon[k].latitude); }
    var col = ZCOL[z.kind] || '#90A4AE';
    try {
      var ent = viewer.entities.add({
        name: z.name,
        polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(flat), height: 0,
          material: Cesium.Color.fromCssColorString(col).withAlpha(0.18),
          outline: true, outlineColor: Cesium.Color.fromCssColorString(col) }
      });
      zoneEntities.push(ent);
    } catch (e) {}
  }
};

var refreshMarkers = function () {
  removeEntities(markerEntities);
  if (!viewer) return;
  for (var i = 0; i < state.markers.length; i++) {
    var m = state.markers[i];
    try {
      var ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(m.coords.longitude, m.coords.latitude, 40),
        point: { pixelSize: 8, color: Cesium.Color.fromCssColorString(m.color),
          outlineColor: Cesium.Color.WHITE, outlineWidth: 1.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY, heightReference: Cesium.HeightReference.NONE }
      });
      markerEntities.push(ent);
    } catch (e) {}
  }
};

var ensureGps = function () {
  if (!viewer) return;
  if (!gpsEntity) {
    try {
      gpsEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(0, 0, 200),
        point: { pixelSize: 10, color: Cesium.Color.fromCssColorString('#00E676'),
          outlineColor: Cesium.Color.WHITE, outlineWidth: 2.5,
          disableDepthTestDistance: Number.POSITIVE_INFINITY },
        ellipse: { semiMajorAxis: 30, semiMinorAxis: 30, material: Cesium.Color.fromCssColorString('#00E676').withAlpha(0.12) }
      });
    } catch (e) {}
  }
  if (!gpsEntity) return;
  try {
    if (state.gps) {
      var lat = state.gps.lat, lng = state.gps.lng;
      gpsEntity.position = Cesium.Cartesian3.fromDegrees(lng, lat, 200);
      var acc = state.gps.acc ? state.gps.acc : 20;
      gpsEntity.ellipse.semiMajorAxis = acc;
      gpsEntity.ellipse.semiMinorAxis = acc;
    } else {
      gpsEntity.show = false;
    }
  } catch (e) {}
  if (state.follow && state.gps) {
    var h = viewer.camera.positionCartographic ? viewer.camera.positionCartographic.height : 4000;
    viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(state.gps.lng, state.gps.lat, Math.max(1500, h)), duration: 1.2 });
  }
};

/* ---------- MOTOR DE POTENCIAL MINERAL (terreno) ---------- */
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

var sampleHeights = function (lats, lngs, cb) {
  if (!terrainProvider) { cb(null); return; }
  var positions = [];
  for (var j = 0; j < lats.length; j++) for (var i = 0; i < lngs.length; i++) {
    positions.push(Cesium.Cartographic.fromDegrees(lngs[i], lats[j]));
  }
  var prom = Cesium.sampleTerrain(terrainProvider, 10, positions);
  if (!prom || !prom.then) { cb(null); return; }
  prom.then(function (updated) {
    var el = []; var k = 0;
    for (var j = 0; j < lats.length; j++) {
      el[j] = [];
      for (var i = 0; i < lngs.length; i++) {
        el[j][i] = updated[k] && typeof updated[k].height === 'number' ? updated[k].height : 0;
        k++;
      }
    }
    cb(el);
  }).catch(function () { cb(null); });
};

var runPotential = function () {
  if (!viewer) return;
  var target = state.target;
  attempts++;
  var c;
  try {
    var rect = viewer.camera.computeViewRectangle(viewer.scene);
    var dLng, dLat;
    if (rect) {
      dLng = clamp(Math.max(0.03, (rect.east - rect.west) / 2), 0.03, 0.9);
      dLat = clamp(Math.max(0.03, (rect.north - rect.south) / 2), 0.03, 0.9);
    } else {
      var h = viewer.camera.positionCartographic ? viewer.camera.positionCartographic.height : 100000;
      var d = clamp(h * 0.000005, 0.04, 0.9);
      dLng = d; dLat = d;
    }
    var center = viewer.camera.positionCartographic;
    if (!center) return;
    c = { lat: center.latitude, lng: center.longitude };
  } catch (e) { return; }

  setStatus('Estudando o terreno (engenharia de prospecção)…', true);
  var N = 9;
  var lats = [], lngs = [], i, j;
  for (j = 0; j <= N; j++) { lats.push(c.lat - dLat + (2 * dLat * j) / N); lngs.push(c.lng - dLng + (2 * dLng * j) / N); }
  sampleHeights(lats, lngs, function (el) {
    setStatus('', false);
    if (!el) {
      if (attempts < 3) setTimeout(function () { runPotential(); }, 4000);
      return;
    }
    var minE = Infinity, maxE = -Infinity;
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++) {
      if (el[j][i] < minE) minE = el[j][i];
      if (el[j][i] > maxE) maxE = el[j][i];
    }
    if (maxE <= 0) {
      clearPotential();
      post({ type: 'potential', summary: { count: 0, top: [], at: { latitude: c.lat, longitude: c.lng } } });
      if (attempts < 3) setTimeout(function () { runPotential(); }, 4000);
      return;
    }
    attempts = 0;
    var span = Math.max(1, maxE - minE);
    var cellM = (2 * dLat / N) * 111320;
    var scores = [], pts = [], cellLat, cellLng;
    var best = { v: 0, mineral: 'geral' };
    for (j = 1; j < N; j++) {
      scores[j] = [];
      for (i = 1; i < N; i++) {
        cellLat = lats[j]; cellLng = lngs[i];
        var dLngM = 111320 * Math.cos((cellLat * Math.PI) / 180);
        var dex = (el[j][i + 1] - el[j][i - 1]) / (2 * dLngM);
        var dey = (el[j + 1][i] - el[j - 1][i]) / (2 * cellM);
        var slope = Math.atan(Math.sqrt(dex * dex + dey * dey));
        var curv = (el[j][i + 1] + el[j][i - 1] + el[j + 1][i] + el[j - 1][i] - 4 * el[j][i]) / (cellM * cellM);
        var w = el[j][i], lo = w, hi = w;
        var k2, k1;
        for (k2 = j - 1; k2 <= j + 1; k2++) for (k1 = i - 1; k1 <= i + 1; k1++) {
          var v2 = el[k2][k1]; if (v2 < lo) lo = v2; if (v2 > hi) hi = v2;
        }
        var feat = { elevation: el[j][i], elevRel: (el[j][i] - minE) / span,
          slope: slope * 180 / Math.PI, curv: curv, relief: hi - lo,
          reliefNorm: clamp((hi - lo) / 120, 0, 1) };
        var s = scoreAll(feat);
        var b = 'geral', bv = s[target] * (target === 'geral' ? 1 : 1.08);
        var m;
        for (m in s) { if (s[m] > bv) { bv = s[m]; b = m; } }
        s._best = bv; s._mineral = b; s._slope = feat.slope; s._elev = feat.elevation; s._zone = zoneAt(cellLat, cellLng);
        scores[j][i] = s;
        if (bv > best.v) { best.v = bv; best.mineral = b; }
        if (bv >= 0.60) {
          pts.push({ lat: cellLat, lng: cellLng, mineral: b, score: bv, zone: s._zone, elev: feat.elevation, slope: feat.slope, cell: true });
        }
      }
    }
    for (j = 2; j < N - 1; j++) for (i = 2; i < N - 1; i++) {
      var vv = scores[j][i]._best;
      if (vv < 0.72) continue;
      if (vv >= scores[j - 1][i]._best && vv >= scores[j + 1][i]._best &&
          vv >= scores[j][i - 1]._best && vv >= scores[j][i + 1]._best) {
        pts.push({ lat: lats[j], lng: lngs[i], mineral: scores[j][i]._mineral, score: vv,
          zone: scores[j][i]._zone, elev: scores[j][i]._elev, slope: scores[j][i]._slope, cell: false });
      }
    }
    drawPotential(pts);
    var peaks = pts.filter(function (p) { return !p.cell; });
    peaks.sort(function (a, b) { return b.score - a.score; });
    peaks = peaks.slice(0, 3);
    state.analyzed = true;
    post({ type: 'potential', summary: { count: peaks.length,
      top: peaks.map(function (p) { return { latitude: p.lat, longitude: p.lng, mineral: p.mineral,
        score: Math.round(p.score * 100) / 100, zoneKind: p.zone,
        elevation: Math.round(p.elev || 0), slopeDeg: Math.round(p.slope * 10) / 10 }; }),
      at: { latitude: c.lat, longitude: c.lng } } });
  });
};

var clearPotential = function () {
  removeEntities(potentialEntities);
};
var drawPotential = function (pts) {
  clearPotential();
  if (!viewer) return;
  // Células azuis (áreas de alto potencial).
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    try {
      var col = p.cell ? Cesium.Color.fromCssColorString('#1976D2').withAlpha(0.55)
        : Cesium.Color.fromCssColorString(MINERALS[p.mineral] || '#26C6DA').withAlpha(0.98);
      var ent = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat, p.cell ? 120 : 160),
        point: { pixelSize: p.cell ? 15 : 12, color: col,
          outlineColor: p.cell ? Cesium.Color.fromCssColorString('#0D47A1') : Cesium.Color.WHITE,
          outlineWidth: p.cell ? 1 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY }
      });
      potentialEntities.push(ent);
      ent.show = state.potentialVisible;
    } catch (e) {}
  }
};

/* ---------- MENSAGENS RN → MAPA ---------- */
window.kravenOps = function (msg) {
  if (!msg || !msg.cmd || !viewer) return;
  try {
    switch (msg.cmd) {
      case 'sync':
        if (msg.zones) state.zones = msg.zones;
        if (msg.markers) state.markers = msg.markers;
        if (msg.target) state.target = msg.target;
        if (typeof msg.potentialVisible === 'boolean') state.potentialVisible = msg.potentialVisible;
        if (msg.gps) state.gps = msg.gps;
        else if (msg.gps === null) state.gps = null;
        refreshZones(); refreshMarkers(); ensureGps();
        if (!state.analyzed && state.gps) setTimeout(function () { runPotential(); }, 600);
        break;
      case 'setGps':
        state.gps = msg.gps || null; ensureGps();
        break;
      case 'setMarkers':
        state.markers = msg.markers || []; refreshMarkers();
        break;
      case 'setTarget':
        state.target = msg.target || 'ouro';
        break;
      case 'setPotentialVisible':
        state.potentialVisible = !!msg.visible;
        if (potentialEntities.length > 0) {
          for (var i = 0; i < potentialEntities.length; i++) potentialEntities[i].show = state.potentialVisible;
        }
        break;
      case 'follow':
        state.follow = !!msg.on;
        if (state.follow && state.gps) ensureGps();
        break;
      case 'zoom':
        if (msg.d > 0) viewer.camera.zoomIn(0.45); else viewer.camera.zoomOut(0.45);
        break;
      case 'pitch':
        if (viewer.camera.pitch < -0.2) {
          viewer.camera.setView({ destination: viewer.camera.positionWC, orientation: { heading: viewer.camera.heading, pitch: -0.05, roll: 0 } });
        } else {
          viewer.camera.setView({ destination: viewer.camera.positionWC, orientation: { heading: viewer.camera.heading, pitch: Cesium.Math.toRadians(-55), roll: 0 } });
        }
        break;
      case 'jumpTo':
        viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(msg.lng, msg.lat, 4500),
          orientation: { heading: 0, pitch: Cesium.Math.toRadians(-50), roll: 0 }, duration: 1.6 });
        state.analyzed = false;
        setTimeout(function () { runPotential(); }, 2500);
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
  viewer = new Cesium.Viewer('cesiumContainer', {
    baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
    navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
    infoBox: false, selectionIndicator: false,
    baseLayer: false
  });
} catch (err) {
  post({ type: 'initError', message: String(err && err.message || err) });
}
try {
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0b1e33');
  viewer.scene.globe.enableLighting = false;
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-49.5, -6.2, 120000),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-55), roll: 0 }
  });
  viewer.scene.screenSpaceCameraController.maximumZoomDistance = 3000000;
  viewer.screenSpaceEventHandler.setInputAction(function (movement) {
    var cartesian = viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
    if (cartesian) {
      var carto = Cesium.Cartographic.fromCartesian(cartesian);
      post({ type: 'clicked', lat: Cesium.Math.toDegrees(carto.latitude), lng: Cesium.Math.toDegrees(carto.longitude),
        zoneKind: zoneAt(Cesium.Math.toDegrees(carto.latitude), Cesium.Math.toDegrees(carto.longitude)) });
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  loaded = true;
  post({ type: 'ready' });
  setStatus('Carregando Google Earth 3D…', true);

  // Google Photorealistic 3D Tiles (os dados 3D do Google Earth).
  Cesium.Cesium3DTileset.fromIonAssetId(2275207, { maximumScreenSpaceError: 8 }).then(function (ts) {
    googleTiles = ts;
    viewer.scene.primitives.add(ts);
    ts.readyEvent.addEventListener(function () { setStatus('', false); });
    ts.tileLoadErrorEvent.addEventListener(function (e) {
      setStatus('Algumas áreas 3D podem demorar…', false);
    });
  }).catch(function (err) {
    setStatus('Token Cesium ion inválido? Veja Ajustes → Google Earth 3D.', true);
    post({ type: 'mapError', message: 'Google 3D tiles: ' + String(err && err.message || err) });
  });

  // Terreno mundial (gratuito no ion) apenas para o estudo de potencial/elevação.
  Cesium.createWorldTerrainAsync({ requestWaterMask: false, requestVertexNormals: false }).then(function (tp) {
    terrainProvider = tp;
    // Testa uma leitura para confirmar o token.
    Cesium.sampleTerrain(tp, 8, [Cesium.Cartographic.fromDegrees(-49.5, -6.2)]).then(function () {
      post({ type: 'terrain', ok: true });
      setStatus('', false);
    }).catch(function () { post({ type: 'terrain', ok: false }); });
  }).catch(function () {
    post({ type: 'terrain', ok: false });
    setStatus('Sem elevação (estudo de potencial indisponível). Confirme o token Cesium ion.', true);
  });
} catch (err) {
  post({ type: 'initError', message: String(err && err.message || err) });
}
</script>
</body>
</html>`;
}