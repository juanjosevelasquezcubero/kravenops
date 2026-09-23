import { targetGuide } from '@/services/mineralEngineer';
import { getLastPotential } from '@/services/sessionStore';
import { bearing, bearingLabel, haversineMeters, ZONE_STATUS_LABEL } from '@/services/geo';
import { loadSettings } from '@/services/storage';
import type { LatLng, MineralTarget, ObservationInput, PotentialSpot, ZoneStatus } from '@/types/analysis';

export interface ChatContext {
  gps: LatLng | null;
  zoneName: string | null;
  zoneStatus: ZoneStatus;
  target: MineralTarget;
  operatorName: string;
}

/** Observação "neutra" para extrair os indicadores offline do alvo (sem sinais de campo). */
function surveyInput(target: MineralTarget): ObservationInput {
  return {
    rockType: 'outro',
    hardness: 'media',
    manualDig: true,
    veining: false,
    sulfide: false,
    alteration: false,
    quartz: false,
    estructura: 'solo',
    target,
  };
}

function targetHints(target: MineralTarget): string {
  const ind = targetGuide(target).offlineIndicators(surveyInput(target));
  return ind.length > 0 ? ind.join('; ').toLowerCase() : 'indicadores ainda não visíveis nesta área — comece observando a rocha e as drenagens';
}

/** Contexto consolidado que o engenheiro recebe (posição + zonas + terreno analisado). */
export function buildChatContext(ctx: ChatContext): string {
  const pot = getLastPotential();
  const top = pot?.top?.[0] ?? null;
  const terrain =
    top && pot
      ? `Estudo de terreno mais recente: ${pot.count} pontos potenciais; melhor ponto em ` +
        `${top.latitude.toFixed(4)}, ${top.longitude.toFixed(4)} — ${top.mineral} (score ${Math.round(top.score * 100)}%), ` +
        `elevação ~${top.elevation} m, declividade ~${top.slopeDeg}°.`
      : 'Nenhum estudo de potencial calculado ainda no mapa (rode a análise de área no mapa 3D).';
  return [
    `Operador: ${ctx.operatorName || 'não informado'}`,
    `Posição: ${ctx.gps ? ctx.gps.latitude.toFixed(6) + ', ' + ctx.gps.longitude.toFixed(6) : 'desconhecida'}`,
    `Zona atual: ${ctx.zoneName ?? 'fora de zonas registradas'} — situação legal: ${ZONE_STATUS_LABEL[ctx.zoneStatus]}`,
    `Alvo do garimpo: ${ctx.target}`,
    terrain,
  ].join('\n');
}

function extractAnswer(raw: unknown): string {
  if (typeof raw !== 'string') return 'Sem resposta do engenheiro.';
  const t = raw.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(t.slice(start, end + 1)) as { recomendacao?: string };
      const rec = obj.recomendacao ?? '';
      return rec || t;
    } catch {
      // segue para resposta em texto
    }
  }
  return t.replace(/```json|```/g, '') || raw;
}

/**
 * Pergunta ao Engenheiro de Minérios (IA via ponte/API configurada).
 * Sem API configurada, responde com a heurística offline honesta.
 */
