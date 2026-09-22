import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ZONES } from '@/data/zones';
import { useTheme } from '@/hooks/use-theme';
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

  useEffect(() => {
    (async () => {
      const [s, p] = await Promise.all([loadSettings(), loadPermits()]);
      setSettings(s);
      setPermits(p);
      const next: Record<string, { plg: string; holder: string }> = {};
      for (const perm of p) next[perm.zoneId] = { plg: perm.plgNumber, holder: perm.holder };
      setDrafts(next);
    })();
  }, []);

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
            <ThemedText type="smallBold">IA de visão (opcional)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Configure sua API de visão/LLM para a análise avançada. Sem isso, o app usa o engenheiro de
              minérios offline (funciona sem internet).
            </ThemedText>
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="URL da API (ex.: https://api.exemplo.com/analisar)"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={settings.apiUrl}
              onChangeText={(t) => setSettings((s) => ({ ...s, apiUrl: t }))}
            />
            <TextInput
              style={[styles.input, { color: theme.text, backgroundColor: theme.background }]}
              placeholder="Chave da API (opcional)"
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
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(21,101,192,0.12)',
  },
  primary: { backgroundColor: '#1565C0' },
  buttonText: { color: '#fff', fontWeight: '700' },
});