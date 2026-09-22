import type {
  AnalysisResult,
  ObservationInput,
  ZoneStatus,
} from '@/types/analysis';
import { ZONE_STATUS_LABEL } from '@/services/geo';

export interface AnalysisContext {
  latitude: number;
  longitude: number;
  zoneName: string | null;
  zoneStatus: ZoneStatus;
  operatorName: string;
}

/**
 * O PROMPT ESPECÍFICO do "engenheiro de minérios".
 * Persona + critérios técnicos + contrato de saída em JSON.
 * Usado quando há uma API de visão configurada.
 */
export function buildEngineerPrompt(input: ObservationInput, ctx: AnalysisContext): string {
  return `Você é o "Engenheiro de Minérios" do KravenOps, um geólogo de mineração sênior com 30 anos de experiência em depósitos primários e aluvionares de ouro, sulfetos e metais básicos no Brasil (greenstone belts, veios de quartzo, lateritas, terrenos sedimentares).

CONTEXTO DA MISSÃO
- Foto de afloramento / frente de trabalho em campo.
- Operador: ${ctx.operatorName || 'não informado'}
- Coordenadas: ${ctx.latitude.toFixed(6)}, ${ctx.longitude.toFixed(6)}
- Zona: ${ctx.zoneName ?? 'fora de zonas registradas'} — situação legal: ${ZONE_STATUS_LABEL[ctx.zoneStatus]}

DADOS DE CAMPO DO OPERADOR
- Tipo de material observado: ${input.rockType}
- Dureza aparente: ${input.hardness}
- Escavação manual possível: ${input.manualDig ? 'sim' : 'não'}
- Veios visíveis: ${input.veining ? 'sim' : 'não'}
- Provável sulfeto: ${input.sulfide ? 'sim' : 'não'}
- Alteração hidrotermal / oxidação: ${input.alteration ? 'sim' : 'não'}
- Quartzo: ${input.quartz ? 'sim' : 'não'}
- Estrutura do corpo: ${input.estructura}

O QUE ANALISAR NA FOTO
1. Litologia e rocha encaixante (granito, xisto, arenito, laterita…).
2. Veios de quartzo: espessura, direção, continuidade, textura (em vassoura, maciço, brechado).
3. Sulfetos e óxidos: pirita, calcopirita, arsenopirita, limonita/goethita (chapéu de ferro).
4. Alteração hidrotermal e halo (sericitização, cloritização, oxidação).
5. Controle estrutural: falhas, fraturas, zonas de cisalhamento, contatos.
6. Potencial de mineralização primária vs aluvionar/supergênica.

REGRAS OBRIGATÓRIAS
- NÃO invente ocorrência de ouro. Seja honesto: descreva apenas o que é visível e plausível.
- Cite indicadores concretos (ex.: "pirita oxidada + vênulas de quartzo > 3 cm").
- Responda SOMENTE JSON válido, sem markdown, neste contrato:
{
  "indicadores": ["<indicador 1>", "<indicador 2>", ...],
  "recomendacao": "<roteiro prático de prospecção, em português simples>",
  "direcao": "<rumo sugerido: N/NE/L/SE/S/SO/O/NO ou 'sem preferência'>",
  "profundidade": "<sugestão de teste inicial, ex.: poço de 1–3 m>",
  "confianca": <0.0 a 1.0>
}`;
}

const ROCK_LABEL: Record<ObservationInput['rockType'], string> = {
  quartzo: 'quartzo',
  xisto: 'xisto',
  granito: 'granito',
  sedimentar: 'sedimentar',
  laterita: 'laterita',
  outro: 'outro material',
};

const DEPTH_SUGGESTION: Record<ObservationInput['estructura'], string> = {
  veio: 'Poço de teste de 1,5–3 m seguindo a direção do veio.',
  bolsao: 'Sondagem/escavação de 2–4 m no centro do bolsão.',
  disseminado: 'Amostragem em trincheira de 1–2 m com malha de 5 m.',
  solo: 'Panela/travessia em camadas de 0,5 m até o bedrock.',
};

