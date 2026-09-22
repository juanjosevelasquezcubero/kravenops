import { CameraView, useCameraPermissions, type CameraCapturedPicture } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGeolocation } from '@/hooks/use-geolocation';
import { runMiningAnalysis } from '@/services/mineralEngineer';
import { loadSettings, saveAnalysis } from '@/services/storage';
import { speak } from '@/services/voice';
import type { AnalysisResult, ObservationInput } from '@/types/analysis';

const ROCK_OPTIONS: ObservationInput['rockType'][] = ['quartzo', 'xisto', 'granito', 'sedimentar', 'laterita', 'outro'];
const STRUCTURE_OPTIONS: ObservationInput['estructura'][] = ['veio', 'bolsao', 'disseminado', 'solo'];

function Chip({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function ToggleRow({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) {
  return (
    <Pressable onPress={onToggle} style={styles.toggleRow}>
      <ThemedText type="small">{label}</ThemedText>
      <View style={[styles.toggleBox, value && styles.toggleBoxOn]}>
        <ThemedText type="small" style={value ? styles.toggleTextOn : undefined}>
          {value ? 'SIM' : 'NÃO'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photo, setPhoto] = useState<CameraCapturedPicture | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);

  const [rockType, setRockType] = useState<ObservationInput['rockType']>('quartzo');
  const [hardness, setHardness] = useState<ObservationInput['hardness']>('media');
  const [manualDig, setManualDig] = useState(true);
  const [veining, setVeining] = useState(true);
  const [sulfide, setSulfide] = useState(false);
  const [alteration, setAlteration] = useState(false);
  const [quartz, setQuartz] = useState(true);
  const [estructura, setEstructura] = useState<ObservationInput['estructura']>('veio');

  const { gps, zone, hardBlocked } = useGeolocation();

  // Mensagem deriva do estado (sem setState síncrono em effect).
  const blockError = hardBlocked
    ? `⛔ Área protegida (${zone?.name ?? 'zona'}). Análise bloqueada por lei. Registre uma PLG válida em Ajustes.`
    : manualError;

  const capture = useCallback(async () => {
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6, base64: true });
      if (shot) setPhoto(shot);
    } catch {
      // preview não pronto ainda
    }
  }, []);

  const analyze = useCallback(async () => {
    if (!gps) {
      setManualError('GPS ainda não disponível. Aguarde a localização para analisar.');
      return;
    }
    if (hardBlocked) {
      setManualError(
        `⛔ Área protegida (${zone?.name ?? ''}). Análise bloqueada por lei. Registre uma PLG válida em Ajustes.`,
      );
      return;
    }
    setManualError(null);
    setAnalyzing(true);
    try {
      const settings = await loadSettings();
      const input: ObservationInput = {
        rockType,
        hardness,
        manualDig,
        veining,
        sulfide,
        alteration,
        quartz,
        estructura,
        imageBase64: photo?.base64,
      };
      const ctx = {
        latitude: gps.coords.latitude,
        longitude: gps.coords.longitude,
        zoneName: zone?.name ?? null,
        zoneStatus: zone?.status ?? ('free' as const),
        operatorName: settings.operatorName,
      };
      const analysis = await runMiningAnalysis(input, ctx, settings.apiUrl, settings.apiKey);
      analysis.imageUri = photo?.uri;
      await saveAnalysis(analysis);
      setResult(analysis);
      speak(analysis.recommendation, settings.voiceEnabled);
    } finally {
      setAnalyzing(false);
    }
  }, [gps, hardBlocked, zone, rockType, hardness, manualDig, veining, sulfide, alteration, quartz, estructura, photo]);

  const reset = useCallback(() => {
    setPhoto(null);
    setResult(null);
    setManualError(null);
  }, []);

  if (!permission) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.pad}>
          <ThemedText>Carregando câmera…</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.pad}>
          <ThemedText type="subtitle">Câmera</ThemedText>
          <ThemedText type="small">
            Precisamos da câmera para fotografar rochas, veios e frentes de trabalho para a análise.
          </ThemedText>
          <Pressable style={styles.button} onPress={requestPermission}>
            <ThemedText style={styles.buttonText}>Autorizar câmera</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (result) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.pad}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <ThemedText type="subtitle">Resultado</ThemedText>
            {result.imageUri && (
              <Image source={{ uri: result.imageUri }} style={styles.resultImage} resizeMode="cover" />
            )}
            <ThemedView type="backgroundElement" style={styles.resultCard}>
              <ThemedText type="smallBold">Recomendação do engenheiro de minérios</ThemedText>
              <ThemedText>{result.recommendation}</ThemedText>
            </ThemedView>
            <ThemedView type="backgroundElement" style={styles.resultCard}>
              <ThemedText type="smallBold">Indicadores</ThemedText>
              {result.indicators.map((ind, i) => (
                <ThemedText key={i} type="small">
                  • {ind}
                </ThemedText>
              ))}
            </ThemedView>
            <ThemedText type="small" themeColor="textSecondary">
              Rumo: {result.direction ?? '—'} · Profundidade: {result.depth ?? '—'} · Confiança:{' '}
              {Math.round(result.confidence * 100)}%
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Fonte: {result.source === 'ai' ? '🤖 IA de visão' : '📡 Heurística offline (sem internet)'}
            </ThemedText>
            <Pressable style={[styles.button, styles.primary]} onPress={() => speak(result.recommendation, true)}>
              <ThemedText style={styles.buttonText}>🔊 Ouvir</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={reset}>
              <ThemedText>Nova foto</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={() => router.push('/history')}>
              <ThemedText>Histórico</ThemedText>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.pad}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle">Câmera</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="small" themeColor="textSecondary">
              ← Voltar
            </ThemedText>
          </Pressable>
        </View>

        {blockError && (
          <ThemedView type="backgroundElement" style={[styles.blockCard, hardBlocked && styles.blockCardRed]}>
            <ThemedText
              type="smallBold"
              style={hardBlocked ? { color: '#E53935' } : undefined}>
              {hardBlocked ? '⛔ ' : ''}{blockError}
            </ThemedText>
          </ThemedView>
        )}

        {photo ? (
          <>
            <Image source={{ uri: photo.uri }} style={styles.preview} resizeMode="cover" />
            <ScrollView contentContainerStyle={styles.obsPanel}>
              <ThemedText type="smallBold">Observações de campo</ThemedText>

              <ThemedText type="small" themeColor="textSecondary">Material</ThemedText>
              <View style={styles.chipRow}>
                {ROCK_OPTIONS.map((r) => (
                  <Chip key={r} selected={rockType === r} label={r} onPress={() => setRockType(r)} />
                ))}
              </View>

              <ThemedText type="small" themeColor="textSecondary">Dureza</ThemedText>
              <View style={styles.chipRow}>
                {(['baixa', 'media', 'alta'] as const).map((h) => (
                  <Chip key={h} selected={hardness === h} label={h} onPress={() => setHardness(h)} />
                ))}
              </View>

              <ThemedText type="small" themeColor="textSecondary">Estrutura do corpo</ThemedText>
              <View style={styles.chipRow}>
                {STRUCTURE_OPTIONS.map((s) => (
                  <Chip key={s} selected={estructura === s} label={s} onPress={() => setEstructura(s)} />
                ))}
              </View>

              <ToggleRow label="Veios visíveis" value={veining} onToggle={() => setVeining((v) => !v)} />
              <ToggleRow label="Quartzo" value={quartz} onToggle={() => setQuartz((v) => !v)} />
              <ToggleRow label="Provável sulfeto" value={sulfide} onToggle={() => setSulfide((v) => !v)} />
              <ToggleRow label="Alteração/oxidação" value={alteration} onToggle={() => setAlteration((v) => !v)} />
              <ToggleRow label="Escavação manual" value={manualDig} onToggle={() => setManualDig((v) => !v)} />

              <Pressable
                style={[styles.button, styles.primary, analyzing && styles.disabled]}
                disabled={analyzing || hardBlocked}
                onPress={analyze}>
                <ThemedText style={styles.buttonText}>
                  {analyzing ? 'Analisando…' : '🤖 Analisar com o engenheiro de minérios'}
                </ThemedText>
              </Pressable>
              <Pressable style={styles.button} onPress={reset}>
                <ThemedText>Tirar outra foto</ThemedText>
              </Pressable>
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.cameraBox}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" enableTorch={false} />
            </View>
            <Pressable
              style={[styles.button, styles.primary, { marginTop: 12 }]}
              disabled={hardBlocked}
              onPress={capture}>
              <ThemedText style={styles.buttonText}>
                {hardBlocked ? '⛔ Bloqueado nesta área' : '📷 Fotografar'}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              Fotografe o afloramento, veios de quartzo, sulfetos e a rocha encaixante com boa luz.
            </ThemedText>
          </>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  blockCard: { borderRadius: 12, padding: 12, gap: 4 },
  blockCardRed: { borderWidth: 2, borderColor: '#E53935' },
  cameraBox: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  camera: { flex: 1 },
  preview: { width: '100%', height: 220, borderRadius: 16 },
  obsPanel: { gap: 10, paddingTop: 12, paddingBottom: 32 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
  },
  chipSelected: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipTextSelected: { color: '#fff', fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  toggleBox: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
  },
  toggleBoxOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  toggleTextOn: { color: '#fff', fontWeight: '700' },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(21,101,192,0.12)',
  },
  primary: { backgroundColor: '#1565C0' },
  buttonText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.5 },
  resultCard: { borderRadius: 12, padding: 12, gap: 6 },
  resultImage: { width: '100%', height: 200, borderRadius: 12 },
  hint: { textAlign: 'center', marginTop: 4 },
});