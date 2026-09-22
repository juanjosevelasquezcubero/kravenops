import type { MineZone } from '@/types/analysis';

/**
 * Zonas de referência.
 *
 * ⚠️ ATENÇÃO: estes polígonos são DADOS DE DEMONSTRAÇÃO para desenvolvimento.
 * Em produção, substitua pelos shapefiles oficiais:
 *  - Terras Indígenas: FUNAI (https://www.gov.br/funai)
 *  - Unidades de Conservação: ICMBio
 *  - Títulos minerários / PLG: ANM SIGMINE
 *  - Geologia: CPRM / Serviço Geológico do Brasil
 */
export const ZONES: MineZone[] = [
  {
    id: 'demo-ti-alto-claro',
    name: 'Terra Indígena Alto Claro (demonstração)',
    agency: 'FUNAI',
    kind: 'protected',
    source: 'demo',
    polygon: [
      { latitude: -6.31, longitude: -49.62 },
      { latitude: -6.33, longitude: -49.58 },
      { latitude: -6.36, longitude: -49.6 },
      { latitude: -6.35, longitude: -49.66 },
      { latitude: -6.32, longitude: -49.65 },
    ],
  },
  {
    id: 'demo-uc-serrado',
    name: 'Reserva Ambiental do Serrado (demonstração)',
    agency: 'ICMBio',
    kind: 'protected',
    source: 'demo',
    polygon: [
      { latitude: -6.42, longitude: -49.72 },
      { latitude: -6.44, longitude: -49.68 },
      { latitude: -6.47, longitude: -49.7 },
      { latitude: -6.46, longitude: -49.74 },
    ],
  },
  {
    id: 'demo-plg-garimpo-legal',
    name: 'Garimpo Legal – PLG 000/2026 (demonstração)',
    agency: 'ANM',
    kind: 'permitted',
    source: 'demo',
    polygon: [
      { latitude: -6.2, longitude: -49.48 },
      { latitude: -6.23, longitude: -49.5 },
      { latitude: -6.25, longitude: -49.47 },
      { latitude: -6.22, longitude: -49.44 },
    ],
  },
  {
    id: 'demo-livre-oeste',
    name: 'Área Livre Oeste (demonstração)',
    agency: '—',
    kind: 'free',
    source: 'demo',
    polygon: [
      { latitude: -6.12, longitude: -49.55 },
      { latitude: -6.14, longitude: -49.58 },
      { latitude: -6.16, longitude: -49.54 },
      { latitude: -6.15, longitude: -49.51 },
      { latitude: -6.12, longitude: -49.52 },
    ],
  },
];