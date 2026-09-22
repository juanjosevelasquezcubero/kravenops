import { useEffect, useRef, useState } from 'react';

import { getLastKnown, requestLocationPermission, watchLocation, type GpsState } from '@/services/geolocation';
import { loadPermits } from '@/services/storage';
import { resolveZoneStatus, zoneAt } from '@/services/geo';
import { ZONES } from '@/data/zones';
import type { PermitRecord, ZoneStatus } from '@/types/analysis';

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
}

export function useGeolocation(): GeolocationState {
  const [gps, setGps] = useState<GpsState | null>(null);
  const [permission, setPermission] = useState<boolean | null>(null);
  const [requesting, setRequesting] = useState(true);
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const granted = await requestLocationPermission();
      if (!mounted) return;
      setPermission(granted);
      if (!granted) {
        setRequesting(false);
        return;
      }
      const permitsStored = await loadPermits();
      if (mounted) setPermits(permitsStored);

      const watcher = watchLocation((state) => {
        if (mounted) setGps(state);
      });
      stopRef.current = watcher.stop;

      // Estado imediato enquanto o watcher aquece.
      const last = await getLastKnown();
      if (mounted && last) setGps(last);
      setRequesting(false);
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

  return { gps, permission, requesting, zone, hardBlocked };
}