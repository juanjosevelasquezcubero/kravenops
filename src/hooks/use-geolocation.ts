import { useEffect, useRef, useState } from 'react';

import { getLastKnown, requestLocationPermission, watchLocation, type GpsState } from '@/services/geolocation';
import { loadLastFix, loadPermits } from '@/services/storage';
import { resolveZoneStatus, zoneAt } from '@/services/geo';
import { ZONES } from '@/data/zones';
import type { FixSource, PermitRecord, ZoneStatus } from '@/types/analysis';

export interface ZoneResolved {
  id: string;
  name: string;
  status: ZoneStatus;
}

export interface GeolocationState {
  gps: GpsState | null;
  permission: boolean | null;
  requesting: boolean;
  zone: ZoneResolved | null;
  /** Zona bloqueada por lei (mesmo com permissão para verificação). */
  hardBlocked: boolean;
  /**
   * Origem do fix atual:
   * - 'live'        → GPS em tempo real (melhor precisão)
   * - 'last-known'  → último sinal registrado pelo aparelho
   * - 'saved-point' → último ponto que o garimpeiro pediu p/ analisar (persistido)
   */
  fixSource: FixSource | null;
  /** Timestamp do fix atual. */
  fixAt: number | null;
}

export function useGeolocation(): GeolocationState {
  const [gps, setGps] = useState<GpsState | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(true);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [fixSource, setFixSource] = useState<FixSource | null>(null);
  const [fixAt, setFixAt] = useState<number | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const granted = await requestLocationPermission();
        if (!mounted) return;
        setPermission(granted);
        if (!granted) {
          setRequesting(false);
          return;
        }
        const permitsStored = await loadPermits();
        if (mounted) setPermits(permitsStored);

        // 1) GPS em tempo real (o watcher marca o fix como 'live').
        const watcher = watchLocation((state) => {
          if (!mounted) return;
          setGps(state);
          setFixSource('live');
          setFixAt(state.timestamp);
        });
        stopRef.current = watcher.stop;

        // 2) Último sinal conhecido do aparelho (funciona offline).
        const last = await getLastKnown();
        if (mounted && last) {
          setGps(last);
          setFixAt(last.timestamp);
          // Se o watcher ainda não respondeu, este fix é 'last-known'.
          setFixSource((current) => (current === 'live' ? current : 'last-known'));
        }

        // 3) Último ponto que o garimpeiro pediu para analisar (persistido).
        if (mounted) {
          const saved = await loadLastFix();
          if (saved && !last) {
            setGps({
              coords: { latitude: saved.latitude, longitude: saved.longitude },
              accuracyMeters: saved.accuracyMeters,
              headingDegrees: null,
              timestamp: saved.fixedAt,
            });
            setFixAt(saved.fixedAt);
            setFixSource((current) => (current === 'live' ? current : 'saved-point'));
          }
        }
      } catch {
        // Nunca deixa o app preso em "localizando": degrada para sem GPS.
      } finally {
        if (mounted) setRequesting(false);
      }
    })();
    return () => {
      mounted = false;
      stopRef.current?.();
    };
  }, []);

  let zone: ZoneResolved | null = null;
  let hardBlocked = false;
  if (gps) {
    const found = zoneAt(gps.coords, ZONES);
    if (found) {
      const status = resolveZoneStatus(found, permits);
      zone = { id: found.id, name: found.name, status };
      hardBlocked = status === 'blocked';
    }
  }

  return { gps, permission, requesting, zone, hardBlocked, fixSource, fixAt };
}