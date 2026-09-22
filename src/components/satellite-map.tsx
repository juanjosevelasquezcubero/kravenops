import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { LatLng, MineZone } from '@/types/analysis';

/**
 * Mapa de satélite estilo "Google Earth" — 100% React Native (sem WebView,
 * sem API key). Baixa tiles XYZ da Esri World Imagery (servidor público).
 *
 * - Arrastar (pan), zoom (+/−) e botão "seguir minha posição".
 * - Sobreposição dos polígonos de zona 🔴🟡🟢 e marcadores de análises.
 * - Funciona em qualquer lugar do mundo (projeção Web Mercator).
 * - Requer internet para as imagens; o Radar local continua o fallback offline.
 *
 * Arquitetura: posição derivada — quando "seguir" (follow) está ativo, o centro
 * do mapa é calculado diretamente da prop `center` (sem estado nem effects);
 * arrastar desliga o follow e muda para um centro manual.
 */

const TILE = 256;
const MIN_ZOOM = 3;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 17;
const TILE_SERVER = (z: number, x: number, y: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

const ZONE_COLORS: Record<MineZone['kind'], string> = {
  protected: '#E53935',
  permitted: '#F9A825',
  free: '#43A047',
};

interface TileSlot {
  key: string;
  screenX: number;
  screenY: number;
  uri: string;
}

/* ---------------- Web Mercator ---------------- */

function worldSize(zoom: number): number {
  return TILE * 2 ** zoom;
}

function lonLatToPixel(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = worldSize(zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function clampLat(lat: number): number {
  return Math.max(-85.05, Math.min(85.05, lat));
}

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
}

export interface SatelliteMarker {
  coords: LatLng;
  color: string;
}

interface SatelliteMapProps {
  center: LatLng | null;
  zones: MineZone[];
  markers: SatelliteMarker[];
  height?: number;
}

export function SatelliteMap({ center, zones, markers, height = 300 }: SatelliteMapProps) {
  // Centro manual (pixels Web Mercator na escala do zoom atual) + zoom no mesmo estado.
  const [view, setView] = useState({ x: 0, y: 0, zoom: DEFAULT_ZOOM });
  const zoom = view.zoom;
  const [follow, setFollow] = useState(true);
  const [viewport, setViewport] = useState({ w: 300, h: 300 });
  const [panOffset, setPanOffset] = useState({ dx: 0, dy: 0 });
  const [failedTiles, setFailedTiles] = useState(0);
  const panAccRef = useRef({ dx: 0, dy: 0 });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  /* -------- Posição efetiva do centro (derivada) -------- */
  const effectiveCenter =
    follow && center ? lonLatToPixel(clampLat(center.latitude), center.longitude, zoom) : view;

  const cx = effectiveCenter.x + viewport.w / 2 + panOffset.dx;
  const cy = effectiveCenter.y + viewport.h / 2 + panOffset.dy;
  const nTiles = 2 ** zoom;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height: h } = e.nativeEvent.layout;
    setViewport({ w: width || 300, h: h || 300 });
  };

  /* -------- Pan via touch (desliga "seguir") -------- */
  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
    panAccRef.current = { dx: 0, dy: 0 };
    if (follow && center) {
      const p = lonLatToPixel(clampLat(center.latitude), center.longitude, zoom);
      setView({ x: p.x, y: p.y, zoom });
      setFollow(false);
    }
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const dx = e.nativeEvent.pageX - start.x;
    const dy = e.nativeEvent.pageY - start.y;
    panAccRef.current = { dx, dy };
    setPanOffset({ dx, dy });
  };

  const endPan = () => {
    touchStartRef.current = null;
    const d = panAccRef.current;
    panAccRef.current = { dx: 0, dy: 0 };
    if (d.dx !== 0 || d.dy !== 0) {
      setView((v) => ({ x: v.x - d.dx, y: v.y - d.dy, zoom: v.zoom }));
      setPanOffset({ dx: 0, dy: 0 });
    }
  };

  /* -------- Zoom (mantém o ponto geográfico central) -------- */
  const onZoom = (delta: number) => {
    setView((v) => {
      const nz = clampZoom(v.zoom + delta);
      if (nz === v.zoom) return v;
      const scale = 2 ** (nz - v.zoom);
      // Em modo seguir, o centro vem da prop; senão escala o centro manual.
      return follow ? { ...v, zoom: nz } : { x: v.x * scale, y: v.y * scale, zoom: nz };
    });
    setFailedTiles(0);
  };

  /* -------- Tiles visíveis -------- */
  const tileSlots = useMemo<TileSlot[]>(() => {
    const tminX = Math.floor((cx - TILE) / TILE);
    const tmaxX = Math.floor((cx + viewport.w) / TILE);
    const tminY = Math.floor((cy - TILE) / TILE);
    const tmaxY = Math.floor((cy + viewport.h) / TILE);
    const slots: TileSlot[] = [];
    for (let ty = tminY; ty <= tmaxY; ty++) {
      const yw = ((ty % nTiles) + nTiles) % nTiles;
      for (let tx = tminX; tx <= tmaxX; tx++) {
        const xw = ((tx % nTiles) + nTiles) % nTiles;
        slots.push({
          key: `${zoom}/${xw}/${yw}`,
          screenX: tx * TILE - (cx - viewport.w / 2),
          screenY: ty * TILE - (cy - viewport.h / 2),
          uri: TILE_SERVER(zoom, xw, yw),
        });
      }
    }
    return slots;
  }, [cx, cy, zoom, nTiles, viewport.w, viewport.h]);

  /* -------- Sobreposições (lat/lng → tela) -------- */
  const toScreen = (lat: number, lng: number) => {
    const p = lonLatToPixel(clampLat(lat), lng, zoom);
    return {
      left: p.x - effectiveCenter.x - panOffset.dx,
      top: p.y - effectiveCenter.y - panOffset.dy,
    };
  };

  const overlays = useMemo(() => {
    const list: { zone: MineZone; points: { left: number; top: number }[]; centroid: { left: number; top: number } }[] = [];
    for (const zone of zones) {
      let visible = false;
      const points: { left: number; top: number }[] = [];
      const perEdge = 10;
      for (let i = 0; i < zone.polygon.length; i++) {
        const a = zone.polygon[i];
        const b = zone.polygon[(i + 1) % zone.polygon.length];
        for (let k = 0; k <= perEdge; k++) {
          const t = k / perEdge;
          const d = toScreen(a.latitude + (b.latitude - a.latitude) * t, a.longitude + (b.longitude - a.longitude) * t);
          if (d.left >= -24 && d.left <= viewport.w + 24 && d.top >= -24 && d.top <= viewport.h + 24) visible = true;
          points.push(d);
        }
      }
      if (!visible) continue;
      let lat = 0;
      let lng = 0;
      for (const v2 of zone.polygon) {
        lat += v2.latitude;
        lng += v2.longitude;
      }
      list.push({ zone, points, centroid: toScreen(lat / zone.polygon.length, lng / zone.polygon.length) });
    }
    return list;
    // toScreen é chamado por referência estável; recalc quando centro/tela muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, zoom, effectiveCenter.x, effectiveCenter.y, panOffset.dx, panOffset.dy, viewport.w, viewport.h]);

  const markerScreens = useMemo(
    () =>
      markers
        .map((m) => ({ color: m.color, pos: toScreen(m.coords.latitude, m.coords.longitude) }))
        .filter(
          (m) => m.pos.left >= -14 && m.pos.left <= viewport.w + 14 && m.pos.top >= -14 && m.pos.top <= viewport.h + 14,
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markers, zoom, effectiveCenter.x, effectiveCenter.y, panOffset.dx, panOffset.dy, viewport.w, viewport.h],
  );

  return (
    <View style={[styles.container, { height }]}>
      <View
        style={[StyleSheet.absoluteFill, styles.tileLayer]}
        onLayout={onLayout}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={endPan}
        onTouchCancel={endPan}>
        {tileSlots.map((t) => (
          <Image
            key={t.key}
            style={[styles.tile, { left: t.screenX, top: t.screenY }]}
            source={{ uri: t.uri }}
            contentFit="fill"
            onError={() => setFailedTiles((f) => f + 1)}
          />
        ))}

        {overlays.map((o) => (
          <View key={`zone-${o.zone.id}`} pointerEvents="none">
            {o.points.map((d, i) => (
              <View
                key={i}
                style={[styles.zoneDot, { left: d.left, top: d.top, backgroundColor: ZONE_COLORS[o.zone.kind] }]}
              />
            ))}
            <View style={[styles.zoneLabel, { left: o.centroid.left, top: o.centroid.top }]}>
              <View style={[styles.zoneLabelChip, { borderColor: ZONE_COLORS[o.zone.kind] }]}>
                <View style={[styles.zoneLabelDot, { backgroundColor: ZONE_COLORS[o.zone.kind] }]} />
                <ThemedText type="small" numberOfLines={2}>
                  {o.zone.name}
                </ThemedText>
              </View>
            </View>
          </View>
        ))}

        {markerScreens.map((m, i) => (
          <View key={`marker-${i}`} style={[styles.marker, { left: m.pos.left, top: m.pos.top, backgroundColor: m.color }]} />
        ))}

        {/* Ponto da posição atual */}
        {follow && center && (
          <View
            style={[
              styles.youMarker,
              { left: viewport.w / 2 - 9, top: viewport.h / 2 - 9 }, // centro = posição GPS
            ]}
          />
        )}
      </View>

      {follow && center && (
        <View style={styles.centerCrosshair} pointerEvents="none">
          <View style={styles.crosshairV} />
          <View style={styles.crosshairH} />
        </View>
      )}

      {failedTiles > 0 && (
        <View style={styles.banner} pointerEvents="none">
          <ThemedText type="small">🌐 Sem internet? O satélite precisa de rede. O mode 🛰️ Radar funciona offline.</ThemedText>
        </View>
      )}

      {/* Controles estilo Google Earth */}
      <View style={styles.controlsRight}>
        <Pressable style={styles.controlBtn} onPress={() => onZoom(1)} hitSlop={8}>
          <ThemedText style={styles.controlText}>＋</ThemedText>
        </Pressable>
        <Pressable style={styles.controlBtn} onPress={() => onZoom(-1)} hitSlop={8}>
          <ThemedText style={styles.controlText}>−</ThemedText>
        </Pressable>
      </View>

      <Pressable style={[styles.followBtn, follow && styles.followOn]} onPress={() => setFollow(true)} hitSlop={8}>
        <ThemedText style={styles.followText}>🎯</ThemedText>
      </Pressable>

      <View style={styles.credit} pointerEvents="none">
        <ThemedText type="small">Satélite: Esri World Imagery</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#263238' },
  tileLayer: { flex: 1, overflow: 'hidden' },
  tile: { position: 'absolute', width: TILE, height: TILE },
  zoneDot: { position: 'absolute', width: 4, height: 4, borderRadius: 2, opacity: 0.9 },
  zoneLabel: { position: 'absolute', transform: [{ translateX: -70 }] },
  zoneLabelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 140,
  },
  zoneLabelDot: { width: 8, height: 8, borderRadius: 4 },
  marker: { position: 'absolute', width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  youMarker: { position: 'absolute', width: 18, height: 18, borderRadius: 9 },
  centerCrosshair: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  crosshairV: { position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  crosshairH: { position: 'absolute', top: '50%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  banner: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  controlsRight: { position: 'absolute', right: 8, top: 120, gap: 6 },
  controlBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlText: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 },
  followBtn: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  followOn: { borderColor: '#43A047', backgroundColor: 'rgba(21,101,192,0.85)' },
  followText: { fontSize: 20 },
  credit: { position: 'absolute', left: 8, bottom: 8 },
});