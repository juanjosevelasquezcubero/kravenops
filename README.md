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

- **🌍 Funciona em qualquer parte do mundo** — radar, GPS, análise e histórico são relativos à
  sua posição atual (projeção equiretangular local, sem dependência de país). As zonas são dados
  de demonstração; carregue os shapefiles do seu país (FUNAI/ICMBio/ANM no BR; USGS/nacionais
  fora) em `src/data/zones.ts`.
- **📡 Radar geofence** — mapa 100% offline (sem tiles, sem API key): posição GPS no centro,
  zonas 🔴🟡🟢, análises anteriores, coordenadas e precisão.
- **🛰️ Precisão total de posição** — GPS em tempo real com `Accuracy.Highest` (atualização a cada
  2 m). **Offline-sem-sinal?** O app usa o *último sinal conhecido* do aparelho e, se nunca
  houve sinal, o *último ponto que você pediu para analisar* (persistido). A origem do fix
  aparece no radar e em cada análise (GPS ao vivo / último sinal / ponto salvo).
- **⛔ Bloqueio legal automático** — dentro de área protegida o app bloqueia a análise e o
  alerta por voz; só libera com PLG registrada nos Ajustes.
- **📷 🎬 Câmera + vídeo** — fotografe o afloramento ou grave a frente de trabalho (vídeo até
  3 min). Marque observações (material, dureza, veios, sulfetos, alteração, estrutura) e receba
  recomendação, rumo, profundidade de teste e confiança.
- **💾 Mídia em escala (imagens e vídeos enormes)** — fotos/vídeos vão para o armazenamento
  **permanente** (Documentos, à prova de limpeza de cache) e o **SQLite guarda só metadados**.
  O banco aguenta milhares de registros de mídia; gerencie espaço em Ajustes → "Mídia e
  armazenamento".
- **🔎 IA + referências web** — com API de visão configurada, o app busca na internet imagens
  similares à sua rocha (Openverse, domínio público/CC) e entrega como **referência de
  comparação** para o engenheiro de minérios. **A conclusão é SEMPRE baseada no estudo da sua
  rocha/vídeo original** — as imagens da web nunca são usadas como fonte do parecer.
- **🤖 Engenheiro de Minérios** — prompt específico (IA de visão) com saída JSON estruturada;
  sem internet entra a heurística offline honesta (não inventa ouro).
- **🔊 Voz em português** — instruções faladas na entrada de zona bloqueada e leitura da
  recomendação.
- **📜 Histórico offline** — análises salvas em SQLite local, com foto/vídeo, referências web,
  fonte do sinal e reprodução por voz.
- **⚙️ Ajustes** — nome do operador, voz on/off, URL/chave da API de visão, registro de
  **PLG por zona** e gerenciador de mídia (tamanho + limpeza).

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