export async function askEngineer(question: string, ctx: ChatContext): Promise<{ answer: string; usedAi: boolean }> {
  const settings = await loadSettings();
  if (settings.apiUrl) {
    try {
      const prompt =
        `Você é o "Engenheiro de Minérios" do KravenOps, geólogo de mineração sênior especializado em ` +
        `ouro, diamante, ferro, terras raras, cobre e bauxita (depósitos primários e aluvionares, Brasil e mundo).\n\n` +
        `CONTEXTO ATUAL:\n${buildChatContext(ctx)}\n\n` +
        `PERGUNTA DO GARIMPEIRO:\n${question}\n\n` +
        `Responda APENAS com um objeto JSON válido, sem markdown, neste contrato: ` +
        `{"indicadores": ["<itens do estudo>"], "recomendacao": "<resposta clara e prática, em português simples>", ` +
        `"direcao": "<rumo sugerido ou null>", "profundidade": "<sugestão de teste ou null>", "confianca": 0.0}`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
      const res = await fetch(settings.apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt, imageBase64: '' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { error?: string } | { recomendacao?: string };
      if ('error' in data && data.error) throw new Error(String(data.error));
      return { answer: extractAnswer((data as { recomendacao?: string }).recomendacao ?? JSON.stringify(data)), usedAi: true };
    } catch {
      return {
        answer: offlineAnswer(question, ctx) + '\n\n⚠️ A IA remota falhou agora; esta resposta é da análise offline (honesta, sem inventar minério).',
        usedAi: false,
      };
    }
  }
  return { answer: offlineAnswer(question, ctx), usedAi: false };
}

/** Respostas determinísticas offline (funciona 100% sem internet). */
export function offlineAnswer(question: string, ctx: ChatContext): string {
  const q = question.toLowerCase();
  const pot = getLastPotential();
  const top: PotentialSpot | undefined = pot?.top?.[0];
  const gps = ctx.gps;

  if (q.includes('onde') || q.includes('prospectar') || q.includes('cavar') || q.includes('melhor lugar') || q.includes('local')) {
    if (top && gps) {
      const dist = Math.round(haversineMeters(gps, { latitude: top.latitude, longitude: top.longitude }));
      const rumo = bearingLabel(bearing(gps, { latitude: top.latitude, longitude: top.longitude }));
      const legal = top.zoneKind === 'protected' ? ' (⚠️ dentro de área protegida — NÃO explore sem PLG/liberação!)' : '';
      return (
        `O estudo do terreno (elevação, declividade e relevo) indica o ponto mais favorável para ` +
        `${top.mineral} a ~${dist} m na direção ${rumo} (${top.latitude.toFixed(5)}, ${top.longitude.toFixed(5)}), ` +
        `confiança do modelo ∼${Math.round(top.score * 100)}%.${legal} ` +
        `Combine com panela (aluvião) ou batida de veios no local antes de investir em escavação.`
      );
    }
    return (
      `Ainda não há estudo de potencial nesta área. Rode 🔎 "Analisar área" no mapa 3D (ele amostra ` +
      `o relevo e marca em azul as áreas favoráveis) e depois me pergunte de novo. Enquanto isso, para ${ctx.target}, ` +
      `procure ${targetHints(ctx.target)}.`
    );
  }

  if (q.includes('bateia') || q.includes('panela')) {
    return (
      'Bateia/panela: colecione 3–5 kg de material do fundo das drenagens e cavidades, lave em água com ' +
      'movimento circular para descartar o leve, e verifique o concentrado. Ouro aparece como grãos/pirita ' +
      'amarela; diamante sobrevive na fração grossa (0,5–8 mm); minerais pesados escuros merecem análise. ' +
      'Nunca lave em área protegida sem autorização.'
    );
  }

  if (q.includes('ouro') && !q.includes('onde')) {
    return (
      'Para ouro: dê prioridade a (1) aluviões e calhas de drenagens (panela), (2) veios de quartzo com ' +
      'óxidos de ferro "fruta de mina", (3) sulfetos em zonas de cisalhamento (greenstone). Escala simples: ' +
      'veio com vênulas > 3 cm + oxidação amarela/vermelha = amostrar de canal (canaleta). Confirme com ' +
      'ensaio fire assay ou ICP — o app só te orienta, o teor quem diz é o laboratório, sem inventar ouro.'
    );
  }

  if (q.includes('profundidade') || q.includes('profundo') || q.includes('cavar fundo') || q.includes('metro')) {
    return (
      'Profundidade inicial sugerida: em aluvião, poço de 1,5–3 m até o cascalho basal (se houver); em veio, ' +
      'abra canaleta transversal ao veio (30–60 cm) e siga o prolongamento; em solo alterado, 1–2 m com ' +
      'perfuração manual antes de investir em máquina. Adapte à dureza e à estrutura que você observar.'
    );
  }

  if (q.includes('lei') || q.includes('teor') || q.includes('grama')) {
    return (
      'Só laboratório determina teor. Envie amostra de canal com identificação (coordenadas, profundidade, ' +
      'descrição). Para ouro use fire assay (resultado em g/t ou ppm); para base metais use ICP multielementar. ' +
      `Um bom alvo para ${ctx.target} começa com ossatura geológica favorável — o mapa azul te mostra onde.`
    );
  }

  if (q.includes('legal') || q.includes('proibido') || q.includes('plg') || q.includes('permissão') || q.includes('licença')) {
    return (
      `Sua situação legal agora: ${ZONE_STATUS_LABEL[ctx.zoneStatus]}. Área protegida (FUNAI/ICMBio) é ` +
      'bloqueada no app (hard block) — sem PLG válida registrada em Ajustes não há orientação de escavação. ' +
      'Consulte a ANM/FUNAI sobre o título. Legalidade é inegociável: minério encontrado em área irregular ' +
      'não é oportunidade, é crime ambiental e processual.'
    );
  }

  const g = targetGuide(ctx.target);
  return (
    `Sobre ${ctx.target}: ${targetHints(ctx.target)}. ` +
    `${g.sampleAdvice} Se quiser, me pergunte "onde prospectar", "como usar a bateia" ou "profundidade".`
  );
}