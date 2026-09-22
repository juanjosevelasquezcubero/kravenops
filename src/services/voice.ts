import * as Speech from 'expo-speech';

/** Fala em pt-BR; interrompe a fala anterior. Retorna true se foi falado. */
export function speak(text: string, enabled = true): boolean {
  if (!enabled || !text.trim()) return false;
  try {
    Speech.stop();
    Speech.speak(text, { language: 'pt-BR', rate: 0.95 });
    return true;
  } catch {
    return false;
  }
}

export function stopSpeaking() {
  Speech.stop();
}