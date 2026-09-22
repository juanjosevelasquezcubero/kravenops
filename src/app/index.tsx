import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RadarMap } from '@/components/radar-map';
import { SatelliteMap } from '@/components/satellite-map';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZoneBadge } from '@/components/zone-badge';
import { ZONES } from '@/data/zones';
import { useGeolocation } from '@/hooks/use-geolocation';
import { formatCoords } from '@/services/geo';
import { loadAnalyses, loadSettings } from '@/services/storage';
import { speak } from '@/services/voice';
import type { AnalysisResult } from '@/types/analysis';

const RADAR_RADIUS_M = 2500;

export default function HomeScreen() {
  const { gps, permission, requesting, zone, hardBlocked, fixSource, fixAt } = useGeolocation();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<'radar' | 'satellite'>('satellite');
  const lastAnnouncedRef = useRef<string>('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [a, s] = await Promise.all([loadAnalyses(), loadSettings()]);
        if (!active) return;
        setAnalyses(a);
        setVoiceEnabled(s.voiceEnabled);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  // Alerta de voz ao entrar em zona bloqueada (uma vez por zona).
  useEffect(() => {
    if (!zone) return;
    const key = `${zone.id}:${zone.status}`;
    if (key === lastAnnouncedRef.current) return;
    lastAnnouncedRef.current = key;
    if (zone.status === 'blocked') {
      speak(
        `Atenção. Você está em área protegida: ${zone.name}. A operação está bloqueada neste local. Registre um documento de permissão de lavra garimpeira válido para liberar a análise.`,
        voiceEnabled,
      );
    } else if (zone.status === 'verified') {
      speak(`Permissão verificada para ${zone.name}. Você pode operar legalmente.`, voiceEnabled);
    }
  }, [zone, voiceEnabled]);

  const markerList = analyses.map((a) => ({
    label: a.confidence >= 0.6 ? 'alto' : 'baixo',
    color: a.confidence >= 0.6 ? '#F9A825' : '#90A4AE',
    coords: { latitude: a.latitude, longitude: a.longitude },
  }));

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">KravenOps</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Garimpo inteligente e legal
          </ThemedText>
        </View>

        {requesting && (
          <ThemedText type="small" themeColor="textSecondary">
            Localizando via GPS…
          </ThemedText>
        )}

        {!requesting && !permission && (
          <ThemedView type="backgroundElement" style={styles.warnCard}>
            <ThemedText type="smallBold">Sem permissão de localização</ThemedText>
            <ThemedText type="small">
              O radar e o bloqueio de áreas protegidas dependem do GPS. Autorize nas configurações do sistema.
            </ThemedText>
          </ThemedView>
        )}

        {hardBlocked && (
          <ThemedView type="backgroundElement" style={[styles.warnCard, styles.blockedCard]}>
            <ThemedText style={[styles.blockedTitle, { color: '#E53935' }]}>⛔ ÁREA BLOQUEADA</ThemedText>
            <ThemedText type="small">
              Você está dentro de {zone?.name ?? 'área protegida'}. Operação de garimpo é proibida por lei aqui.
              Cadastre uma PLG válida (órgão ANM/FUNAI) em Ajustes para verificar e liberar.
            </ThemedText>
          </ThemedView>
        )}

        {gps && (
          <>
            <View style={styles.zoneRow}>
              {zone ? (
                <>
                  <ZoneBadge status={zone.status} />
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.zoneName}>
                    {zone.name}
                  </ThemedText>
                </>
              ) : (
                <ZoneBadge status="free" />
              )}
            </View>

            <View style={styles.modeRow}>
              <Pressable
                style={[styles.modeChip, viewMode === 'satellite' && styles.modeChipOn]}
                onPress={() => setViewMode('satellite')}>
                <ThemedText type="small" style={viewMode === 'satellite' ? styles.modeChipTextOn : undefined}>
                  🗺️ Satélite
                </ThemedText>
              </Pressable>
              <Pressable
                style={[styles.modeChip, viewMode === 'radar' && styles.modeChipOn]}
                onPress={() => setViewMode('radar')}>
                <ThemedText type="small" style={viewMode === 'radar' ? styles.modeChipTextOn : undefined}>
                  📡 Radar offline
                </ThemedText>
              </Pressable>
            </View>

            <View style={styles.mapWrap}>
              {viewMode === 'satellite' ? (
                <SatelliteMap
                  center={gps.coords}
                  zones={ZONES}
                  markers={markerList.map((m) => ({ coords: m.coords, color: m.color }))}
                  height={360}
                />
              ) : (
                <View style={styles.radarWrap}>
                  <RadarMap
                    center={gps.coords}
                    size={296}
                    radiusMeters={RADAR_RADIUS_M}
                    zones={ZONES}
                    markers={markerList}
                  />
                </View>
              )}
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.coords}>
              {formatCoords(gps.coords.latitude, gps.coords.longitude)} · precisão ~{Math.round(gps.accuracyMeters)} m
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.coords}>
              {fixSource === 'live'
                ? '🛰️ GPS ao vivo'
                : fixSource === 'last-known'
                  ? `📍 Último sinal do aparelho${fixAt ? ` — ${new Date(fixAt).toLocaleTimeString('pt-BR')}` : ''}`
                  : fixSource === 'saved-point'
                    ? `🏷️ Ponto salvo (última análise solicitada${fixAt ? ` — ${new Date(fixAt).toLocaleTimeString('pt-BR')}` : ''})`
                    : 'Sem sinal de GPS'}
            </ThemedText>
          </>
        )}

        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.primary]} onPress={() => router.push('/camera')}>
            <ThemedText style={styles.primaryText}>📷 Analisar Foto</ThemedText>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => router.push('/history')}>
            <ThemedText>📜 Histórico</ThemedText>
          </Pressable>
          <Pressable style={[styles.button, styles.secondary]} onPress={() => router.push('/settings')}>
            <ThemedText>⚙️ Ajustes</ThemedText>
          </Pressable>
        </View>

        <View style={styles.legend}>
          <ThemedText type="small">
            🔴 protegida · 🟡 exige PLG · 🟢 livre — satélite com internet; radar offline {RADAR_RADIUS_M / 1000} km
          </ThemedText>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, gap: 12 },
  header: { gap: 2 },
  warnCard: {
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  blockedCard: { borderWidth: 2, borderColor: '#E53935' },
  blockedTitle: { fontSize: 18, fontWeight: '800' },
  zoneRow: { gap: 6 },
  zoneName: { maxWidth: '100%' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  modeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  modeChipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  modeChipTextOn: { color: '#fff', fontWeight: '700' },
  mapWrap: { marginTop: 8 },
  radarWrap: { alignItems: 'center', marginTop: 4 },
  coords: { textAlign: 'center', fontFamily: 'monospace' },
  actions: { gap: 8, marginTop: 8 },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primary: { backgroundColor: '#1565C0' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { backgroundColor: 'rgba(21,101,192,0.12)' },
  legend: { alignItems: 'center', marginTop: 4 },
});