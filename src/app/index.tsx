import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RadarMap } from '@/components/radar-map';
import { SatelliteMap } from '@/components/satellite-map';
import { TerrainMap3D, type TerrainMap3DHandle } from '@/components/terrain-map-3d';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZoneBadge } from '@/components/zone-badge';
import { ZONES } from '@/data/zones';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useTheme } from '@/hooks/use-theme';
import { TARGET_LABEL } from '@/services/mineralEngineer';
import { bearing, bearingLabel, formatCoords, haversineMeters } from '@/services/geo';
import { getLastTarget, setCurrentRegion, setLastPotential, setLastTarget } from '@/services/sessionStore';
import { loadAnalyses, loadSettings } from '@/services/storage';
import { speak } from '@/services/voice';
import type { AnalysisResult, MineralTarget, PotentialSummary } from '@/types/analysis';

const RADAR_RADIUS_M = 2500;

const MINERAL_ICON: Record<MineralTarget, string> = {
  ouro: '🥇',
  diamante: '💎',
  ferro: '🧲',
  'terras raras': '🟧',
  cobre: '🟩',
  bauxita: '🟥',
  geral: '🎯',
};

const LEGEND_MINING: [string, string][] = [
  ['#1976D2', 'alto potencial'],
  ['#FFD54F', 'ouro'],
  ['#E53935', 'bauxita'],
  ['#E8E8E8', 'diamante'],
  ['#90A4AE', 'ferro'],
  ['#43A047', 'cobre'],
  ['#FB8C00', 'terras raras'],
];

const LEGEND_ZONES: [string, string][] = [
  ['#E53935', 'protegida'],
  ['#F9A825', 'exige PLG'],
  ['#43A047', 'livre'],
];

