import type { MineralTarget, PotentialSummary } from '@/types/analysis';

/**
 * Estado leve compartilhado entre telas (Home → Chat).
 * Último resumo de potencial calculado no mapa 3D e alvo selecionado.
 */
let lastPotential: PotentialSummary | null = null;
let lastTarget: MineralTarget = 'ouro';
let currentRegion: { latitude: number; longitude: number } | null = null;

export function setLastPotential(p: PotentialSummary | null): void {
  lastPotential = p;
}

export function getLastPotential(): PotentialSummary | null {
  return lastPotential;
}

export function setLastTarget(t: MineralTarget): void {
  lastTarget = t;
}

export function getLastTarget(): MineralTarget {
  return lastTarget;
}

export function setCurrentRegion(p: { latitude: number; longitude: number } | null): void {
  currentRegion = p;
}

export function getCurrentRegion(): { latitude: number; longitude: number } | null {
  return currentRegion;
}