/** Heurística determinística offline (funciona 100% sem internet). */
export function analyzeOffline(input: ObservationInput, ctx: AnalysisContext): AnalysisResult {
  const indicators: string[] = [];

  indicators.push(ROCK_LABEL[input.rockType]);

  if (input.veining) indicators.push('veios/venulação visível');
  if (input.quartz) indicators.push('quartzo presente');
  if (input.sulfide) indicators.push('sulfeto provável — forte indicador de zona mineralizada');
  if (input.alteration) indicators.push('alteração hidrotermal/oxidação (halo)');
  if (!input.alteration && !input.sulfide) indicators.push('poucos sinais de alteração — validar com panela');

  let score = 0;
  if (input.quartz) score += 1;
  if (input.veining) score += 1;
  if (input.sulfide) score += 2;
  if (input.alteration) score += 1;
  if (input.estructura === 'veio' || input.estructura === 'bolsao') score += 1;

  const confidence = Math.min(0.9, 0.35 + score * 0.1);

  // Direção determinística (estável por coordenada) para o GPS.
  const angle = ((Math.abs(ctx.latitude) * 100 + Math.abs(ctx.longitude) * 100) % 360);
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const direction = dirs[Math.round(angle / 45) % 8];

  let recommendation: string;
  if (score >= 4) {
    recommendation = `Sinais fortes de zona mineralizada (${indicators.join(', ')}). Execute ${DEPTH_SUGGESTION[input.estructura]} e colete amostra de canal para ensaio (fire assay/ICP). Registre coordenadas do ponto de coleta.`;
  } else if (score >= 2) {
    recommendation = `Indicadores moderados (${indicators.join(', ')}). Vale bater panela no material de alteração e seguir o rumo ${direction} procurando o prolongamento dos veios.`;
  } else {
    recommendation = `Sinais fracos (${indicators.join(', ')}). Confirme com panela/travessia de 100 m no rumo ${direction} antes de investir em escavação.`;
  }

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    latitude: ctx.latitude,
    longitude: ctx.longitude,
    zone: ctx.zoneName ? { id: ctx.zoneName, name: ctx.zoneName, status: ctx.zoneStatus } : null,
    rockType: ROCK_LABEL[input.rockType],
    indicators,
    recommendation,
    direction: `${direction} (${angle.toFixed(0)}°)`,
    depth: DEPTH_SUGGESTION[input.estructura],
    confidence: Number(confidence.toFixed(2)),
    source: 'offline',
    timestamp: Date.now(),
    imageUri: undefined,
  };
}

/** Chamada remota para a API de visão (IA). Retorna null se não configurada ou falhar. */
export async function analyzeRemote(
  input: ObservationInput,
  ctx: AnalysisContext,
  apiUrl: string,
  apiKey: string,
): Promise<AnalysisResult | null> {
  if (!apiUrl.trim()) return null;
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
      },
      body: JSON.stringify({
        prompt: buildEngineerPrompt(input, ctx),
        imageBase64: input.imageBase64,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      indicadores?: string[];
      recomendacao?: string;
      direcao?: string | null;
      profundidade?: string | null;
      confianca?: number;
    };
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      latitude: ctx.latitude,
      longitude: ctx.longitude,
      zone: ctx.zoneName ? { id: ctx.zoneName, name: ctx.zoneName, status: ctx.zoneStatus } : null,
      rockType: ROCK_LABEL[input.rockType],
      indicators: data.indicadores ?? [],
      recommendation: data.recomendacao ?? 'Análise concluída sem detalhes adicionais.',
      direction: data.direcao ?? null,
      depth: data.profundidade ?? null,
      confidence: typeof data.confianca === 'number' ? data.confianca : 0.5,
      source: 'ai',
      timestamp: Date.now(),
      imageUri: undefined,
    };
  } catch {
    return null;
  }
}

/** Orquestra a análise: tenta IA remota, cai para heurística offline (offline-first). */
export async function runMiningAnalysis(
  input: ObservationInput,
  ctx: AnalysisContext,
  apiUrl = '',
  apiKey = '',
): Promise<AnalysisResult> {
  const remote = await analyzeRemote(input, ctx, apiUrl, apiKey);
  return remote ?? analyzeOffline(input, ctx);
}