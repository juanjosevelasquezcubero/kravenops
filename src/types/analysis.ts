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
  /** Imagem base64 (opcional, para a IA de visão). */
  imageBase64?: string;
}

export interface AnalysisResult {
  id: string;
  latitude: number;
  longitude: number;
  zone: { id: string; name: string; status: ZoneStatus } | null;
  rockType: string;
  indicators: string[];
  recommendation: string;
  direction: string | null;
  depth: string | null;
  confidence: number;
  source: 'offline' | 'ai';
  timestamp: number;
  imageUri?: string;
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