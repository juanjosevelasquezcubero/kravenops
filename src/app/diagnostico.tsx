import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { diagnosticar, SINTOMAS, type Sintoma } from '@/services/diagnostico';

export default function DiagnosticoScreen() {
  const [sintoma, setSintoma] = useState<Sintoma | null>(null);
  const checklist = sintoma ? diagnosticar(sintoma) : [];
  const selected = SINTOMAS.find((item) => item.id === sintoma);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <ThemedText type="subtitle">Diagnóstico do motor</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Escolha o sintoma. A lista abaixo é o que vale conferir primeiro.
          </ThemedText>

          <View style={styles.options}>
            {SINTOMAS.map((item) => {
              const on = item.id === sintoma;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setSintoma(item.id)}
                  style={[styles.option, on && styles.optionOn]}>
                  <ThemedText type="default" style={on ? styles.optionTextOn : undefined}>
                    {item.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {selected && (
            <View style={styles.checklist}>
              <ThemedText type="smallBold">Conferir — {selected.label}</ThemedText>
              {checklist.map((item, index) => (
                <ThemedView key={item} type="backgroundElement" style={styles.row}>
                  <ThemedText type="smallBold" style={styles.index}>
                    {index + 1}
                  </ThemedText>
                  <ThemedText style={styles.item}>{item}</ThemedText>
                </ThemedView>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  options: { gap: 10, marginTop: 4 },
  option: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  optionOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  optionTextOn: { color: '#fff', fontWeight: '700' },
  checklist: { gap: 8, marginTop: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  index: { width: 22 },
  item: { flex: 1 },
});
