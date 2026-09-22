# KravenOps 🦾🚪

Aplicativo mobile **para garimpo pessoal e legal** — analisa fotos de rochas/cavernas com
um "engenheiro de minérios" (IA de visão + heurística offline), orienta onde cavar e
alerta sobre **áreas protegidas e proibidas** (🔴), com verificação por PLG (permissão de
lavra garimpeira) e funcionamento **offline-first**.

> Stack: Expo SDK 57 · React 19 · React Native 0.86 · TypeScript · Expo Router · SQLite (KV) local

## ⚖️ Regra de ouro do app

| Área | Status | Comportamento |
| --- | --- | --- |
| 🔴 Protegida (FUNAI/ICMBio/UC) | `blocked` | **BLOQUEIO TOTAL** — sem análise, sem orientação de escavação. Alerta sonoro de voz. |
| 🔴 Protegida + PLG válida registrada | `verified` | Liberada (responsabilidade do operador pela legalidade). |
| 🟡 Com título ANM | `permitted` | Opera com PLG registrada. |
| 🟢 Livre | `free` | Operação permitida. |

> Dados de zonas são **demonstração** em `src/data/zones.ts`. Em produção, substitua pelos
> shapefiles oficiais: FUNAI (terras indígenas), ICMBio (unidades de conservação),
> ANM SIGMINE (títulos), CPRM (geologia), USGS MRData.

## 🚀 Rodando o projeto

```bash
npm install        # instala dependências
npx expo start     # abre o dev server (QR code no terminal)
```

Requer **Expo Go** ou dev build. GPS, câmera e voz funcionam em aparelho físico.

## 📱 Funcionalidades (Fase 1 – MVP)

- **📡 Radar geofence** — mapa 100% offline (sem tiles, sem API key): posição GPS no centro,
  zonas 🔴🟡🟢, análises anteriores, coordenadas e precisão.
- **⛔ Bloqueio legal automático** — dentro de área protegida o app bloqueia a análise e o
  alerta por voz; só libera com PLG registrada nos Ajustes.
- **📷 Câmera + Engenheiro de Minérios** — fotografe o afloramento, marque observações
  (material, dureza, veios, sulfetos, alteração, estrutura) e receba recomendação, rumo,
  profundidade de teste e confiança. Com API de visão configurada, usa o **prompt específico**
  do engenheiro; sem internet, usa heurística offline.
- **🔊 Voz em português** — instruções faladas na entrada de zona bloqueada e leitura da
  recomendação.
- **📜 Histórico offline** — análises salvas em SQLite local (expo-sqlite), com detalhes e
  reprodução por voz.
- **⚙️ Ajustes** — nome do operador, voz on/off, URL/chave da API de visão e registro de
  **PLG por zona** (garimpo legal).

## 🗂️ Estrutura

```
src/
  app/          # rotas Expo Router (index=casa, camera, history, settings)
  components/   # radar-map, zone-badge, tabs, themed-*
  data/         # zones.ts (polígonos de demonstração)
  hooks/        # use-geolocation (GPS + status legal da zona)
  services/     # geo (haversine/polygon), storage (SQLite KV),
                # geolocation, mineralEngineer (IA+offline), voice
  types/        # análise, zonas, permissões, configurações
```

## 🧹 Qualidade

```bash
npm run lint       # ESLint
npx tsc --noEmit   # checagem de tipos
npx expo-doctor    # compatibilidade de dependências
```

## 🔮 Próximas fases (visão)

- Shapefiles reais (FUNAI/ICMBio/ANM SIGMINE/CPRM/USGS) + atualização por período.
- Imagery de satélite (Sentinel-2/Landsat) com bandas de alteração mineral (óxidos/argilas).
- Histórico geológico e indicadores de ouro por região.
- Comandos de voz (ditar observações).
- Relatório PLG (geração de documento).
- Integração com laboratórios parceiros (teor de amostras).

---

Criado com [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).