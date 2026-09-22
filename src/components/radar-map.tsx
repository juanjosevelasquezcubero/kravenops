import { StyleSheet, Text, View } from 'react-native';

import { haversineMeters, projectToRadar } from '@/services/geo';
import type { LatLng, MineZone } from '@/types/analysis';

const ZONE_KIND_COLOR: Record<MineZone['kind'], string> = {
  protected: '#E53935',
  permitted: '#F9A825',
  free: '#43A047',
};

export interface RadarMarker {
  label: string;
  color: string;
  /** null = posição atual (centro) */
  coords: LatLng;
}

interface Props {
  center: LatLng;
  size: number;
  radiusMeters: number;
  zones?: MineZone[];
  markers?: RadarMarker[];
  showRings?: number;
}

function zoneCentroid(zone: MineZone): LatLng {
  const lat = zone.polygon.reduce((s, p) => s + p.latitude, 0) / zone.polygon.length;
  const lng = zone.polygon.reduce((s, p) => s + p.longitude, 0) / zone.polygon.length;
  return { latitude: lat, longitude: lng };
}

/**
 * Radar geofence 100% offline: desenha as zonas (🔴 protegida, 🟡 permitida, 🟢 livre),
 * a posição atual no centro e marcadores de análises anteriores. Sem tiles, sem chave de API.
 */
export function RadarMap({ center, size, radiusMeters, zones = [], markers = [], showRings = 3 }: Props) {
  const pxPerMeter = (size / 2) / radiusMeters;

  const ringRadius = (i: number) => (size / 2) * ((i + 1) / (showRings + 1));

  const zonePoints = zones.map((zone) => {
    const centroid = zoneCentroid(zone);
    const { x, y } = projectToRadar(centroid, center, size / 2, pxPerMeter);
    const dist = haversineMeters(center, centroid);
    const inRange = dist <= radiusMeters;
    return { zone, x, y, dist, inRange };
  });

  return (
    <View style={[styles.radar, { width: size, height: size, borderRadius: size / 2 }]}>
      {Array.from({ length: showRings }).map((_, i) => {
        const d = ringRadius(i) * 2;
        return (
          <View
            key={i}
            style={[
              styles.ring,
              { width: d, height: d, borderRadius: d / 2, left: (size - d) / 2, top: (size - d) / 2 },
            ]}
          />
        );
      })}

      {zonePoints
        .filter((p) => p.inRange)
        .map(({ zone, x, y }) => (
          <View key={zone.id} style={[styles.zoneMarkerWrap, { left: x, top: y }]}>
            <View style={[styles.zoneDot, { backgroundColor: ZONE_KIND_COLOR[zone.kind] }]} />
            <Text numberOfLines={1} style={[styles.zoneLabel, { color: ZONE_KIND_COLOR[zone.kind] }]}>
              {zone.name}
            </Text>
          </View>
        ))}

      {markers
        .filter((m) => m.coords && haversineMeters(center, m.coords) <= radiusMeters)
        .map((m, i) => {
          const { x, y } = projectToRadar(m.coords, center, size / 2, pxPerMeter);
          return (
            <View key={`m-${i}`} style={[styles.marker, { left: x, top: y, backgroundColor: m.color }]}>
              <Text style={styles.markerText} numberOfLines={1}>
                {m.label}
              </Text>
            </View>
          );
        })}

      {/* Posição atual */}
      <View style={[styles.current, { left: size / 2, top: size / 2 }]}>
        <View style={styles.currentDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  radar: {
    overflow: 'hidden',
    backgroundColor: 'rgba(80,120,90,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(80,120,90,0.25)',
  },
  ring: {
    position: 'absolute',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(80,120,90,0.35)',
  },
  zoneMarkerWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  zoneDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
  },
  zoneLabel: {
    fontSize: 10,
    fontWeight: '700',
    maxWidth: 140,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  markerText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  current: {
    position: 'absolute',
    marginLeft: -7,
    marginTop: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1565C0',
    borderWidth: 3,
    borderColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  currentDot: { flex: 1 },
});