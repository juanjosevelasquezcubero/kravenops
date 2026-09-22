import * as Location from 'expo-location';

import type { LatLng } from '@/types/analysis';

export interface GpsState {
  coords: LatLng;
  accuracyMeters: number;
  headingDegrees: number | null;
  timestamp: number;
}

export function toLatLng(loc: Location.LocationObject): LatLng {
  return {
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
  };
}

export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function getGpsState(): Promise<GpsState> {
  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });
  return {
    coords: toLatLng(loc),
    accuracyMeters: loc.coords.accuracy ?? 0,
    headingDegrees: loc.coords.heading,
    timestamp: loc.timestamp,
  };
}

/**
 * Último sinal de GPS registrado pelo aparelho (funciona mesmo offline,
 * pois o chip de GPS guarda o último fix). Retorna null se nunca houve sinal.
 */
export async function getLastKnown(): Promise<GpsState | null> {
  try {
    const loc = await Location.getLastKnownPositionAsync();
    if (!loc) return null;
    return {
      coords: toLatLng(loc),
      accuracyMeters: loc.coords.accuracy ?? 0,
      headingDegrees: loc.coords.heading,
      timestamp: loc.timestamp,
    };
  } catch {
    return null;
  }
}

export type LocationWatcher = {
  stop: () => void;
};

/**
 * Assina atualizações contínuas de posição com a MELHOR PRECISÃO possível
 * (Accuracy.Highest) e intervalo de 2 m. Falha graciosamente.
 */
export function watchLocation(onUpdate: (state: GpsState) => void): LocationWatcher {
  let stopped = false;
  const sub = Location.watchPositionAsync(
    { accuracy: Location.Accuracy.Highest, distanceInterval: 2 },
    (loc) => {
      if (stopped) return;
      onUpdate({
        coords: toLatLng(loc),
        accuracyMeters: loc.coords.accuracy ?? 0,
        headingDegrees: loc.coords.heading,
        timestamp: loc.timestamp,
      });
    },
  );
  // watchPositionAsync rejeita em aparelhos sem GPS / com provedor desligado.
  sub.catch(() => {
    // O hook usa o último sinal conhecido como fallback.
  });

  return {
    stop: () => {
      stopped = true;
      sub.then((s) => s.remove()).catch(() => {});
    },
  };
}