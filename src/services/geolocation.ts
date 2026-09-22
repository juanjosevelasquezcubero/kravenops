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
    accuracy: Location.Accuracy.Balanced,
  });
  return {
    coords: toLatLng(loc),
    accuracyMeters: loc.coords.accuracy ?? 0,
    headingDegrees: loc.coords.heading,
    timestamp: loc.timestamp,
  };
}

export async function getLastKnown(): Promise<GpsState | null> {
  const loc = await Location.getLastKnownPositionAsync();
  if (!loc) return null;
  return {
    coords: toLatLng(loc),
    accuracyMeters: loc.coords.accuracy ?? 0,
    headingDegrees: loc.coords.heading,
    timestamp: loc.timestamp,
  };
}

export type LocationWatcher = {
  stop: () => void;
};

/** Assina atualizações contínuas de posição. */
export function watchLocation(onUpdate: (state: GpsState) => void): LocationWatcher {
  const sub = Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, distanceInterval: 5 },
    (loc) =>
      onUpdate({
        coords: toLatLng(loc),
        accuracyMeters: loc.coords.accuracy ?? 0,
        headingDegrees: loc.coords.heading,
        timestamp: loc.timestamp,
      }),
  );
  return {
    stop: () => {
      sub.then((s) => s.remove());
    },
  };
}