import Storage from 'expo-sqlite/kv-store';

import type { AnalysisResult, AppSettings, PermitRecord, SavedFix } from '@/types/analysis';

const KEY_ANALYSES = 'kravenops.analyses.v1';
const KEY_PERMITS = 'kravenops.permits.v1';
const KEY_SETTINGS = 'kravenops.settings.v1';
const KEY_LAST_FIX = 'kravenops.lastfix.v1';

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await Storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON<T>(key: string, value: T): Promise<void> {
  await Storage.setItem(key, JSON.stringify(value));
}

/* ---------------- Análises ---------------- */

export async function loadAnalyses(): Promise<AnalysisResult[]> {
  return readJSON<AnalysisResult[]>(KEY_ANALYSES, []);
}

export async function saveAnalysis(analysis: AnalysisResult): Promise<AnalysisResult[]> {
  const all = await loadAnalyses();
  const next = [analysis, ...all].slice(0, 200);
  await writeJSON(KEY_ANALYSES, next);
  return next;
}

export async function clearAnalyses(): Promise<void> {
  await writeJSON(KEY_ANALYSES, []);
}

/* ---------------- Permissões / PLG ---------------- */

export async function loadPermits(): Promise<PermitRecord[]> {
  return readJSON<PermitRecord[]>(KEY_PERMITS, []);
}

export async function savePermit(permit: PermitRecord): Promise<PermitRecord[]> {
  const all = await loadPermits();
  const next = [...all.filter((p) => p.zoneId !== permit.zoneId), permit];
  await writeJSON(KEY_PERMITS, next);
  return next;
}

export async function removePermit(zoneId: string): Promise<PermitRecord[]> {
  const next = (await loadPermits()).filter((p) => p.zoneId !== zoneId);
  await writeJSON(KEY_PERMITS, next);
  return next;
}

/* ---------------- Configurações ---------------- */

export const DEFAULT_SETTINGS: AppSettings = {
  operatorName: '',
  voiceEnabled: true,
  apiUrl: '',
  apiKey: '',
};

export async function loadSettings(): Promise<AppSettings> {
  const stored = await readJSON<Partial<AppSettings>>(KEY_SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await writeJSON(KEY_SETTINGS, settings);
}

/* ---------------- Último ponto analisado (fallback offline) ---------------- */

export async function loadLastFix(): Promise<SavedFix | null> {
  try {
    const raw = await Storage.getItem(KEY_LAST_FIX);
    if (!raw) return null;
    return JSON.parse(raw) as SavedFix;
  } catch {
    return null;
  }
}

export async function saveLastFix(fix: SavedFix): Promise<void> {
  try {
    await Storage.setItem(KEY_LAST_FIX, JSON.stringify(fix));
  } catch {
    // não crítico
  }
}