import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MINERAL_TARGETS, TARGET_LABEL } from '@/services/mineralEngineer';
import { askEngineer, type ChatContext } from '@/services/aiChat';
import { getLastTarget, setLastTarget } from '@/services/sessionStore';
import { ZONE_STATUS_LABEL } from '@/services/geo';
import { loadSettings } from '@/services/storage';
import { useGeolocation } from '@/hooks/use-geolocation';
import { useTheme } from '@/hooks/use-theme';
import type { MineralTarget } from '@/types/analysis';

interface Message {
  id: string;
  role: 'user' | 'engineer';
  text: string;
}

const SUGGESTED = ['Onde prospectar?', 'Como usar a bateia?', 'Qual profundidade começar?', 'É legal aqui?'];

export default function ChatScreen() {
  const theme = useTheme();
  const { gps, zone } = useGeolocation();
  const [target, setTarget] = useState<MineralTarget>(getLastTarget());
  const [operatorName, setOperatorName] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let active = true;
    loadSettings().then((s) => {
      if (!active) return;
      setOperatorName(s.operatorName);
      setApiConfigured(!!s.apiUrl.trim());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setLastTarget(target);
  }, [target]);

  const welcome: Message = {
    id: 'welcome',
    role: 'engineer',
    text:
      zone?.status === 'blocked'
        ? '⛔ Você está em área protegida. Não posso orientar escavação aqui — cadastre uma PLG válida em Ajustes para liberar.'
        : `Olá! Sou o Engenheiro de Minérios 🪨. Posso orientar onde prospectar ${TARGET_LABEL[target].toLowerCase()}, como usar a bateia, profundidade e legalidade. ` +
          `Situação legal atual: ${zone ? ZONE_STATUS_LABEL[zone.status] : 'fora de zonas registradas'}. ` +
          (apiConfigured ? 'Estou conectado à IA de análise.' : 'Estou em modo offline (respostas honestas, sem inventar minério).'),
  };

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || busy) return;
      setInput('');
      setMessages((prev) => [...prev, { id: `u${Date.now()}`, role: 'user', text: q }]);
      setBusy(true);
      const ctx: ChatContext = {
        gps: gps?.coords ?? null,
        zoneName: zone?.name ?? null,
        zoneStatus: zone?.status ?? 'free',
        target,
        operatorName,
      };
      const { answer, usedAi } = await askEngineer(q, ctx);
      setMessages((prev) => [
        ...prev,
        {
          id: `e${Date.now()}`,
          role: 'engineer',
          text: usedAi ? answer : `${answer}\n\n(📡 resposta offline — configure a IA em Ajustes para o engenheiro completo)`,
        },
      ]);
      setBusy(false);
      scrollToEnd();
    },
    [busy, gps, zone, target, operatorName, scrollToEnd],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">🤖 Engenheiro de Minérios</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Pergunte onde prospectar — a IA estuda seu terreno, posição e as áreas azuis do mapa.
          </ThemedText>
        </View>

        <View style={styles.chips}>
          {MINERAL_TARGETS.map((t) => {
            const on = t === target;
            return (
              <Pressable
                key={t}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => setTarget(t)}>
                <ThemedText type="small" style={on ? styles.chipTextOn : undefined}>
                  {t === 'ouro' ? '🥇' : t === 'diamante' ? '💎' : t === 'ferro' ? '🧲' : t === 'bauxita' ? '🟥' : t === 'cobre' ? '🟩' : t === 'terras raras' ? '🟧' : '🎯'} {TARGET_LABEL[t]}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.suggests}>
          {SUGGESTED.map((s) => (
            <Pressable key={s} style={styles.suggestChip} onPress={() => send(s)}>
              <ThemedText type="small" style={{ color: '#1565C0' }}>
                {s}
              </ThemedText>
            </Pressable>
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={scrollToEnd}>
          {messages.length === 0 && !busy && (
            <View style={[styles.bubble, styles.bubbleEngineer]}>
              <ThemedText type="small">{welcome.text}</ThemedText>
            </View>
          )}
          {messages.map((m) => (
            <View
              key={m.id}
              style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleEngineer]}>
              <ThemedText type="small" style={m.role === 'user' ? { color: '#fff' } : undefined}>
                {m.text}
              </ThemedText>
            </View>
          ))}
          {busy && (
            <View style={styles.bubbleEngineer}>
              <ThemedText type="small">👷 Pensando…</ThemedText>
            </View>
          )}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
            placeholder="Pergunte ao engenheiro…"
            placeholderTextColor={theme.textSecondary}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send(input)}
            returnKeyType="send"
            multiline
          />
          <Pressable style={[styles.send, busy && styles.sendBusy]} onPress={() => send(input)}>
            <ThemedText style={styles.sendText}>{busy ? '…' : '➤'}</ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 16, gap: 10 },
  header: { gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: 'rgba(120,120,120,0.4)', paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: '#1565C0', borderColor: '#1565C0' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  suggests: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggestChip: { borderRadius: 999, backgroundColor: 'rgba(21,101,192,0.12)', paddingHorizontal: 10, paddingVertical: 5 },
  messages: { flex: 1 },
  messagesContent: { gap: 8, paddingVertical: 4 },
  bubble: { borderRadius: 12, padding: 10, maxWidth: '92%' },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: '#1565C0' },
  bubbleEngineer: { alignSelf: 'flex-start', backgroundColor: 'rgba(120,120,120,0.18)' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  input: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, maxHeight: 120 },
  send: { borderRadius: 12, backgroundColor: '#1565C0', paddingHorizontal: 16, paddingVertical: 12 },
  sendBusy: { opacity: 0.5 },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});