/** Tipos centrais do KravenOps. */

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Classificação oficial de uma zona. */
export type ZoneKind =
  /** Área protegida por lei (FUNAI, ICMBio, unidades de conservação, fronteiras). Bloqueada sem documento válido. */
  | 'protected'
  /** Área com título/permissão ANM vigente. Operação só com PLG. */
  | 'permitted'
  /** Área livre. Operação permitida. */
  | 'free';

/** Estado calculado de uma zona no ponto atual. */
export type ZoneStatus = 'blocked' | 'verified' | 'permitted' | 'free';

export interface MineZone {
  id: string;
  name: string;
  agency: string;
  kind: ZoneKind;
  source: 'funai' | 'icmbio' | 'sigmine' | 'demo';
  polygon: LatLng[];
}

export interface ZoneProximity {
  zone: MineZone;
  distanceMeters: number;
}

/** Alvo mineral do garimpo — orienta o engenheiro de minérios. */
export type MineralTarget =
  | 'ouro'
  | 'diamante'
  | 'ferro'
  | 'terras raras'
  | 'cobre'
  | 'bauxita'
  | 'geral';

export interface ObservationInput {
  /** Tipo de material observado na frente de trabalho. */
  rockType: 'quartzo' | 'xisto' | 'granito' | 'sedimentar' | 'laterita' | 'outro';
  /** Dureza aparente da rocha. */
  hardness: 'baixa' | 'media' | 'alta';
  /** Foi possível escavar à mão / com ferramenta simples? */
  manualDig: boolean;
  veining: boolean;
  sulfide: boolean;
  alteration: boolean;
  quartz: boolean;
  estructura: 'veio' | 'bolsao' | 'disseminado' | 'solo';
  /** Mineral que você procura. */
  target: MineralTarget;
  /** Imagem base64 (opcional, para a IA de visão). */
  imageBase64?: string;
}

/** Imagem de referência buscada na internet (apenas contextualização). */
export interface ReferenceImage {
  url: string;
  title: string;
  author?: string;
  thumbnail?: string;
}

/** Origem da fixação de geolocalização usada na análise. */
export type FixSource = 'live' | 'last-known' | 'saved-point';

export interface LocationFix {
  source: FixSource;
  /** Precisão do fix em metros, quando conhecida. */
  accuracyMeters: number;
  /** Timestamp do fix. */
  fixedAt: number;
}

export interface AnalysisResult {
  id: string;
  latitude: number;
  longitude: number;
  /** Fix da geolocalização no momento da análise. */
  locationFix?: LocationFix | null;
  zone: { id: string; name: string; status: ZoneStatus } | null;
  rockType: string;
  indicators: string[];
  recommendation: string;
  direction: string | null;
  depth: string | null;
  confidence: number;
  source: 'offline' | 'ai';
  /** URI permanente da foto (Documents, não cache). */
  imageUri?: string;
  /** URI permanente do vídeo (Documents, não cache). */
  videoUri?: string;
  /** Referências da internet (somente comparação — conclusão vem da rocha original). */
  references?: ReferenceImage[];
  timestamp: number;
}

export interface PermitRecord {
  zoneId: string;
  plgNumber: string;
  holder: string;
  addedAt: number;
}

export interface AppSettings {
  operatorName: string;
  voiceEnabled: boolean;
  apiUrl: string;
  apiKey: string;
}

/** Último ponto de análise solicitado pelo operador (fallback offline). */
export interface SavedFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  fixedAt: number;
}