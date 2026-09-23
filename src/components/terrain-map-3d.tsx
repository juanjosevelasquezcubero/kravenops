import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { makeTerrainMapHtml } from '@/services/terrain-map-html';
import type { LatLng, MineZone, MineralTarget, PotentialSummary } from '@/types/analysis';

/**
 * Mapa 3D estilo Google Earth dentro de um WebView (MapLibre GL JS).
 * - Satélite mundial (Esri) + terreno 3D real (AWS Terrarium), sem API key.
 * - Motor de potencial mineral In-JS: áreas azuis + pontos coloridos por minério.
 * - A Home (ou o chat) controla o mapa via handle imperativo.
 *
 * Requer internet (CDN + tiles). Sem rede, o app indica e usa Radar/Satélite 2D.
 */
export interface TerrainMap3DHandle {
  jumpTo: (lat: number, lng: number, zoom?: number) => void;
  analyze: () => void;
  setTarget: (target: MineralTarget) => void;
  setPotentialVisible: (visible: boolean) => void;
  follow: (on: boolean) => void;
  zoom: (d: 1 | -1) => void;
  togglePitch: () => void;
}

export interface TerrainMap3DProps {
  center: LatLng | null;
  accuracyMeters?: number;
  zones: MineZone[];
  /** Marcadores de análises anteriores. */
  markers: { coords: LatLng; color: string }[];
  target?: MineralTarget;
  height?: number;
  onReady?: (ok: boolean) => void;
  onPotential?: (summary: PotentialSummary) => void;
  onClick?: (lat: number, lng: number, zoneKind: string | null) => void;
  onTerrainChange?: (ok: boolean) => void;
}

export const TerrainMap3D = forwardRef<TerrainMap3DHandle, TerrainMap3DProps>(function TerrainMap3D(
  { center, accuracyMeters = 0, zones, markers, target = 'ouro', height = 400, onReady, onPotential, onClick, onTerrainChange },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Record<string, unknown>[]>([]);
  const [terrainOk, setTerrainOk] = useState<boolean | null>(null);

  const html = useMemo(() => makeTerrainMapHtml(), []);

  const send = useCallback((msg: Record<string, unknown>) => {
    const payload = `window.kravenOps && window.kravenOps(${JSON.stringify(msg)})`;
    if (!readyRef.current) {
      queueRef.current.push(msg);
      return;
    }
    try {
      webRef.current?.injectJavaScript(payload);
    } catch {
      // WebView ainda não disponível; restart sincroniza de novo.
      readyRef.current = false;
      queueRef.current.unshift(msg);
    }
  }, []);

  const flushSync = useCallback(() => {
    readyRef.current = true;
    const queue = queueRef.current;
    queueRef.current = [];
    for (const m of queue) {
      try {
        webRef.current?.injectJavaScript(`window.kravenOps && window.kravenOps(${JSON.stringify(m)})`);
      } catch {
        break;
      }
    }
  }, []);

  const sendSync = useCallback(() => {
    send({
      cmd: 'sync',
      zones,
      markers,
      target,
      potentialVisible: true,
      gps: center ? { lat: center.latitude, lng: center.longitude, acc: accuracyMeters || 0 } : null,
    });
  }, [center, zones, markers, target, accuracyMeters, send]);

  useImperativeHandle(ref, () => ({
    jumpTo: (lat, lng, zoom) => send({ cmd: 'jumpTo', lat, lng, zoom }),
    analyze: () => send({ cmd: 'analyze' }),
    setTarget: (t) => send({ cmd: 'setTarget', target: t }),
    setPotentialVisible: (v) => send({ cmd: 'setPotentialVisible', visible: v }),
    follow: (on) => send({ cmd: 'follow', on }),
    zoom: (d) => send({ cmd: 'zoom', d }),
    togglePitch: () => send({ cmd: 'pitch' }),
  }));

  // Sincroniza posição/marcadores/alvo conforme props mudam.
  useEffect(() => {
    send({ cmd: 'setGps', gps: center ? { lat: center.latitude, lng: center.longitude, acc: accuracyMeters || 0 } : null });
  }, [center, accuracyMeters, send]);

  useEffect(() => {
    send({ cmd: 'setMarkers', markers });
  }, [markers, send]);

  useEffect(() => {
    send({ cmd: 'setTarget', target });
  }, [target, send]);

  // Timeout de prontidão (sem internet: CDN não carrega → avisar o usuário).
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) onReady?.(false);
    }, 15000);
    return () => clearTimeout(timer);
  }, [onReady]);

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ready':
          flushSync();
          sendSync();
          onReady?.(true);
          break;
        case 'potential':
          onPotential?.(msg.summary as unknown as PotentialSummary);
          break;
        case 'terrain':
          setTerrainOk(!!msg.ok);
          onTerrainChange?.(!!msg.ok);
          break;
        case 'clicked':
          onClick?.(Number(msg.lat), Number(msg.lng), msg.zoneKind ? String(msg.zoneKind) : null);
          break;
        case 'initError':
        case 'mapError':
          // console.warn('[mapa3d]', msg.message); // silencioso para o usuário
          break;
      }
    },
    [flushSync, sendSync, onReady, onPotential, onClick, onTerrainChange],
  );

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        setSupportMultipleWindows={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
      {terrainOk === false && (
        <View style={styles.banner} pointerEvents="none">
          <ThemedText type="small">⛰️ Terreno 3D indisponível sem rede. O satélite continua visível.</ThemedText>
        </View>
      )}
      <Pressable style={styles.credit} onPress={() => send({ cmd: 'pitch' })}>
        <ThemedText type="small">🌐 3D Esri + AWS Terrain · toque p/ inclinar</ThemedText>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#0b1e33' },
  web: { flex: 1, backgroundColor: '#0b1e33' },
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
  credit: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});