import type {
  AnalysisResult,
  ObservationInput,
  ReferenceImage,
  ZoneStatus,
} from '@/types/analysis';
import { ZONE_STATUS_LABEL } from '@/services/geo';
import { buildReferencePromptBlock, searchReferenceImages } from '@/services/webResearch';

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
- Alvo do garimpo: ${TARGET_LABEL[input.target]}
- Tipo de material observado: ${input.rockType}
- Dureza aparente: ${input.hardness}
- Escavação manual possível: ${input.manualDig ? 'sim' : 'não'}
- Veios visíveis: ${input.veining ? 'sim' : 'não'}
- Provável sulfeto: ${input.sulfide ? 'sim' : 'não'}
- Alteração hidrotermal / oxidação: ${input.alteration ? 'sim' : 'não'}
- Quartzo: ${input.quartz ? 'sim' : 'não'}
- Estrutura do corpo: ${input.estructura}

FOCO DO ALVO (${TARGET_LABEL[input.target]})
${TARGETS[input.target].prompts.map((p) => `- ${p}`).join('\n')}

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

export const MINERAL_TARGETS: ObservationInput['target'][] = [
  'ouro',
  'diamante',
  'ferro',
  'terras raras',
  'cobre',
  'bauxita',
  'geral',
];

export const TARGET_LABEL: Record<ObservationInput['target'], string> = {
  ouro: 'Ouro',
  diamante: 'Diamante',
  ferro: 'Ferro',
  'terras raras': 'Terras raras',
  cobre: 'Cobre',
  bauxita: 'Bauxita',
  geral: 'Geral (qualquer minério)',
};

interface TargetGuide {
  /** Termos em inglês para a busca de referências web. */
  enTerms: string[];
  /** Linha extra do prompt da IA para este alvo. */
  prompts: string[];
  /** Indicadores offline (heurística), extraídos da observação. */
  offlineIndicators: (input: ObservationInput) => string[];
  /** Pontos extras de confiança offline por este alvo. */
  scoreAdd: number;
  /** Conselho de amostragem específico (usado quando os sinais são fortes). */
  sampleAdvice: string;
}

const TARGETS: Record<ObservationInput['target'], TargetGuide> = {
  ouro: {
    enTerms: ['gold ore quartz vein', 'gold pyrite rock', 'alluvial gold placer'],
    prompts: [
      'Procure ouro nativo, pirita/arsenopirita, veios de quartzo com óxidos de ferro (fruta de mina / chapéu de ferro) e zonas de cisalhamento em greenstone.',
      'Diferencie mineralização primária (veio) de aluvionar/supergênica (panela).',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.quartz && i.veining) out.push('veios de quartzo com vênulas — estrutura clássica de ouro');
      if (i.sulfide) out.push('sulfetos (pirita/arsenopirita) — potenciais portadores de ouro');
      if (i.alteration) out.push('chapéu de ferro / oxidação (fruta de mina)');
      if (i.estructura === 'solo') out.push('aluvião/cascalho — alvo de panela para pepitas');
      return out;
    },
    scoreAdd: 0,
    sampleAdvice: 'Colete amostra de canal (canaleta) e envie para fire assay/ICP. Bata panela no aluvião.',
  },
  diamante: {
    enTerms: ['kimberlite indicator minerals', 'diamond alluvial gravel', 'lamproite'],
    prompts: [
      'Busque rochas kimberlíticas/lamproítas, xenólitos mantélicos (granada piropo, ilmenita, diopsídio cromífero, olivina) e cascalhos de drenagem associados.',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.rockType === 'xisto' || i.rockType === 'granito') out.push('encaixante dura (xisto/granito) — contexto kimberlítico possível');
      if (i.alteration) out.push('alteração em crosta azulada/esverdeada (típica de kimberlito alterado)');
      if (i.estructura === 'solo') out.push('cascalho aluvionar de drenagem — alvo de concentração');
      if (i.manualDig) out.push('solo escavável favorece lavagem de concentrado mineral');
      return out;
    },
    scoreAdd: -1,
    sampleAdvice: 'Faça peneiramento/lavagem de concentrado (bateia + peneira 0,5 mm) buscando minerais indicadores.',
  },
  ferro: {
    enTerms: ['iron ore hematite magnetite BIF', 'laterite iron oxide', 'banded iron formation'],
    prompts: [
      'Identifique formações ferríferas bandadas (BIF), bandas de hematita/magnetita, itabiritos e crostas lateríticas ricas em óxidos de ferro.',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.alteration) out.push('óxidos de ferro (hematita/magnetita) — minério de ferro comum');
      if (i.rockType === 'laterita') out.push('crosta laterítica ferrífera (canga)');
      if (i.rockType === 'sedimentar') out.push('camadas sedimentares — possível BIF');
      return out;
    },
    scoreAdd: 1,
    sampleAdvice: 'Amostre a banda de minério e faça teste magnético simples (ímã) + análise de Fe total.',
  },
  'terras raras': {
    enTerms: ['rare earth pegmatite monazite', 'bastnaesite carbonatite', 'REE ore'],
    prompts: [
      'Procure pegmatitos e carbonatitos com monazita, bastnasita, xenotima; verifique mineral pesado amarelado/marrom e possível radioatividade.',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.rockType === 'granito') out.push('granito/pegmatito — hospeda minerais de terras raras');
      if (i.alteration) out.push('alteração alcalina/carbonatito — associação clássica de REE');
      if (i.estructura === 'bolsao') out.push('bolsões pegmatíticos');
      return out;
    },
    scoreAdd: -1,
    sampleAdvice: 'Concentre por densidade (bateia) procurando monazita e avalie radioatividade com cintilômetro.',
  },
  cobre: {
    enTerms: ['copper ore malachite chalcopyrite', 'chalcopyrite sulfide', 'porphyry copper'],
    prompts: [
      'Verifique sulfetos (calcopirita/calcosita), oxidação verde-azulada (malaquita, crisocola, azurita) e encaixantes metamáficas.',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.rockType === 'xisto') out.push('xisto verde/metamáfica — típica encaixante de cobre');
      if (i.sulfide) out.push('sulfetos — possível calcopirita');
      if (i.alteration) out.push('malaquita/crisocola (manchas verdes/azuis) — sinal direto de Cu');
      return out;
    },
    scoreAdd: 1,
    sampleAdvice: 'Amostre os pontos com manchas verdes/azuis e fareje com leitura de metais (XRF se houver).',
  },
  bauxita: {
    enTerms: ['bauxite pisolitic laterite', 'aluminum ore bauxite'],
    prompts: [
      'Identifique lateritas alumínosas com pisólitos, perfil de intemperismo profundo sobre rochas alcalinas/basálticas.',
    ],
    offlineIndicators: (i) => {
      const out: string[] = [];
      if (i.rockType === 'laterita') out.push('laterita alumínosa — possível bauxita pisólítica');
      if (i.alteration) out.push('perfil de intemperismo profundo (solo vermelho/amarelo)');
      if (i.estructura === 'solo') out.push('solo argiloso avermelhado sobre basalto/rocha alcalina');
      return out;
    },
    scoreAdd: 1,
    sampleAdvice: 'Amostre pisólitos e meça espessura do horizonte bauxítico; análise química Al/Si.',
  },
  geral: {
    enTerms: ['mineral deposit ore rock', 'rock outcrop geology'],
    prompts: [
      'Identifique qualquer evidência de mineralização metálica (óxidos, sulfetos, veios, alteração) e descreva a litologia.',
    ],
    offlineIndicators: () => [],
    scoreAdd: 0,
    sampleAdvice: 'Amostra de canal + panela para separação de pesados e ensaio multielementar (ICP).',
  },
};

