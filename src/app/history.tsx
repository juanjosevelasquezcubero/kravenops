import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { clearAnalyses, loadAnalyses, loadSettings } from '@/services/storage';
import { speak } from '@/services/voice';
import type { AnalysisResult, ZoneStatus } from '@/types/analysis';

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusColor(status: ZoneStatus): string {
  switch (status) {
    case 'blocked':
      return '#E53935';
    case 'verified':
      return '#43A047';
    case 'permitted':
      return '#F9A825';
    default:
      return '#43A047';
  }
}

function fixLabel(source: AnalysisResult['locationFix']): string {
  if (!source) return 'Sinal não informado';
  if (source.source === 'live') return `GPS ao vivo (~${Math.round(source.accuracyMeters)} m)`;
  if (source.source === 'last-known') return 'Último sinal conhecido do aparelho';
  return 'Ponto salvo (última análise)';
}

function AnalysisCard({ item, voice }: { item: AnalysisResult; voice: boolean }) {
  const [open, setOpen] = useState(false);
  const fix = fixLabel(item.locationFix);
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable onPress={() => setOpen((o) => !o)}>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitle}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {item.rockType} · {formatDate(item.timestamp)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.zone?.name ?? 'Fora de zonas registradas'}
            </ThemedText>
          </View>
          <View style={[styles.dot, { backgroundColor: statusColor(item.zone?.status ?? 'free') }]} />
        </View>
      </Pressable>
      {open && (
        <View style={styles.cardBody}>
          {item.videoUri && (
            <ThemedText type="smallBold">🎬 Vídeo da frente de trabalho (salvo offline)</ThemedText>
          )}
          <ThemedText type="smallBold">Recomendação</ThemedText>
          <ThemedText type="small">{item.recommendation}</ThemedText>
          {item.indicators.length > 0 && (
            <>
              <ThemedText type="smallBold">Indicadores</ThemedText>
              {item.indicators.map((ind, i) => (
                <ThemedText key={i} type="small">
                  • {ind}
                </ThemedText>
              ))}
            </>
          )}
          <ThemedText type="small" themeColor="textSecondary">
            Rumo: {item.direction ?? '—'} · Prof.: {item.depth ?? '—'} · Confiança:{' '}
            {Math.round(item.confidence * 100)}% · Fonte: {item.source === 'ai' ? 'IA' : 'Offline'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            📍 {fix}
          </ThemedText>
          {item.references && item.references.length > 0 && (
            <>
              <ThemedText type="smallBold">🔎 Referências web (comparação)</ThemedText>
              <View style={styles.refRow}>
                {item.references.slice(0, 4).map((ref, i) => (
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
            </>
          )}
          <Pressable
            style={styles.smallButton}
            onPress={() => speak(item.recommendation, voice)}>
            <ThemedText type="small" style={styles.smallButtonText}>🔊 Ouvir</ThemedText>
          </Pressable>
        </View>
      )}
    </ThemedView>
  );
}

export default function HistoryScreen() {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [voice, setVoice] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const [a, s] = await Promise.all([loadAnalyses(), loadSettings()]);
        if (!active) return;
        setAnalyses(a);
        setVoice(s.voiceEnabled);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.pad} edges={['top']}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle">Histórico</ThemedText>
          <Pressable
            onPress={async () => {
              await clearAnalyses();
              setAnalyses([]);
            }}>
            <ThemedText type="small" themeColor="textSecondary">Limpar</ThemedText>
          </Pressable>
        </View>

        {analyses.length === 0 ? (
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText type="small">Nenhuma análise ainda. Bata uma foto na aba Câmera.</ThemedText>
          </ThemedView>
        ) : (
          <FlatList
            data={analyses}
            keyExtractor={(a) => a.id}
            renderItem={({ item }) => <AnalysisCard item={item} voice={voice} />}
            contentContainerStyle={{ gap: 8, paddingBottom: 32 }}
          />
        )}

        <Pressable style={styles.back} onPress={() => router.back()}>
          <ThemedText type="small" themeColor="textSecondary">← Voltar</ThemedText>
        </Pressable>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empty: { borderRadius: 12, padding: 16 },
  card: { borderRadius: 12, padding: 12, gap: 6 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { flex: 1, gap: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, marginLeft: 8 },
  cardBody: { gap: 6, marginTop: 8 },
  smallButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#1565C0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallButtonText: { color: '#fff', fontWeight: '700' },
  refRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  refThumbWrap: { width: 90 },
  refThumb: { width: 90, height: 60, borderRadius: 8 },
  refThumbEmpty: { backgroundColor: 'rgba(120,120,120,0.2)', alignItems: 'center', justifyContent: 'center' },
  back: { marginTop: 4 },
});