import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useGeolocation } from '@/hooks/use-geolocation';
import { persistMedia, type MediaKind } from '@/services/media';
import { runMiningAnalysis } from '@/services/mineralEngineer';
import { loadSettings, saveAnalysis, saveLastFix } from '@/services/storage';
import { speak } from '@/services/voice';
import type { AnalysisResult, ObservationInput } from '@/types/analysis';

const ROCK_OPTIONS: ObservationInput['rockType'][] = ['quartzo', 'xisto', 'granito', 'sedimentar', 'laterita', 'outro'];
const STRUCTURE_OPTIONS: ObservationInput['estructura'][] = ['veio', 'bolsao', 'disseminado', 'solo'];
const VIDEO_SUPPORTED = Platform.OS !== 'web';
const MAX_VIDEO_SECONDS = 180;

interface CapturedMedia {
  kind: MediaKind;
  uri: string;
  base64?: string;
  bytes: number;
}

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
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [media, setMedia] = useState<CapturedMedia | null>(null);
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

  const { gps, zone, hardBlocked, fixSource } = useGeolocation();

  // Mensagem deriva do estado (sem setState síncrono em effect).
  const blockError = hardBlocked
    ? `⛔ Área protegida (${zone?.name ?? 'zona'}). Análise bloqueada por lei. Registre uma PLG válida em Ajustes.`
    : manualError;

  // Cronômetro do vídeo (apenas enquanto grava; reset acontece ao iniciar nova gravação).
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  const capturePhoto = useCallback(async () => {
    try {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.6, base64: true });
      if (!shot) return;
      const persisted = await persistMedia(shot.uri, 'photo');
      setMedia({
        kind: 'photo',
        uri: persisted?.uri ?? shot.uri,
        base64: shot.base64,
        bytes: persisted?.bytes ?? 0,
      });
    } catch {
      // preview ainda não pronto
    }
  }, []);

  const startRecording = useCallback(() => {
    setRecordSeconds(0);
    setRecording(true);
    cameraRef.current
      ?.recordAsync({ maxDuration: MAX_VIDEO_SECONDS })
      .then(async (video) => {
        if (!video?.uri) {
          setRecording(false);
          return;
        }
        const persisted = await persistMedia(video.uri, 'video');
        setMedia({ kind: 'video', uri: persisted?.uri ?? video.uri, bytes: persisted?.bytes ?? 0 });
      })
      .catch(() => setRecording(false))
      .finally(() => setRecording(false));
  }, []);

  const stopRecording = useCallback(() => {
    cameraRef.current?.stopRecording();
  }, []);

  const onCapturePress = useCallback(() => {
    if (mode === 'picture') {
      void capturePhoto();
    } else if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [mode, recording, capturePhoto, startRecording, stopRecording]);

  const analyze = useCallback(async () => {
    if (!gps) {
      setManualError('Sem posição disponível. Aguarde o GPS ou use pontos já analisados (último sinal).');
      return;
    }
    if (hardBlocked) {
      setManualError(
        `⛔ Área protegida (${zone?.name ?? ''}). Análise bloqueada por lei. Registre uma PLG válida em Ajustes.`,
      );
      return;
    }
    if (!media) return;
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
        imageBase64: media.kind === 'photo' ? media.base64 : undefined,
      };
      const fix = {
        source: fixSource ?? ('live' as const),
        accuracyMeters: gps.accuracyMeters,
        fixedAt: gps.timestamp,
      };
      const ctx = {
        latitude: gps.coords.latitude,
        longitude: gps.coords.longitude,
        zoneName: zone?.name ?? null,
        zoneStatus: zone?.status ?? ('free' as const),
        operatorName: settings.operatorName,
      };
      const analysis = await runMiningAnalysis(input, ctx, settings.apiUrl, settings.apiKey);
      analysis.imageUri = media.kind === 'photo' ? media.uri : undefined;
      analysis.videoUri = media.kind === 'video' ? media.uri : undefined;
      analysis.locationFix = fix;
      await saveAnalysis(analysis);
      await saveLastFix({
        latitude: ctx.latitude,
        longitude: ctx.longitude,
        accuracyMeters: fix.accuracyMeters,
        fixedAt: fix.fixedAt,
      });
      setResult(analysis);
      speak(analysis.recommendation, settings.voiceEnabled);
    } finally {
      setAnalyzing(false);
    }
  }, [gps, hardBlocked, zone, fixSource, media, rockType, hardness, manualDig, veining, sulfide, alteration, quartz, estructura]);

  const reset = useCallback(() => {
    setMedia(null);
    setResult(null);
    setManualError(null);
    setMode('picture');
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
            Precisamos da câmera para fotografar/gravar rochas, veios e frentes de trabalho.
          </ThemedText>
          <Pressable style={styles.button} onPress={requestPermission}>
            <ThemedText style={styles.buttonText}>Autorizar câmera</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (result) {
    const extraNote =
      result.locationFix?.source === 'live'
        ? `GPS ao vivo (~${Math.round(result.locationFix.accuracyMeters)} m)`
        : result.locationFix?.source === 'last-known'
          ? 'Último sinal conhecido do aparelho'
          : 'Ponto salvo (última análise)';

    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.pad}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <ThemedText type="subtitle">Resultado</ThemedText>
            {result.imageUri ? (
              <Image source={{ uri: result.imageUri }} style={styles.resultImage} resizeMode="cover" />
            ) : result.videoUri ? (
              <ThemedView type="backgroundElement" style={styles.videoPlaceholder}>
                <ThemedText style={styles.videoEmoji}>🎬</ThemedText>
                <ThemedText type="smallBold">Vídeo salvo no aparelho</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Gravação da frente de trabalho (arquivo permanente em Documentos).
                </ThemedText>
              </ThemedView>
            ) : null}

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
              Ocasião: {extraNote} · Fonte:{' '}
              {result.source === 'ai' ? '🤖 IA de visão' : '📡 Heurística offline (sem internet)'}
            </ThemedText>

            {result.references && result.references.length > 0 && (
              <ThemedView type="backgroundElement" style={styles.resultCard}>
                <ThemedText type="smallBold">🔎 Referências da internet (comparação)</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Imagens similares buscadas na web. Apenas apoio visual — o parecer acima é
                  baseado no estudo do SEU material original.
                </ThemedText>
                <View style={styles.refRow}>
                  {result.references.slice(0, 4).map((ref, i) => (
                    <View key={i} style={styles.refThumbWrap}>
                      {ref.thumbnail ? (
                        <Image source={{ uri: ref.thumbnail }} style={styles.refThumb} resizeMode="cover" />
                      ) : (
                        <View style={[styles.refThumb, styles.refThumbEmpty]}>
                          <ThemedText type="small">🪨</ThemedText>
                        </View>
                      )}
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
                        {ref.title}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </ThemedView>
            )}

            <Pressable style={[styles.button, styles.primary]} onPress={() => speak(result.recommendation, true)}>
              <ThemedText style={styles.buttonText}>🔊 Ouvir</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={reset}>
              <ThemedText>Nova captura</ThemedText>
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

        {media ? (
          <>
            {media.kind === 'photo' ? (
              <Image source={{ uri: media.uri }} style={styles.preview} resizeMode="cover" />
            ) : (
              <ThemedView type="backgroundElement" style={styles.videoPreview}>
                <ThemedText style={styles.videoEmoji}>🎬</ThemedText>
                <ThemedText type="smallBold">Vídeo capturado ({Math.round(media.bytes / 1024)} KB)</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Salvo em Documentos do app — resiste à limpeza de cache e fica disponível offline.
                </ThemedText>
              </ThemedView>
            )}
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
                <ThemedText>Tirar outra mídia</ThemedText>
              </Pressable>
            </ScrollView>
          </>
        ) : (
          <>
            <View style={styles.cameraBox}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                mode={mode}
                enableTorch={false}
              />
              {recording && (
                <View style={styles.recBadge}>
                  <View style={styles.recDot} />
                  <ThemedText type="smallBold" style={{ color: '#fff' }}>
                    REC {recordSeconds}s
                  </ThemedText>
                </View>
              )}
            </View>

            {VIDEO_SUPPORTED && (
              <View style={styles.modeRow}>
                <Chip selected={mode === 'picture'} label="📷 Foto" onPress={() => setMode('picture')} />
                <Chip selected={mode === 'video'} label="🎬 Vídeo" onPress={() => setMode('video')} />
              </View>
            )}

            <Pressable
              style={[styles.button, styles.primary, { marginTop: 12 }, hardBlocked && styles.disabled, recording && styles.recording]}
              disabled={hardBlocked}
              onPress={onCapturePress}>
              <ThemedText style={styles.buttonText}>
                {hardBlocked
                  ? '⛔ Bloqueado nesta área'
                  : recording
                    ? '⏹ Parar gravação'
                    : mode === 'picture'
                      ? '📷 Fotografar'
                      : '🎬 Gravar vídeo'}
              </ThemedText>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
              {mode === 'picture'
                ? 'Fotografe o afloramento, veios de quartzo, sulfetos e a rocha encaixante com boa luz.'
                : `Grave a frente de trabalho (até ${MAX_VIDEO_SECONDS}s). O vídeo fica salvo offline no aparelho.`}
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
  recBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#E53935' },
  modeRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 10 },
  preview: { width: '100%', height: 220, borderRadius: 16 },
  videoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 16,
  },
  videoEmoji: { fontSize: 42 },
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
  recording: { backgroundColor: '#E53935' },
  resultCard: { borderRadius: 12, padding: 12, gap: 6 },
  resultImage: { width: '100%', height: 200, borderRadius: 12 },
  videoPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  refThumbWrap: { width: 90 },
  refThumb: { width: 90, height: 60, borderRadius: 8 },
  refThumbEmpty: { backgroundColor: 'rgba(120,120,120,0.2)', alignItems: 'center', justifyContent: 'center' },
  hint: { textAlign: 'center', marginTop: 4 },
});