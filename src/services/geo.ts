import type { LatLng, MineZone, PermitRecord, ZoneProximity, ZoneStatus } from '@/types/analysis';

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Distância entre dois pontos em metros (fórmula de Haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Ray casting: retorna true se o ponto está dentro do polígono. */
export function pointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;
    const intersect =
      yi > point.longitude !== yj > point.longitude &&
      point.latitude < ((xj - xi) * (point.longitude - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Zonas que contêm o ponto, ordenadas por prioridade (protected > permitted > free). */
export function zoneAt(point: LatLng, zones: MineZone[]): MineZone | null {
  const contained = zones.filter((z) => pointInPolygon(point, z.polygon));
  const priority: Record<MineZone['kind'], number> = { protected: 0, permitted: 1, free: 2 };
  contained.sort((a, b) => priority[a.kind] - priority[b.kind]);
  return contained[0] ?? null;
}

/** Distância aproximada do ponto ao polígono (mínima entre vértices). */
export function distanceToZone(point: LatLng, zone: MineZone): number {
  let min = Infinity;
  for (const vertex of zone.polygon) {
    const d = haversineMeters(point, vertex);
    if (d < min) min = d;
  }
  return min;
}

/** Zonas próximas dentro de um raio, com distância. */
export function nearbyZones(point: LatLng, zones: MineZone[], radiusMeters: number): ZoneProximity[] {
  return zones
    .map((zone) => ({ zone, distanceMeters: distanceToZone(point, zone) }))
    .filter((p) => p.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

/**
 * Resolve o status da zona no ponto:
 * - protected sem PLG registrada => 'blocked' (BLOQUEIO TOTAL)
 * - protected com PLG registrada => 'verified'
 * - permitted => 'permitted'
 * - free => 'free'
 */
export function resolveZoneStatus(zone: MineZone | null, permits: PermitRecord[]): ZoneStatus {
  if (!zone) return 'free';
  if (zone.kind === 'protected') {
    const hasPermit = permits.some((p) => p.zoneId === zone.id && p.plgNumber.trim().length > 0);
    return hasPermit ? 'verified' : 'blocked';
  }
  if (zone.kind === 'permitted') return 'permitted';
  return 'free';
}

export const ZONE_STATUS_LABEL: Record<ZoneStatus, string> = {
  blocked: 'BLOQUEADA — área protegida',
  verified: 'VERIFICADA — PLG registrada',
  permitted: 'PERMITIDA — exige PLG',
  free: 'LIVRE — operação permitida',
};

export const ZONE_STATUS_COLOR: Record<ZoneStatus, string> = {
  blocked: '#E53935',
  verified: '#43A047',
  permitted: '#F9A825',
  free: '#43A047',
};

/** Rumo (0–360°, N=0) de a para b. */
export function bearing(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function bearingLabel(deg: number): string {
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const idx = Math.round(((deg % 360) + 360) % 360 / 45) % 8;
  return dirs[idx];
}

export function formatCoords(lat: number, lng: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'L' : 'O';
  return `${Math.abs(lat).toFixed(5)}°${ns} ${Math.abs(lng).toFixed(5)}°${ew}`;
}

/** Projeta LatLng relativo ao centro em coordenadas de tela (metros -> pixels). */
export function projectToRadar(
  point: LatLng,
  center: LatLng,
  centerPx: number,
  pxPerMeter: number,
): { x: number; y: number } {
  const dLngMeters = (point.longitude - center.longitude) * 111320 * Math.cos(toRad(center.latitude));
  const dLatMeters = (point.latitude - center.latitude) * 110540;
  return {
    x: centerPx + dLngMeters * pxPerMeter,
    y: centerPx - dLatMeters * pxPerMeter,
  };
}