export function targetGuide(target: ObservationInput['target']): TargetGuide {
  return TARGETS[target];
}

const DEPTH_SUGGESTION: Record<ObservationInput['estructura'], string> = {
  veio: 'Poço de teste de 1,5–3 m seguindo a direção do veio.',
  bolsao: 'Sondagem/escavação de 2–4 m no centro do bolsão.',
  disseminado: 'Amostragem em trincheira de 1–2 m com malha de 5 m.',
  solo: 'Panela/travessia em camadas de 0,5 m até o bedrock.',
};

/** Heurística determinística offline (funciona 100% sem internet). */
export function analyzeOffline(input: ObservationInput, ctx: AnalysisContext): AnalysisResult {
  const indicators: string[] = [];
  const guide = TARGETS[input.target];

  indicators.push(ROCK_LABEL[input.rockType]);

  if (input.veining) indicators.push('veios/venulação visível');
  if (input.quartz) indicators.push('quartzo presente');
  if (input.sulfide) indicators.push('sulfeto provável — forte indicador de zona mineralizada');
  if (input.alteration) indicators.push('alteração hidrotermal/oxidação (halo)');
  if (!input.alteration && !input.sulfide) indicators.push('poucos sinais de alteração — validar com panela');
  indicators.push(...guide.offlineIndicators(input));

  let score = 0;
  if (input.quartz) score += 1;
  if (input.veining) score += 1;
  if (input.sulfide) score += 2;
  if (input.alteration) score += 1;
  if (input.estructura === 'veio' || input.estructura === 'bolsao') score += 1;
  score += guide.scoreAdd;

  const confidence = Math.min(0.9, 0.35 + score * 0.1);

  // Direção determinística (estável por coordenada) para o GPS.
  const angle = ((Math.abs(ctx.latitude) * 100 + Math.abs(ctx.longitude) * 100) % 360);
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const direction = dirs[Math.round(angle / 45) % 8];

  const label = TARGET_LABEL[input.target];
  let recommendation: string;
  if (score >= 4) {
    recommendation = `Sinais fortes de zona mineralizada para ${label} (${indicators.join(', ')}). ${guide.sampleAdvice} Registre as coordenadas do ponto de coleta.`;
  } else if (score >= 2) {
    recommendation = `Indicadores moderados para ${label} (${indicators.join(', ')}). ${guide.sampleAdvice} Siga o rumo ${direction} procurando o prolongamento da estrutura.`;
  } else {
    recommendation = `Sinais fracos para ${label} (${indicators.join(', ')}). ${guide.sampleAdvice} Confirme com travessia de 100 m no rumo ${direction} antes de investir em escavação.`;
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
  refs: ReferenceImage[] = [],
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
        prompt: buildEngineerPrompt(input, ctx) + buildReferencePromptBlock(refs),
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

/**
 * Orquestra a análise (offline-first):
 * 1. Busca referências web parecidas com a rocha original (somente contextualização).
 * 2. Tenta IA de visão remota com o prompt específico + bloco de referências.
 * 3. Sem API → heurística offline (funciona sem internet).
 * A conclusão SEMPRE se baseia na mídia ORIGINAL enviada pelo garimpeiro.
 */
export async function runMiningAnalysis(
  input: ObservationInput,
  ctx: AnalysisContext,
  apiUrl = '',
  apiKey = '',
): Promise<AnalysisResult> {
  const refs = await searchReferenceImages(input);
  const remote = await analyzeRemote(input, ctx, apiUrl, apiKey, refs);
  const result = remote ?? analyzeOffline(input, ctx);
  if (refs.length > 0) result.references = refs;
  return result;
}