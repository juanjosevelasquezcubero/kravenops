import type { ObservationInput, ReferenceImage } from '@/types/analysis';

const OPENVERSE_ENDPOINT = 'https://api.openverse.org/v1/images/';
const REQUEST_TIMEOUT_MS = 8000;

const ROCK_TERM: Record<ObservationInput['rockType'], string> = {
  quartzo: 'quartz vein rock',
  xisto: 'schist metamorphic rock',
  granito: 'granite outcrop',
  sedimentar: 'sedimentary rock strata',
  laterita: 'laterite iron oxide soil',
  outro: 'rock outcrop geology',
};

/**
 * Termos de busca derivados da OBSERVAÇÃO ORIGINAL do operador.
 * São termos em inglês (Openverse indexa metadados em inglês).
 */
export function termsFromInput(input: ObservationInput): string[] {
  const terms = [ROCK_TERM[input.rockType] ?? 'rock geology'];
  if (input.sulfide) terms.push('pyrite sulfide ore');
  if (input.alteration) terms.push('limonite oxidation alteration');
  if (input.veining) terms.push('mineral vein quartz');
  if (input.estructura === 'bolsao') terms.push('ore pocket breccia');
  if (input.estructura === 'solo') terms.push('alluvial placer gold panning');
  return terms.slice(0, 3);
}

function stripHtml(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Busca na internet (Openverse — domínio público/CC) imagens de referência mais
 * próximas possíveis da rocha original, usando os termos derivados da observação.
 *
 * ⚠️ As referências servem APENAS como contextualização visual. A conclusão da
 * análise SEMPRE se baseia na foto/vídeo ORIGINAL enviado pelo garimpeiro.
 *
 * Falha graciosamente: sem internet ou erro → retorna [].
 */
export async function searchReferenceImages(
  input: ObservationInput,
  limit = 4,
): Promise<ReferenceImage[]> {
  const q = termsFromInput(input).join(' ');
  const url = `${OPENVERSE_ENDPOINT}?q=${encodeURIComponent(q)}&page_size=${limit}&license_type=commercial&filter_dead=false`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results?: {
        id?: string;
        title?: string;
        url?: string;
        thumbnail?: string;
        creator?: string;
      }[];
    };

    const items: ReferenceImage[] = [];
    for (const r of data.results ?? []) {
      const urlRaw = r.url || r.thumbnail;
      if (!urlRaw) continue;
      if (items.length >= limit) break;
      items.push({
        url: urlRaw,
        title: stripHtml(r.title) || 'Imagem de referência',
        author: r.creator ? stripHtml(r.creator) : undefined,
        thumbnail: r.thumbnail,
      });
    }
    return items;
  } catch {
    return [];
  }
}

/** Bloco para o prompt da IA: referências são apenas contexto, nunca a fonte da conclusão. */
export function buildReferencePromptBlock(refs: ReferenceImage[]): string {
  if (refs.length === 0) return '';
  const urls = refs.map((r) => `- ${r.title}: ${r.url}`).join('\n');
  return `
IMAGENS DE REFERÊNCIA DA INTERNET (APENAS CONTEXTUALIZAÇÃO)
As imagens abaixo foram buscadas na web por similaridade e servem somente como apoio visual.
☠️ NÃO baseie sua conclusão nelas. A SUA CONCLUSÃO DEVE SER BASEADA EXCLUSIVAMENTE NA FOTO/VIDEO ORIGINAL DO OPERADOR.
${urls}`;
}