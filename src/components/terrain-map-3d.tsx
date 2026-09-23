import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { makeGoogleEarthHtml } from '@/services/google-earth-html';
import { makeTerrainMapHtml } from '@/services/terrain-map-html';
import type { LatLng, MineZone, MineralTarget, PotentialSummary } from '@/types/analysis';

/**
 * Mapa 3D estilo Google Earth dentro de um WebView.
 * - Com `ionToken` (Cesium ion): **Google Photorealistic 3D Tiles** — os MESMOS dados 3D
 *   do Google Earth (fotorealístico mundial), via CesiumJS.
 * - Sem token: mapa 3D reserva (MapLibre + Esri + AWS Terrarium), sem API key.
 * - Motor de potencial mineral em JS nos dois motores: áreas azuis + pontos coloridos.
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
  /** Token do Cesium ion → ativa o Google Earth 3D real (Photorealistic 3D Tiles). */
  ionToken?: string;
  onReady?: (ok: boolean) => void;
  onPotential?: (summary: PotentialSummary) => void;
  onClick?: (lat: number, lng: number, zoneKind: string | null) => void;
  onTerrainChange?: (ok: boolean) => void;
}

export const TerrainMap3D = forwardRef<TerrainMap3DHandle, TerrainMap3DProps>(function TerrainMap3D(
  {
    center,
    accuracyMeters = 0,
    zones,
    markers,
    target = 'ouro',
    height = 400,
    ionToken,
    onReady,
    onPotential,
    onClick,
    onTerrainChange,
  },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const queueRef = useRef<Record<string, unknown>[]>([]);
  const [terrainOk, setTerrainOk] = useState<boolean | null>(null);
  const [mapError, setMapError] = useState('');
  const [engineNote, setEngineNote] = useState('');
  // 'auto' = usa Google Earth 3D se houver token; 'fallback' = força o mapa reserva (Júpiter).
  const [engine, setEngine] = useState<'auto' | 'fallback'>('auto');

  const googleWanted = !!ionToken && ionToken.trim().length > 8;
  const useGoogle = googleWanted && engine === 'auto';
  const html = useMemo(
    () => (useGoogle ? makeGoogleEarthHtml((ionToken ?? '').trim()) : makeTerrainMapHtml()),
    [useGoogle, ionToken],
  );

  // Token mudou nos Ajustes → tenta o Google de novo e limpa avisos antigos.
  useEffect(() => {
    setEngine('auto');
    setEngineNote('');
    setMapError('');
  }, [ionToken]);

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
  // O motor Google Earth (Cesium) é bem maior que o MapLibre → mais tempo.
  // Se o Google não responder no prazo, cai automaticamente para o mapa reserva.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!readyRef.current) {
        if (useGoogle) {
          readyRef.current = false;
          setEngine('fallback');
          setEngineNote(
            'Google Earth 3D não carregou (confira o token e a internet). Usando o mapa 3D reserva (Júpiter).',
          );
        }
        onReady?.(false);
      }
    }, useGoogle ? 25000 : 15000);
    return () => clearTimeout(timer);
  }, [onReady, useGoogle]);

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
          setMapError('');
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
          if (useGoogle) {
            // Google 3D falhou → cai automaticamente para o mapa reserva (Júpiter).
            readyRef.current = false;
            setMapError('');
            setEngine('fallback');
            setEngineNote(
              'Google Earth 3D não carregou (confira o token ou o Wi-Fi). Usando o mapa 3D reserva (Júpiter).',
            );
          } else {
            // Mostra a mensagem específica no banner (ex.: sem internet para o CDN).
            setMapError(String(msg.message ?? 'Ocorreu um erro no mapa 3D.'));
          }
          onReady?.(true);
          break;
      }
    },
    [flushSync, sendSync, onReady, onPotential, onClick, onTerrainChange, useGoogle],
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
      <View style={styles.topStack} pointerEvents="none">
        {!!engineNote && (
          <View style={styles.noteBanner}>
            <ThemedText type="small">ℹ️ {engineNote}</ThemedText>
          </View>
        )}
        {!!mapError && (
          <View style={styles.errorBanner}>
            <ThemedText type="small">⚠️ {mapError}</ThemedText>
          </View>
        )}
        {terrainOk === false && (
          <View style={styles.banner}>
            <ThemedText type="small">⛰️ Terreno 3D indisponível sem rede. O satélite continua visível.</ThemedText>
          </View>
        )}
      </View>
      <Pressable style={styles.credit} onPress={() => send({ cmd: 'pitch' })}>
        <ThemedText type="small">
          {useGoogle ? '🌐 Google Earth 3D · toque p/ inclinar' : '🗺️ 3D Esri + AWS Terrain · toque p/ inclinar'}
        </ThemedText>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#0b1e33' },
  web: { flex: 1, backgroundColor: '#0b1e33' },
  topStack: { position: 'absolute', left: 8, right: 8, top: 8, gap: 6 },
  banner: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  errorBanner: {
    backgroundColor: 'rgba(120,18,18,0.88)',
    borderWidth: 1,
    borderColor: '#E53935',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  noteBanner: {
    backgroundColor: 'rgba(21,101,192,0.85)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  credit: { position: 'absolute', left: 8, bottom: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
});