export default function HomeScreen() {
  const { gps, permission, requesting, zone, hardBlocked, fixSource, fixAt } = useGeolocation();
  const theme = useTheme();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<'3d' | 'satellite' | 'radar'>('3d');
  const [mapReady, setMapReady] = useState<boolean | null>(null);
  const [potential, setPotential] = useState<PotentialSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<string | null>(null);
  const [searchCenter, setSearchCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [target, setTarget] = useState<MineralTarget>(getLastTarget());
  const terrainRef = useRef<TerrainMap3DHandle>(null);
  const lastAnnouncedRef = useRef<string>('');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [a, s] = await Promise.all([loadAnalyses(), loadSettings()]);
        if (!active) return;
        setAnalyses(a);
        setVoiceEnabled(s.voiceEnabled);
        setTarget(getLastTarget());
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

  // Busca de região/cidade/país no mundo inteiro (geocodificação Nominatim/OSM, sem chave).
  const onSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
      const hit = data[0];
      if (hit) {
        const lat = Number.parseFloat(hit.lat);
        const lng = Number.parseFloat(hit.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('bad coords');
        setViewMode('3d');
        setSearchResult(hit.display_name ?? q);
        setCurrentRegion({ latitude: lat, longitude: lng });
        setSearchCenter({ latitude: lat, longitude: lng });
        setLastTarget(target);
        terrainRef.current?.jumpTo(lat, lng, 15);
      } else {
        setSearchError('Nada encontrado. Tente cidade, região, país ou coordenadas.');
      }
    } catch {
      setSearchError('Busca precisa de internet. Tente de novo quando estiver online.');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searching, target]);

  const onPotential = useCallback(
    (summary: PotentialSummary) => {
      setLastPotential(summary);
      setCurrentRegion(summary.at);
      setLastTarget(target);
      setPotential(summary);
    },
    [target],
  );

  const displayCenter = searchCenter ?? (gps ? gps.coords : null);
  const top = potential?.top?.[0] ?? null;
  let suggestionText: string | null = null;
  if (top && displayCenter) {
    const dist = Math.round(haversineMeters(displayCenter, { latitude: top.latitude, longitude: top.longitude }));
    const rumo = bearingLabel(bearing(displayCenter, { latitude: top.latitude, longitude: top.longitude }));
    const legal =
      top.zoneKind === 'protected'
        ? ' ⚠️ área protegida!'
        : top.zoneKind === 'permitted'
          ? ' (exige PLG)'
          : top.zoneKind === 'free'
            ? ' (livre)'
            : '';
    suggestionText = `${MINERAL_ICON[top.mineral] ?? '🎯'} ${TARGET_LABEL[top.mineral]} a ~${dist} m (${rumo})${legal} · modelo ~${Math.round(top.score * 100)}%`;
  }

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
                style={[styles.modeChip, viewMode === '3d' && styles.modeChipOn]}
                onPress={() => setViewMode('3d')}>
                <ThemedText type="small" style={viewMode === '3d' ? styles.modeChipTextOn : undefined}>
                  🌐 Júpiter 3D
                </ThemedText>
              </Pressable>
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
              {viewMode === '3d' ? (
                <>
                  <View style={styles.searchRow}>
                    <TextInput
                      style={[styles.searchInput, { backgroundColor: theme.backgroundElement, color: theme.text }]}
                      placeholder="Pesquisar região, cidade ou país no mundo…"
                      placeholderTextColor={theme.textSecondary}
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      onSubmitEditing={onSearch}
                      returnKeyType="search"
                    />
                    <Pressable style={[styles.searchBtn, searching && { opacity: 0.6 }]} onPress={onSearch}>
                      <ThemedText style={styles.searchBtnText}>{searching ? '…' : '🔍'}</ThemedText>
                    </Pressable>
                  </View>
                  {searchError && (
                    <ThemedText type="small" style={{ color: '#E53935' }}>
                      {searchError}
                    </ThemedText>
                  )}
                  <View style={styles.controlRow}>
                    <Pressable style={styles.controlChip} onPress={() => terrainRef.current?.follow(true)}>
                      <ThemedText type="small">🎯 Centro</ThemedText>
                    </Pressable>
                    <Pressable style={styles.controlChip} onPress={() => terrainRef.current?.zoom(-1)}>
                      <ThemedText type="small">➖</ThemedText>
                    </Pressable>
                    <Pressable style={styles.controlChip} onPress={() => terrainRef.current?.zoom(1)}>
                      <ThemedText type="small">➕</ThemedText>
                    </Pressable>
                    <Pressable style={styles.controlChip} onPress={() => terrainRef.current?.togglePitch()}>
                      <ThemedText type="small">🏔️ 2D/3D</ThemedText>
                    </Pressable>
                    <Pressable style={styles.controlChip} onPress={() => terrainRef.current?.analyze()}>
                      <ThemedText type="small">🔎 Analisar</ThemedText>
                    </Pressable>
                  </View>
                  {mapReady === false && (
                    <ThemedView type="backgroundElement" style={styles.warnCard}>
                      <ThemedText type="smallBold">🌐 Mapa 3D precisa de internet</ThemedText>
                      <ThemedText type="small">
                        O carregamento do mapa falhou (sem rede?). Use 🗺️ Satélite ou 📡 Radar offline (100%
                        offline) — o radar continua funcionando.
                      </ThemedText>
                    </ThemedView>
                  )}
                  <TerrainMap3D
                    ref={terrainRef}
                    center={gps.coords}
                    accuracyMeters={gps.accuracyMeters}
                    zones={ZONES}
                    markers={markerList.map((m) => ({ coords: m.coords, color: m.color }))}
                    target={target}
                    height={340}
                    onReady={setMapReady}
                    onPotential={onPotential}
                  />
                  {suggestionText && top && (
                    <Pressable
                      style={styles.suggestCard}
                      onPress={() => terrainRef.current?.jumpTo(top.latitude, top.longitude, 17)}>
                      <ThemedText type="smallBold">🔎 {suggestionText}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Toque para voar até o ponto — depois pergunte ao Engenheiro 🤖 na aba ao lado.
                      </ThemedText>
                    </Pressable>
                  )}
                  {searchResult && (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                      📍 Região pesquisada: {searchResult}
                    </ThemedText>
                  )}
                </>
              ) : viewMode === 'satellite' ? (
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
              {displayCenter
                ? `${formatCoords(displayCenter.latitude, displayCenter.longitude)} · precisão ~${Math.round(gps.accuracyMeters)} m`
                : formatCoords(gps.coords.latitude, gps.coords.longitude)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.coords}>
              {searchCenter
                ? `📍 Região pesquisada${searchResult ? ` — ${searchResult}` : ''}`
                : fixSource === 'live'
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
          <ThemedText type="smallBold">Cores do mapa (Júpiter 3D):</ThemedText>
          <View style={styles.legendRow}>
            {LEGEND_MINING.map(([color, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <ThemedText type="small">{label}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.legendRow}>
            {LEGEND_ZONES.map(([color, label]) => (
              <View key={label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: color }]} />
                <ThemedText type="small">{label}</ThemedText>
              </View>
            ))}
            <ThemedText type="small" themeColor="textSecondary">
              · radar offline {RADAR_RADIUS_M / 1000} km
            </ThemedText>
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            Potencial = estimativa do modelo de terreno (elevação/declividade). Confirme sempre em campo — e nunca em
            área protegida sem PLG.
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
  searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  searchInput: { flex: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchBtn: { borderRadius: 10, backgroundColor: '#1565C0', paddingHorizontal: 12, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontSize: 16 },
  controlRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  controlChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    backgroundColor: 'rgba(21,101,192,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  suggestCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(25,118,210,0.5)',
    backgroundColor: 'rgba(25,118,210,0.10)',
    padding: 10,
    gap: 2,
  },
  legend: { alignItems: 'center', marginTop: 6, gap: 4 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(0,0,0,0.25)' },
});