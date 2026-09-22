import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZONES } from '@/data/zones';
import { useTheme } from '@/hooks/use-theme';
import { clearAllMedia, mediaStats, type MediaStats } from '@/services/media';
import { loadPermits, loadSettings, removePermit, savePermit, saveSettings } from '@/services/storage';
import type { AppSettings, PermitRecord } from '@/types/analysis';

export default function SettingsScreen() {
  const theme = useTheme();
  const [settings, setSettings] = useState<AppSettings>({
    operatorName: '',
    voiceEnabled: true,
    apiUrl: '',
    apiKey: '',
  });
  const [permits, setPermits] = useState<PermitRecord[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { plg: string; holder: string }>>({});
  const [media, setMedia] = useState<MediaStats>({ images: 0, videos: 0, bytes: 0 });

  useEffect(() => {
    (async () => {
      const [s, p, m] = await Promise.all([loadSettings(), loadPermits(), mediaStats()]);
      setSettings(s);
      setPermits(p);
      setMedia(m);
      const next: Record<string, { plg: string; holder: string }> = {};
      for (const perm of p) next[perm.zoneId] = { plg: perm.plgNumber, holder: perm.holder };
      setDrafts(next);
    })();
  }, []);

  const refreshMedia = async () => setMedia(await mediaStats());

  const save = async () => {
    await saveSettings(settings);
    for (const zone of ZONES) {
      const d = drafts[zone.id];
      if (d && d.plg.trim()) {
        await savePermit({ zoneId: zone.id, plgNumber: d.plg.trim(), holder: d.holder.trim(), addedAt: Date.now() });
      } else if (d) {
        await removePermit(zone.id);
      }
    }
    setPermits(await loadPermits());
  };

  const permitZones = ZONES.filter((z) => z.kind === 'protected' || z.kind === 'permitted');

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.pad} edges={['top']}>
        <View style={styles.headerRow}>
          <ThemedText type="subtitle">Ajustes</ThemedText>
          <Pressable onPress={() => router.back()}>
            <ThemedText type="small" themeColor="textSecondary">← Voltar</ThemedText>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 32 }}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Operador</ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="Nome do garimpeiro/operador"
              placeholderTextColor={theme.textSecondary}
              value={settings.operatorName}
              onChangeText={(t) => setSettings((s) => ({ ...s, operatorName: t }))}
            />
            <View style={styles.switchRow}>
              <ThemedText type="small">🌐 Instruções por voz (pt-BR)</ThemedText>
              <Switch
                value={settings.voiceEnabled}
                onValueChange={(v) => setSettings((s) => ({ ...s, voiceEnabled: v }))}
              />
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">🤖 IA de visão (opcional)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Sem IA configurada, o engenheiro de minérios offline assume (funciona sem internet e já
              cobre ouro, diamante, ferro, terras raras, cobre, bauxita).
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.hintBox}>
              <ThemedText type="smallBold">3 formas de ligar a IA (mesma rede Wi-Fi):</ThemedText>
              <ThemedText type="small">
                1️⃣ <ThemedText type="smallBold">OpenCode no PC</ThemedText> — rode{' '}
                <ThemedText type="smallBold">tools/bridge</ThemedText> e use o melhor modelo de visão
                do seu OpenCode (Big Pickle ou melhor). URL: <ThemedText type="smallBold">http://IP-do-PC:4600/analyze</ThemedText>
              </ThemedText>
              <ThemedText type="small">
                2️⃣ <ThemedText type="smallBold">Gemini</ThemedText> (chave grátis) — rode a ponte com
                BRIDGE_PROVIDER=openai + GEMINI_API_KEY e use a mesma URL.
              </ThemedText>
              <ThemedText type="small">
                3️⃣ <ThemedText type="smallBold">OpenAI</ThemedText> — igual, com OPENAI_API_KEY. Instruções
                completas em <ThemedText type="smallBold">tools/bridge/README.md</ThemedText>.
              </ThemedText>
            </ThemedView>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="URL da IA (ex.: http://192.168.1.10:4600/analyze)"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={settings.apiUrl}
              onChangeText={(t) => setSettings((s) => ({ ...s, apiUrl: t }))}
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="Chave da API (opcional — a ponte/OpenCode guarda as credenciais)"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={settings.apiKey}
              onChangeText={(t) => setSettings((s) => ({ ...s, apiKey: t }))}
            />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">Permissões de lavra garimpeira (PLG)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Para operar em área protegida ou com título ANM, registre o número do documento. O app só
              libera análise em área 🔴 após este registro — e você é responsável pela legalidade.
            </ThemedText>
            {permitZones.map((zone) => {
              const d = drafts[zone.id];
              const current = permits.find((p) => p.zoneId === zone.id);
              return (
                <View key={zone.id} style={styles.permitRow}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {zone.kind === 'protected' ? '🔴' : '🟡'} {zone.name}
                  </ThemedText>
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                    placeholder="Nº PLG / documento"
                    placeholderTextColor={theme.textSecondary}
                    value={d?.plg ?? ''}
                    onChangeText={(t) =>
                      setDrafts((dd) => ({ ...dd, [zone.id]: { plg: t, holder: d?.holder ?? '' } }))
                    }
                  />
                  <TextInput
                    style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
                    placeholder="Titular"
                    placeholderTextColor={theme.textSecondary}
                    value={d?.holder ?? ''}
                    onChangeText={(t) =>
                      setDrafts((dd) => ({ ...dd, [zone.id]: { plg: d?.plg ?? '', holder: t } }))
                    }
                  />
                  {current && (
                    <ThemedText type="small" themeColor="textSecondary">
                      ✅ Registrada em {new Date(current.addedAt).toLocaleDateString('pt-BR')}
                    </ThemedText>
                  )}
                </View>
              );
            })}
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">📁 Mídia e armazenamento</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Fotos e vídeos são salvos no armazenamento permanente do app (Documentos) — o SQLite
              guarda só os metadados, então o banco aguenta milhares de registros de mídia. Arquivos
              ficam disponíveis offline.
            </ThemedText>
            <ThemedText type="small">
              🖼️ {media.images} foto(s) · 🎬 {media.videos} vídeo(s) · 💾{' '}
              {(media.bytes / (1024 * 1024)).toFixed(1)} MB
            </ThemedText>
            <View style={styles.horizontalRow}>
              <Pressable style={[styles.button, styles.flexBtn]} onPress={refreshMedia}>
                <ThemedText type="small">Atualizar</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.button, styles.dangerBtn, styles.flexBtn]}
                onPress={async () => {
                  await clearAllMedia();
                  await refreshMedia();
                }}>
                <ThemedText type="small" style={{ color: '#E53935', fontWeight: '700' }}>
                  Apagar mídia
                </ThemedText>
              </Pressable>
            </View>
          </ThemedView>

          <Pressable style={[styles.button, styles.primary]} onPress={save}>
            <ThemedText style={styles.buttonText}>💾 Salvar ajustes e permissões</ThemedText>
          </Pressable>

          <ThemedText type="small" themeColor="textSecondary">
            Zonas em produção: FUNAI, ICMBio, ANM SIGMINE, CPRM, USGS MRData. Este MVP usa polígonos de
            demonstração (src/data/zones.ts) — substitua pelos shapefiles oficiais.
          </ThemedText>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { flex: 1, padding: 16, gap: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { borderRadius: 12, padding: 12, gap: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  permitRow: { gap: 8, marginTop: 4 },
  hintBox: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(21,101,192,0.4)',
    padding: 10,
    gap: 6,
  },
  horizontalRow: { flexDirection: 'row', gap: 8 },
  flexBtn: { flex: 1 },
  dangerBtn: { borderWidth: 1, borderColor: '#E53935' },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(21,101,192,0.12)',
  },
  primary: { backgroundColor: '#1565C0' },
  buttonText: { color: '#fff', fontWeight: '700' },
});